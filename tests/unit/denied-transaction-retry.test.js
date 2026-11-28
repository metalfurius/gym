import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { __firestoreState, __resetMockFirebase, MockTimestamp } from '../mocks/firebase-state.js';
import { __getMockTransactionAttempts, __resetMockFirestoreBehavior, __setMockTransactionAuthorization, __setMockDocumentResultHandler } from '../mocks/firebase-firestore.js';
import { beginAccountSession } from '../../js/utils/account-scope.js';
import { seedSyncProtocol } from '../utils/sync-protocol-fixture.js';
import { OfflineManager } from '../../js/utils/offline-manager.js';
import { localFirstCache } from '../../js/utils/local-first-cache.js';

let user;
jest.unstable_mockModule('../../js/auth.js', () => ({ getCurrentUser: () => user }));
const { writeSessionDocument } = await import('../../js/utils/session-store.js');
const { createWeeklyTargetOperation, persistWeeklyTargetOperation, persistWeeklyOutcomes, normalizeWeeklyState } = await import('../../js/utils/weekly-preferences.js');
const uid = 'denied-owner';
const marker = `users/${uid}/app_data/session_revision`;
const preferences = `users/${uid}/app_data/user_preferences`;
const session = `users/${uid}/sesiones_entrenamiento/immutable-id`;
const originalIso = '2026-11-20T12:34:56.789Z';
const denied = () => Object.assign(new Error('Missing or insufficient permissions'), { code: 'permission-denied' });
const current = () => normalizeWeeklyState(__firestoreState.documents.get(preferences) || {});
function advanceSession() {
    const revision = __firestoreState.documents.get(marker).revision + 1;
    const id = `other-${revision}`;
    __firestoreState.documents.set(`users/${uid}/sesiones_entrenamiento/${id}`, { userId: uid });
    __firestoreState.documents.set(`users/${uid}/session_mutations/${id}/receipts/create`, { sessionId: id, kind: 'create', changed: true, revision });
    __firestoreState.documents.set(marker, { revision, lastSessionId: id });
}

