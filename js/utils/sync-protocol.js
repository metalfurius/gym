import { doc, getDocFromServer } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { assertMutationOwner, runOwnedTransaction } from './owned-transaction.js';
import { captureAccountScope } from './account-scope.js';
import { firebaseUsageTracker } from './firebase-usage-tracker.js';
import { SYNC_PROTOCOL_VERSION, SYNC_PROTOCOL_EPOCH, syncProtocolGlobalRef, syncProtocolUserRef,
    isSyncProtocolPolicy, isSessionRevision } from './sync-protocol-contract.js';
export { SYNC_PROTOCOL_VERSION, SYNC_PROTOCOL_EPOCH, syncProtocolGlobalRef, syncProtocolUserRef,
    matchesSyncProtocol, isSyncProtocolPolicy, isSessionRevision } from './sync-protocol-contract.js';

export async function verifyAccountSyncProtocol(db, userId) {
    // The global document is admin-owned. A cache hit or a client-written UID
    // document alone is not proof that the server rejects unversioned writers.
    const scope = captureAccountScope(userId, { mutations: false });
    try {
        assertMutationOwner(userId, scope);
        const global = await getDocFromServer(syncProtocolGlobalRef(db));
        firebaseUsageTracker.trackRead(1, 'sync.protocol.serverProof');
        assertMutationOwner(userId, scope);
        if (!global.exists() || !isSyncProtocolPolicy(global.data())
            || global.metadata?.fromCache === true || global.metadata?.hasPendingWrites === true) return null;
        return await runOwnedTransaction(db, userId, async (transaction, assertOwner) => {
            const markerRef = doc(db, 'users', userId, 'app_data', 'session_revision');
            const policyRef = syncProtocolUserRef(db, userId);
            const [currentGlobal, policy, marker] = await Promise.all([
                transaction.get(syncProtocolGlobalRef(db)), transaction.get(policyRef), transaction.get(markerRef),
            ]);
            assertOwner();
            if (!currentGlobal.exists() || !isSyncProtocolPolicy(currentGlobal.data())) return null;
            if (policy.exists()) {
                if (!isSyncProtocolPolicy(policy.data()) || !marker.exists() || !isSessionRevision(marker.data())) return null;
            } else {
                const oldRevision = marker.data()?.revision;
                transaction.set(policyRef, { version: SYNC_PROTOCOL_VERSION, epoch: SYNC_PROTOCOL_EPOCH });
                transaction.set(markerRef, { revision: Number.isInteger(oldRevision) && oldRevision >= 0 ? oldRevision : 0, lastSessionId: null });
            }
            return { userId, version: SYNC_PROTOCOL_VERSION, epoch: SYNC_PROTOCOL_EPOCH };
        }, 'sync.protocol');
    } catch {
        // History can still render; finalization remains disabled without proof.
        return null;
    }
}
