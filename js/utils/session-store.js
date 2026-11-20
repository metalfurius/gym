import { doc } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { runOwnedTransaction } from './owned-transaction.js';

export function sessionRevisionRef(db, userId) {
    return doc(db, 'users', userId, 'app_data', 'session_revision');
}

// The revision and the session change commit together. A bounded history reader
// can verify its revision in a later outcome transaction without reading every
// session in that transaction. This is also the foundation for saved editing.
export async function writeSessionDocument(db, userId, sessionId, data, { remove = false } = {}) {
    if (!sessionId || sessionId.includes('/')) throw new Error('Session mutation requires a persisted identity');
    return runOwnedTransaction(db, userId, async (transaction, assertOwner) => {
        const reference = doc(db, 'users', userId, 'sesiones_entrenamiento', sessionId);
        const revisionRef = sessionRevisionRef(db, userId);
        const [session, revision] = await Promise.all([transaction.get(reference), transaction.get(revisionRef)]);
        assertOwner();
        if (remove ? !session.exists() : session.exists()) return { changed: false, sessionId };
        if (remove) transaction.delete(reference);
        else transaction.set(reference, data);
        transaction.set(revisionRef, { revision: (revision.data()?.revision || 0) + 1 });
        return { changed: true, sessionId };
    }, 'session.mutation');
}