describe('bounded retry after rules denial and proven concurrent revision', () => {
    let proof;
    beforeEach(async () => {
        __resetMockFirebase(); __resetMockFirestoreBehavior();
        user = { uid }; beginAccountSession(uid); proof = seedSyncProtocol(uid, { activated: true });
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
        await localFirstCache.clearAll();
    });

    it('retries the exact session intent only after a higher server revision and current fence', async () => {
        const attempts = []; const proofReads = []; let rejected = false;
        __setMockDocumentResultHandler((snapshot, ref) => { proofReads.push(ref.path); return snapshot; });
        __setMockTransactionAuthorization(({ writes }) => {
            const own = writes.find(write => write.reference.path === session);
            if (!own) return;
            attempts.push({ id: own.reference.path, iso: own.value.fecha.toDate().toISOString() });
            if (!rejected) { rejected = true; advanceSession(); throw denied(); }
        });
        await writeSessionDocument({}, uid, 'immutable-id', Object.freeze({ userId: uid, fecha: MockTimestamp.fromDate(new Date(originalIso)) }));
        expect(attempts).toEqual([{ id: session, iso: originalIso }, { id: session, iso: originalIso }]);
        expect(__firestoreState.documents.get(marker).revision).toBe(2);
        expect(proofReads).toEqual([marker, 'runtime_config/sync_protocol', `users/${uid}/app_data/sync_protocol`]);
    });

    it.each(['equal revision', 'missing policy', 'wrong epoch', 'cached counter', 'cached policy'])('preserves permanent denial when proof has %s', async reason => {
        const failure = denied();
        __setMockTransactionAuthorization(() => { if (reason !== 'equal revision') advanceSession(); throw failure; });
        if (reason === 'missing policy') __firestoreState.documents.delete(`users/${uid}/app_data/sync_protocol`);
        if (reason === 'wrong epoch') __firestoreState.documents.set('runtime_config/sync_protocol', { version: 1, epoch: 'other' });
        __setMockDocumentResultHandler((snapshot, ref) => {
            const cached = reason === 'cached counter' ? ref.path === marker
                : reason === 'cached policy' && ref.path === `users/${uid}/app_data/sync_protocol`;
            return cached ? { ...snapshot, metadata: { fromCache: true, hasPendingWrites: false } } : snapshot;
        });
        await expect(writeSessionDocument({}, uid, 'immutable-id', { userId: uid })).rejects.toBe(failure);
        expect(__getMockTransactionAttempts()).toBe(1);
        expect(__firestoreState.documents.has(session)).toBe(false);
    });

    it('rejects an auth generation change during the denial proof, including A -> B -> A', async () => {
        __setMockTransactionAuthorization(() => { advanceSession(); throw denied(); });
        __setMockDocumentResultHandler((snapshot, ref) => {
            if (ref.path === marker) { user = { uid: 'B' }; beginAccountSession('B'); user = { uid }; beginAccountSession(uid); }
            return snapshot;
        });
        await expect(writeSessionDocument({}, uid, 'immutable-id', { userId: uid })).rejects.toMatchObject({ code: 'sync/owner-changed' });
        expect(__getMockTransactionAttempts()).toBe(1);
    });

    it('revalidates the fence in the retried transaction if policy changes after the server proof', async () => {
        const failure = denied(); let rejected = false;
        __setMockTransactionAuthorization(() => { if (!rejected) { rejected = true; advanceSession(); throw failure; } });
        __setMockDocumentResultHandler((snapshot, ref) => {
            if (ref.path === `users/${uid}/app_data/sync_protocol`) __firestoreState.documents.set('runtime_config/sync_protocol', { version: 1, epoch: 'changed-after-proof' });
            return snapshot;
        });
        await expect(writeSessionDocument({}, uid, 'immutable-id', { userId: uid })).rejects.toBe(failure);
        expect(__getMockTransactionAttempts()).toBe(2);
        expect(__firestoreState.documents.has(session)).toBe(false);
    });

    it('retains an exhausted same-ID/timestamp intent durably for its owner after exactly three attempts', async () => {
        __setMockTransactionAuthorization(() => { advanceSession(); throw denied(); });
        const manager = new OfflineManager(); manager.setActiveUser(uid);
        const descriptor = { type: 'session.save', payload: { userId: uid, sessionId: 'immutable-id', sessionData: { fechaIso: originalIso } } };
        await expect(manager.executeWithOfflineHandling(() => writeSessionDocument({}, uid, 'immutable-id', { userId: uid }), 'save', true, descriptor))
            .rejects.toMatchObject({ code: 'sync/queued' });
        expect(__getMockTransactionAttempts()).toBe(3);
        const enqueuedAt = manager.pendingOperations[0].timestamp;
        localFirstCache.memoryCache.clear();
        const cold = new OfflineManager(); cold.setActiveUser('B'); await cold.restorePersistedQueue();
        expect(cold.getPendingCount()).toBe(0); cold.setActiveUser(uid);
        expect(cold.getPendingCount()).toBe(1); expect(cold.pendingOperations[0].descriptor).toEqual(descriptor);
        expect(cold.pendingOperations[0].timestamp).toBe(enqueuedAt);
        __setMockTransactionAuthorization(null);
        cold.registerOperationHandler('session.save', payload => writeSessionDocument({}, payload.userId, payload.sessionId,
            { userId: payload.userId, fecha: MockTimestamp.fromDate(new Date(payload.sessionData.fechaIso)) }));
        await cold.processPendingOperations();
        expect(cold.getPendingCount()).toBe(0);
        expect(__firestoreState.documents.get(session).fecha.toDate().toISOString()).toBe(originalIso);
    });

    it.each(['different week', 'same week'])('keeps the immutable weekly base on denial retry for %s', async scenario => {
        const firstWeek = '2026-11-09';
        const original = createWeeklyTargetOperation(uid, firstWeek, 4, null, originalIso);
        const before = JSON.stringify(original); let rejected = false;
        __setMockTransactionAuthorization(async ({ writes }) => {
            if (rejected || !writes.some(write => write.reference.path === preferences)) return;
            rejected = true;
            await persistWeeklyTargetOperation({}, createWeeklyTargetOperation(uid, scenario === 'same week' ? firstWeek : '2026-11-16', 6, null, '2026-11-20T12:35:00.000Z'));
            throw denied();
        });
        if (scenario === 'same week') await expect(persistWeeklyTargetOperation({}, original)).rejects.toMatchObject({ code: 'sync/conflict' });
        else await persistWeeklyTargetOperation({}, original);
        expect(JSON.stringify(original)).toBe(before);
        expect(current().weeklyTargetsByWeek[firstWeek].targetSessions).toBe(scenario === 'same week' ? 6 : 4);
        if (scenario === 'different week') expect(current().weeklyTargetsByWeek['2026-11-16'].targetSessions).toBe(6);
    });

    it('revalidates finalization targets after a proven preferences denial instead of freezing the old expected value', async () => {
        await persistWeeklyTargetOperation({}, createWeeklyTargetOperation(uid, '2026-11-09', 4, null, originalIso));
        const expected = current().weeklyTargetsByWeek; let rejected = false;
        __setMockTransactionAuthorization(async ({ writes }) => {
            if (rejected || !writes.some(write => write.reference.path === preferences)) return;
            rejected = true;
            await persistWeeklyTargetOperation({}, createWeeklyTargetOperation(uid, '2026-11-09', 6, current().weeklyTargetsByWeek['2026-11-09'], '2026-11-20T13:00:00.000Z'));
            throw denied();
        });
        const result = await persistWeeklyOutcomes({}, uid, { '2026-11-09': { targetSessions: 4, sessionCount: 4, activeDays: 1, met: true } },
            expected, { complete: true, sessionRevision: 0, protocolProof: proof, nowIso: '2026-11-20T14:00:00.000Z' });
        expect(result.changed).toBe(false); expect(current().weeklyOutcomesByWeek['2026-11-09']).toBeUndefined();
        expect(current().weeklyTargetsByWeek['2026-11-09'].targetSessions).toBe(6);
        expect(current().updatedAtIso).toBe('2026-11-20T13:00:00.000Z');
    });

    it('performs no denial proof reads on an ordinary successful transaction', async () => {
        const read = jest.fn(snapshot => snapshot); __setMockDocumentResultHandler(read);
        await writeSessionDocument({}, uid, 'immutable-id', { userId: uid });
        expect(read).not.toHaveBeenCalled();
    });
});
