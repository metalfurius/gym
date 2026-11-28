import { doc, getDocFromServer } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { assertMutationOwner, runOwnedTransaction } from './owned-transaction.js';
import { localFirstCache } from './local-first-cache.js';
import { captureAccountScope } from './account-scope.js';
import { firebaseUsageTracker } from './firebase-usage-tracker.js';

export function sessionRevisionRef(db, userId) {
    return doc(db, 'users', userId, 'app_data', 'session_revision');
}

export function sessionMutationReceiptRef(db, userId, sessionId, kind) {
    return doc(db, 'users', userId, 'session_mutations', sessionId, 'receipts', kind);
}

function validReceipt(snapshot, sessionId, kind) {
    const value = snapshot.data();
    return snapshot.exists() && Object.keys(value || {}).length === 4 && value.sessionId === sessionId && value.kind === kind
        && typeof value.changed === 'boolean' && Number.isInteger(value.revision) && value.revision >= 0;
}

// The revision and the session change commit together. A bounded history reader
// can verify its revision in a later outcome transaction without reading every
// session in that transaction. This is also the foundation for saved editing.
export async function writeSessionDocument(db, userId, sessionId, data, { remove = false } = {}) {
    if (typeof sessionId !== 'string' || !sessionId || sessionId.includes('/')) throw new Error('Session mutation requires a persisted identity');
    const scope = captureAccountScope(userId, { mutations: false });
    assertMutationOwner(userId, scope);
    const result = await localFirstCache.withSessionMutation(userId, () => {
        assertMutationOwner(userId, scope);
        return runOwnedTransaction(db, userId, async (transaction, assertOwner) => {
            const reference = doc(db, 'users', userId, 'sesiones_entrenamiento', sessionId);
            const revisionRef = sessionRevisionRef(db, userId);
            const createRef = sessionMutationReceiptRef(db, userId, sessionId, 'create');
            const deleteRef = sessionMutationReceiptRef(db, userId, sessionId, 'delete');
            const [session, revision, created, deleted] = await Promise.all([
                transaction.get(reference), transaction.get(revisionRef), transaction.get(createRef), transaction.get(deleteRef),
            ]);
            assertOwner();
            if (created.exists() && !validReceipt(created, sessionId, 'create')) throw new Error('Invalid session create receipt');
            if (deleted.exists() && !validReceipt(deleted, sessionId, 'delete')) throw new Error('Invalid session delete receipt');
            // Receipts survive the session document. A delayed create cannot
            // resurrect an identity already deleted, including legacy IDs.
            if (deleted.exists() || (!remove && created.exists())) return { changed: false, sessionId };
            const previousRevision = revision.data()?.revision;
            const currentRevision = Number.isInteger(previousRevision) && previousRevision >= 0 ? previousRevision : 0;
            const changed = remove ? session.exists() : !session.exists();
            const nextRevision = currentRevision + (changed ? 1 : 0);
            transaction.set(remove ? deleteRef : createRef, { sessionId, kind: remove ? 'delete' : 'create', changed, revision: nextRevision });
            // A no-op also gets an immutable receipt. In particular, deleting
            // an absent ID fences any older create still in flight.
            if (!changed) return { changed: false, sessionId };
            if (remove) transaction.delete(reference);
            else transaction.set(reference, data);
            transaction.set(revisionRef, { revision: nextRevision, lastSessionId: sessionId });
            return { changed: true, sessionId };
        }, 'session.mutation', { revisionRef: sessionRevisionRef(db, userId) });
    }, { sessionId, kind: remove ? 'delete' : 'create' });
    return { ...result, invalidationVerified: true };
}

export async function recoverSessionInvalidations(db, userId) {
    const scope = captureAccountScope(userId, { mutations: false });
    const isCurrent = () => {
        try { assertMutationOwner(userId, scope); return true; } catch { return false; }
    };
    try {
        return await localFirstCache.recoverSessionInvalidations(userId, async mutation => {
            if (!isCurrent() || !['create', 'delete'].includes(mutation.kind)
                || typeof mutation.sessionId !== 'string' || mutation.sessionId.includes('/')) return false;
            const kinds = mutation.kind === 'create' ? ['create', 'delete'] : ['delete'];
            const receipts = await Promise.all(kinds.map(kind => getDocFromServer(sessionMutationReceiptRef(db, userId, mutation.sessionId, kind))));
            firebaseUsageTracker.trackRead(receipts.length, 'sync.cacheRecovery');
            if (!isCurrent() || receipts.some(snapshot => snapshot.metadata?.fromCache === true || snapshot.metadata?.hasPendingWrites === true)) return false;
            // Receipt/tombstone existence proves the original intent is settled
            // or permanently fenced, even after the session has been deleted.
            return receipts.some((snapshot, index) => validReceipt(snapshot, mutation.sessionId, kinds[index]));
        }, isCurrent);
    } catch {
        // Offline/unavailable storage keeps the durable barrier and limited UI.
        return 0;
    }
}
