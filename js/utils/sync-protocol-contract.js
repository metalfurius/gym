import { doc } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

export const SYNC_PROTOCOL_VERSION = 1;
export const SYNC_PROTOCOL_EPOCH = 'gym-sync-v1-2026-11';
export const syncProtocolGlobalRef = db => doc(db, 'runtime_config', 'sync_protocol');
export const syncProtocolUserRef = (db, userId) => doc(db, 'users', userId, 'app_data', 'sync_protocol');

export function matchesSyncProtocol(value, expected = null) {
    return value?.version === SYNC_PROTOCOL_VERSION && value?.epoch === SYNC_PROTOCOL_EPOCH
        && (!expected || (expected.version === value.version && expected.epoch === value.epoch));
}

export function isSyncProtocolPolicy(value, expected = null) {
    return matchesSyncProtocol(value, expected) && Object.keys(value).length === 2;
}

export function isSessionRevision(value) {
    return !!value && Object.keys(value).length === 2 && Number.isInteger(value.revision) && value.revision >= 0
        && (value.lastSessionId === null || (typeof value.lastSessionId === 'string' && value.lastSessionId.length > 0));
}
