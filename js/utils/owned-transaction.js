import { runTransaction, getDocFromServer } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { getCurrentUser } from '../auth.js';
import { captureAccountScope, isAccountScopeCurrent } from './account-scope.js';
import { firebaseUsageTracker } from './firebase-usage-tracker.js';
import { isSyncProtocolPolicy, syncProtocolGlobalRef, syncProtocolUserRef } from './sync-protocol-contract.js';

const MAX_DENIED_ATTEMPTS = 3;
const authoritative = snapshot => snapshot.metadata?.fromCache !== true && snapshot.metadata?.hasPendingWrites !== true;
const revisionValue = (snapshot, field) => {
    const value = snapshot.data()?.[field];
    return Number.isInteger(value) && value >= 0 ? value : 0;
};

async function canRetryRevisionDenied(db, userId, scope, revisionRef, field, observed, label) {
    assertMutationOwner(userId, scope);
    try {
        const current = await getDocFromServer(revisionRef);
        firebaseUsageTracker.trackRead?.(1, `${label}.deniedProof`);
        assertMutationOwner(userId, scope);
        if (!authoritative(current) || revisionValue(current, field) <= observed) return false;
        const [global, policy] = await Promise.all([
            getDocFromServer(syncProtocolGlobalRef(db)), getDocFromServer(syncProtocolUserRef(db, userId)),
        ]);
        firebaseUsageTracker.trackRead?.(2, `${label}.deniedProof`);
        assertMutationOwner(userId, scope);
        return global.exists() && policy.exists() && authoritative(global) && authoritative(policy)
            && isSyncProtocolPolicy(global.data()) && isSyncProtocolPolicy(policy.data(), global.data());
    } catch (error) {
        assertMutationOwner(userId, scope);
        if (error.code === 'sync/owner-changed') throw error;
        return false;
    }
}

export function assertMutationOwner(userId, scope = null) {
    if (!userId || getCurrentUser()?.uid !== userId
        || (scope && !isAccountScopeCurrent(scope, getCurrentUser()?.uid))) {
        const error = new Error('Operation belongs to a different account session');
        error.code = 'sync/owner-changed';
        throw error;
    }
}

// Reducers must be side-effect free: Firestore may execute them again when any
// read document changes. No cache/UI writes belong inside a transaction callback.
export async function runOwnedTransaction(db, userId, reducer, label = 'sync.transaction', { revisionRef, revisionField = 'revision' } = {}) {
    const scope = captureAccountScope(userId, { mutations: false });
    assertMutationOwner(userId, scope);
    let lastDenied;
    for (let attempt = 1; attempt <= MAX_DENIED_ATTEMPTS; attempt++) {
        let committedWrites = 0; let observed = null;
        try {
            const result = await runTransaction(db, async transaction => {
                assertMutationOwner(userId, scope);
                committedWrites = 0; observed = null;
                const measured = {
                    async get(reference) {
                        const snapshot = await transaction.get(reference);
                        if (revisionRef?.path === reference.path) observed = revisionValue(snapshot, revisionField);
                        firebaseUsageTracker.trackRead?.(1, `${label}.read`);
                        return snapshot;
                    },
                    set(...args) { committedWrites++; return transaction.set(...args); },
                    delete(...args) { committedWrites++; return transaction.delete(...args); },
                };
                if (attempt > 1) {
                    // Only a denial recovery pays these reads. Keep the fence
                    // in the transaction's read set through the retry commit.
                    const [global, policy] = await Promise.all([
                        measured.get(syncProtocolGlobalRef(db)), measured.get(syncProtocolUserRef(db, userId)),
                    ]);
                    assertMutationOwner(userId, scope);
                    if (!global.exists() || !policy.exists() || !isSyncProtocolPolicy(global.data())
                        || !isSyncProtocolPolicy(policy.data(), global.data())) throw lastDenied;
                }
                return reducer(measured, () => assertMutationOwner(userId, scope));
            }, { maxAttempts: 5 });
            if (committedWrites) firebaseUsageTracker.trackWrite(committedWrites, `${label}.commit`);
            return result;
        } catch (error) {
            const denied = ['permission-denied', 'firestore/permission-denied'].includes(error.code);
            if (!denied || !revisionRef || observed === null
                || !await canRetryRevisionDenied(db, userId, scope, revisionRef, revisionField, observed, label)) throw error;
            lastDenied = error;
            if (attempt === MAX_DENIED_ATTEMPTS) {
                const exhausted = new Error('Concurrent synchronization is still busy; original intent retained for retry', { cause: error });
                exhausted.code = 'sync/retry-exhausted'; exhausted.userId = userId;
                throw exhausted;
            }
        }
    }
}
