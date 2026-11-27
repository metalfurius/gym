import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { __authState, __firestoreState, __notifyAuthListeners, __resetMockFirebase } from '../mocks/firebase-state.js';
import { __resetMockFirestoreBehavior } from '../mocks/firebase-firestore.js';
import { mountAppDom, waitForUi, field } from '../utils/app-harness.js';
import { seedSyncProtocol } from '../utils/sync-protocol-fixture.js';
import { setCalendarClock } from '../../js/utils/calendar-clock.js';
import { localFirstCache } from '../../js/utils/local-first-cache.js';
import { offlineManager } from '../../js/utils/offline-manager.js';

const routine = { id: 'r', name: 'Durable capture', exercises: [{ name: 'Bench', type: 'strength', sets: 1, reps: '8', executionMode: 'pulley' }] };
const primary = 'gymTracker_inProgressSession:A'; const mirror = 'gymTracker_inProgressSession';
const backup = 'gym-tracker-backup-session';
const online = value => Object.defineProperty(navigator, 'onLine', { configurable: true, value });
const sessions = () => [...__firestoreState.documents].filter(([key]) => key.startsWith('users/A/sesiones_entrenamiento/'));
let capture; let version;
async function auth(uid) { __authState.currentUser = uid ? { uid, email: `${uid}@example.test` } : null; await __notifyAuthListeners(); await waitForUi(20); }
async function coldMemory() {
    await auth(null); await offlineManager.queuePersistenceTail;
    offlineManager.pendingOperations = []; offlineManager.knownIntents.clear(); offlineManager.retiredIntents.clear();
    offlineManager.acknowledged.clear(); offlineManager.pendingAcknowledgements.clear(); offlineManager.acknowledgementOutcomes.clear();
    offlineManager.stagedIds.clear(); offlineManager.unknownIds.clear(); offlineManager.rpcSucceededIds.clear();
    localFirstCache.memoryCache.clear(); await auth('A');
}
async function start() {
    await capture.startSession('r', [routine]);
    field('input[name="weight-0-0"]', '62.5'); field('input[name="reps-0-0"]', '8'); field('#user-weight', '75.3');
}
async function resume() {
    await capture.checkAndOfferResumeSession([routine]);
    await document.getElementById('resume-session-btn').onclick?.();
}
describe('actual app durable capture identity through stale draft recovery', () => {
    beforeAll(async () => {
        __resetMockFirebase(); mountAppDom(); online(true); setCalendarClock(() => new Date(2026, 10, 27, 12));
        await import('../../js/app.js'); capture = await import('../../js/modules/session-manager.js'); version = await import('../../js/version-manager.js');
        document.dispatchEvent(new Event('DOMContentLoaded')); await waitForUi(40);
    });
    beforeEach(async () => {
        __resetMockFirestoreBehavior(); online(true); await auth(null); offlineManager.clearPending(); await offlineManager.persistQueue();
        await localFirstCache.clearAll(); localStorage.removeItem(primary); localStorage.removeItem(mirror); localStorage.removeItem(backup);
        __firestoreState.documents.clear(); seedSyncProtocol('A', { activated: true }); await auth('A');
    });
    afterAll(async () => { online(true); await auth(null); setCalendarClock(); jest.restoreAllMocks(); });

    it.each([primary, mirror].flatMap(key => [false, true].flatMap(acknowledged => [false, true].map(cold => ({ key, acknowledged, cold })))))(
        'never reoffers/replays a consumed physical draft $key (ACK=$acknowledged cold=$cold)', async ({ key, acknowledged, cold }) => {
            await start(); const captureId = capture.loadInProgressSession().captureId; online(false);
            const remove = Storage.prototype.removeItem;
            const fault = jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(function(candidate) {
                if (candidate === key) throw new Error('Injected consumed draft deletion failure'); return remove.call(this, candidate);
            });
            let saved;
            try { saved = await capture.saveSessionData(); } finally { fault.mockRestore(); }
            expect(saved).toMatchObject({ ok: true, queued: true, sessionId: captureId });
            const stale = JSON.parse(localStorage.getItem(key));
            expect(stale.captureId).toBe(captureId); expect(stale.submission.payload.sessionId).toBe(captureId);
            const [intent] = (await offlineManager.outbox.read()).entries.filter(entry => entry.descriptor.type === 'session.save');
            expect(stale.submission).toEqual({ queueId: intent.id, payload: intent.descriptor.payload });
            if (acknowledged) { online(true); await offlineManager.processPendingOperations(); online(false); }
            if (cold) await coldMemory();
            await resume(); await capture.saveSessionData();
            expect(capture.getCurrentRoutineForSession()).toBeNull();
            expect(document.getElementById('resume-session-btn').classList.contains('hidden')).toBe(true);
            online(true); await offlineManager.processPendingOperations();
            expect(sessions()).toHaveLength(1); expect(sessions()[0][1].sessionId).toBe(captureId);
            expect(sessions()[0][1].fecha.toDate().toISOString()).toBe(stale.submission.payload.sessionData.fechaIso);
        }
    );

    it.each([primary, mirror])('does not enqueue/RPC when write-ahead identity fails at %s, and retries the identical payload', async key => {
        await start(); online(false); const set = Storage.prototype.setItem;
        const fault = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function(candidate, value) {
            if (candidate === key) throw new Error('Injected capture write-ahead failure'); return set.call(this, candidate, value);
        });
        try { expect((await capture.saveSessionData())?.ok).not.toBe(true); } finally { fault.mockRestore(); }
        expect(capture.getCurrentRoutineForSession()?.id).toBe('r');
        expect((await offlineManager.outbox.read()).entries.filter(entry => entry.descriptor.type === 'session.save')).toHaveLength(0);
        expect(sessions()).toHaveLength(0);
        const snapshot = JSON.parse(localStorage.getItem(primary))?.submission || JSON.parse(localStorage.getItem(mirror))?.submission;
        const retry = await capture.saveSessionData(); expect(retry).toMatchObject({ ok: true, queued: true });
        const [intent] = (await offlineManager.outbox.read()).entries.filter(entry => entry.descriptor.type === 'session.save');
        if (snapshot) expect(intent.descriptor.payload).toEqual(snapshot.payload);
        online(true); await offlineManager.processPendingOperations(); expect(sessions()).toHaveLength(1);
    });

    it('preserves a PWA5 no-ID backup through synchronous restoration, then migrates only on explicit Resume', async () => {
        const legacy = { routineId: 'r', timestamp: 1700000000000, data: { pesoUsuario: 75.3, ejercicios: [{ nombreEjercicio: 'Bench', tipoEjercicio: 'strength', modoEjecucion: 'pulley', tipoCarga: 'external', sets: [{ peso: 62.5, reps: 8 }] }] } };
        localStorage.setItem(backup, JSON.stringify(legacy));
        expect(version.checkForBackupSession()).toBe(true);
        expect(capture.loadInProgressSession()).toBeNull();
        await capture.checkAndOfferResumeSession([routine]);
        expect(JSON.parse(localStorage.getItem(mirror))).not.toHaveProperty('captureId');
        await document.getElementById('resume-session-btn').onclick();
        const adopted = capture.loadInProgressSession(); expect(adopted).toMatchObject({ ownerId: 'A', captureId: expect.stringMatching(/^session-/), timestamp: legacy.timestamp, data: legacy.data });
        expect(document.querySelector('input[name="weight-0-0"]').value).toBe('62.5');
        expect(document.querySelector('select[name="session-execution-mode"]').value).toBe('pulley');
        online(false); await capture.saveSessionData(); online(true); await offlineManager.processPendingOperations();
        expect(sessions()).toHaveLength(1); expect(sessions()[0][1]).toMatchObject({ sessionId: adopted.captureId, pesoUsuario: 75.3 });
    });

    it('blocks a legacy Resume whose identity cannot reach the compatibility mirror, retaining the original data', async () => {
        const legacy = { routineId: 'r', timestamp: 1700000000000, data: { ejercicios: [{ sets: [{ peso: 62.5, reps: 8 }] }] } };
        localStorage.setItem(mirror, JSON.stringify(legacy)); await capture.checkAndOfferResumeSession([routine]);
        const set = Storage.prototype.setItem;
        const fault = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function(candidate, value) {
            if (candidate === mirror) throw new Error('Injected migration failure'); return set.call(this, candidate, value);
        });
        try { await document.getElementById('resume-session-btn').onclick(); } finally { fault.mockRestore(); }
        expect(capture.getCurrentRoutineForSession()).toBeNull(); expect(JSON.parse(localStorage.getItem(mirror))).toEqual(legacy);
        expect((await offlineManager.outbox.read()).entries.filter(entry => entry.descriptor.type === 'session.save')).toHaveLength(0);
        await resume(); expect(capture.getCurrentRoutineForSession()?.id).toBe('r');
    });

    it('does not offer a consumed draft restored synchronously from a PWA update backup after cold auth', async () => {
        await start(); const snapshot = capture.loadInProgressSession(); online(false);
        await capture.saveSessionData(); online(true); await offlineManager.processPendingOperations(); online(false);
        localStorage.setItem(backup, JSON.stringify(snapshot)); await coldMemory();
        version.checkForBackupSession(); await resume();
        expect(capture.getCurrentRoutineForSession()).toBeNull();
        online(true); await offlineManager.processPendingOperations(); expect(sessions()).toHaveLength(1);
    });

    it('will not reuse a write-ahead queue/session ID for changed form data after partial persistence', async () => {
        await start(); online(false); const set = Storage.prototype.setItem;
        const fault = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function(key, value) {
            if (key === mirror) throw new Error('Injected partial draft write'); return set.call(this, key, value);
        });
        try { await capture.saveSessionData(); } finally { fault.mockRestore(); }
        const original = JSON.parse(localStorage.getItem(primary)).submission;
        field('input[name="weight-0-0"]', '63');
        expect(await capture.saveSessionData()).toMatchObject({ ok: false, reason: 'immutable-submission' });
        expect((await offlineManager.outbox.read()).entries.filter(entry => entry.descriptor.type === 'session.save')).toHaveLength(0);
        field('input[name="weight-0-0"]', '62.5'); await capture.saveSessionData();
        const [intent] = (await offlineManager.outbox.read()).entries.filter(entry => entry.descriptor.type === 'session.save');
        expect(intent.id).toBe(original.queueId); expect(intent.descriptor.payload).toEqual(original.payload);
    });

    it('requires retirement of an ID-less same-routine PWA recovery slot before accepting a save', async () => {
        await start(); online(false);
        localStorage.setItem(backup, JSON.stringify({ routineId: 'r', data: { old: 'PWA5 backup' }, timestamp: 1 }));
        const remove = Storage.prototype.removeItem;
        const fault = jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(function(key) {
            if (key === backup) throw new Error('Injected PWA backup retirement failure'); return remove.call(this, key);
        });
        try { expect((await capture.saveSessionData())?.ok).not.toBe(true); } finally { fault.mockRestore(); }
        expect((await offlineManager.outbox.read()).entries.filter(entry => entry.descriptor.type === 'session.save')).toHaveLength(0);
        expect(capture.getCurrentRoutineForSession()?.id).toBe('r');
        await capture.saveSessionData(); expect(localStorage.getItem(backup)).toBeNull();
        online(true); await offlineManager.processPendingOperations(); expect(sessions()).toHaveLength(1);
    });

    it('fails closed before offering Resume when the owned journal cannot be read', async () => {
        await start(); capture.setCurrentRoutineForSession(null);
        const fault = jest.spyOn(offlineManager, 'restorePersistedQueue').mockRejectedValue(new Error('Injected unreadable journal'));
        try {
            await resume(); expect(capture.getCurrentRoutineForSession()).toBeNull();
            expect(document.getElementById('resume-session-btn').classList.contains('hidden')).toBe(true);
        } finally { fault.mockRestore(); }
        expect(JSON.parse(localStorage.getItem(primary)).captureId).toMatch(/^session-/);
    });

    it('retains write-ahead in both slots when an unknown append never committed, then cold-retries the original ID/body/date', async () => {
        await start(); online(false);
        const fault = jest.spyOn(offlineManager.outbox.storage, 'append').mockRejectedValueOnce(new Error('Uncertain failure before native commit'));
        let result;
        try { result = await capture.saveSessionData(); } finally { fault.mockRestore(); }
        expect(result).toMatchObject({ ok: true, queued: true });
        const retained = JSON.parse(localStorage.getItem(primary));
        expect(JSON.parse(localStorage.getItem(mirror))).toEqual(retained);
        expect(retained.submission.payload.sessionId).toBe(result.sessionId);
        expect((await offlineManager.outbox.read()).entries.filter(entry => entry.descriptor.type === 'session.save')).toHaveLength(0);
        // Drop RAM without flushing its staged intent; only the write-ahead
        // draft survives this simulated abrupt process loss.
        offlineManager.pendingOperations = []; offlineManager.stagedIds.clear(); offlineManager.unknownIds.clear();
        offlineManager.knownIntents.clear(); offlineManager.retiredIntents.clear();
        await coldMemory(); await resume();
        expect(capture.getCurrentRoutineForSession()?.id).toBe('r');
        expect(document.querySelector('input[name="weight-0-0"]').disabled).toBe(true);
        await capture.saveSessionData();
        const [intent] = (await offlineManager.outbox.read()).entries.filter(entry => entry.descriptor.type === 'session.save');
        expect(intent.id).toBe(retained.submission.queueId); expect(intent.descriptor.payload).toEqual(retained.submission.payload);
        online(true); await offlineManager.processPendingOperations();
        expect(sessions()).toHaveLength(1); expect(sessions()[0][1].sessionId).toBe(result.sessionId);
        expect(sessions()[0][1].fecha.toDate().toISOString()).toBe(retained.submission.payload.sessionData.fechaIso);
    });
});
