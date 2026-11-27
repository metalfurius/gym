import { __firestoreState } from '../mocks/firebase-state.js';

export function seedSyncProtocol(userId, { activated = false, revision = 0 } = {}) {
    // Independent fixture for the reviewed server contract; do not bootstrap app.
    const policy = { version: 1, epoch: 'gym-sync-v1-2026-11' };
    __firestoreState.documents.set('runtime_config/sync_protocol', policy);
    if (activated) {
        __firestoreState.documents.set(`users/${userId}/app_data/sync_protocol`, { ...policy });
        __firestoreState.documents.set(`users/${userId}/app_data/session_revision`, { revision, lastSessionId: null });
    }
    return { userId, ...policy };
}
