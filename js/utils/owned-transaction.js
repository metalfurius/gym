import { runTransaction } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { getCurrentUser } from '../auth.js';
import { captureAccountScope, isAccountScopeCurrent } from './account-scope.js';
import { firebaseUsageTracker } from './firebase-usage-tracker.js';

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
export async function runOwnedTransaction(db, userId, reducer, label = 'sync.transaction') {
    const scope = captureAccountScope(userId, { mutations: false });
    assertMutationOwner(userId, scope);
    let committedWrites = 0;
    const result = await runTransaction(db, async transaction => {
        assertMutationOwner(userId, scope);
        committedWrites = 0;
        const measured = {
            async get(reference) {
                const snapshot = await transaction.get(reference);
                firebaseUsageTracker.trackRead?.(1, `${label}.read`);
                return snapshot;
            },
            set(...args) { committedWrites++; return transaction.set(...args); },
            delete(...args) { committedWrites++; return transaction.delete(...args); },
        };
        return reducer(measured, () => assertMutationOwner(userId, scope));
    });
    if (committedWrites) firebaseUsageTracker.trackWrite(committedWrites, `${label}.commit`);
    return result;
}
