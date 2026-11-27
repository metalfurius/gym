import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { __authState, __firestoreState, __notifyAuthListeners, __resetMockFirebase, MockTimestamp } from '../mocks/firebase-state.js';
import { __resetMockFirestoreBehavior, __setMockTransactionBeforeCommit, __setMockQueryResultHandler, __setMockTransactionAuthorization } from '../mocks/firebase-firestore.js';
import { mountAppDom, field, until, waitForUi } from '../utils/app-harness.js';
import { seedSyncProtocol } from '../utils/sync-protocol-fixture.js';
import { setCalendarClock } from '../../js/utils/calendar-clock.js';
import { LocalFirstCache, localFirstCache } from '../../js/utils/local-first-cache.js';
import { offlineManager } from '../../js/utils/offline-manager.js';

async function authenticate(uid) {
    __authState.currentUser = uid ? { uid, email: `${uid}@example.test` } : null;
    await __notifyAuthListeners(); await waitForUi(20);
}
function competingSession(uid) {
    const marker = `users/${uid}/app_data/session_revision`;
    const revision = __firestoreState.documents.get(marker).revision + 1;
    const id = `concurrent-${revision}`;
    __firestoreState.documents.set(`users/${uid}/sesiones_entrenamiento/${id}`, {
        userId: uid, fecha: MockTimestamp.fromDate(new Date(2026, 10, 20, 11)), nombreEntrenamiento: 'Competing fixture', ejercicios: [],
    });
    __firestoreState.documents.set(`users/${uid}/session_mutations/${id}/receipts/create`, { sessionId: id, kind: 'create', changed: true, revision });
    __firestoreState.documents.set(marker, { revision, lastSessionId: id });
    return Object.assign(new Error('Missing or insufficient permissions'), { code: 'permission-denied' });
}

describe('actual app independent-review regressions', () => {
    beforeAll(async () => {
        __resetMockFirebase(); mountAppDom();
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
        setCalendarClock(() => new Date(2026, 10, 20, 12));
        await import('../../js/app.js'); document.dispatchEvent(new Event('DOMContentLoaded')); await waitForUi(40);
    });
    beforeEach(async () => {
        __resetMockFirestoreBehavior(); await authenticate(null); __firestoreState.documents.clear();
        offlineManager.clearPending(); await offlineManager.persistQueue(); await localFirstCache.clearAll();
    });
    afterAll(async () => { __resetMockFirestoreBehavior(); await authenticate(null); setCalendarClock(); });

    it('preserves B notes when A Quick Log finishes after the account transition', async () => {
        await authenticate('A');
        let release; let held = false;
        const gate = new Promise(resolve => { release = resolve; });
        __setMockTransactionBeforeCommit(async ({ writes }) => {
            if (!held && writes.some(write => write.reference.path.startsWith('users/A/sesiones_entrenamiento/'))) {
                held = true; await gate;
            }
        });
        field('#quick-log-label', 'A pending'); field('#quick-log-notes', 'A notes');
        document.getElementById('quick-log-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await until(() => held);
        await authenticate('B'); field('#quick-log-notes', 'B unsaved notes');
        release();
        await until(() => [...__firestoreState.documents.keys()].some(path => path.startsWith('users/A/sesiones_entrenamiento/')));
        await waitForUi(60);
        expect(document.getElementById('quick-log-notes').value).toBe('B unsaved notes');
        expect(document.getElementById('quick-log-save-btn').disabled).toBe(false);
        expect([...__firestoreState.documents.keys()].some(path => path.startsWith('users/B/sesiones_entrenamiento/'))).toBe(false);
    });

    it('finalizes the first legacy scalar-7 week as 4/7 and unmet, before any dated target exists', async () => {
        seedSyncProtocol('A');
        __firestoreState.documents.set('users/A/app_data/user_preferences', { weeklyTargetDays: 7 });
        for (let index = 0; index < 4; index++) {
            __firestoreState.documents.set(`users/A/sesiones_entrenamiento/history-${index}`, {
                userId: 'A', fecha: MockTimestamp.fromDate(new Date(2026, 10, 11, 8 + index)),
                nombreEntrenamiento: `History ${index}`, ejercicios: [],
            });
        }
        await authenticate('A');
        await until(() => !!__firestoreState.documents.get('users/A/app_data/user_preferences').weeklyOutcomesByWeek?.['2026-11-09']);
        const saved = __firestoreState.documents.get('users/A/app_data/user_preferences');
        expect(saved.weeklyOutcomesByWeek['2026-11-09']).toMatchObject({ targetDays: 7, targetSessions: 7, sessionCount: 4, met: false });
        expect(saved.weeklyTargetBaselineSessions).toBe(7);
        expect(document.getElementById('weekly-target-days-select').value).toBe('7');
    });

    it('finishes the initial exercise selector when the period changes during its read', async () => {
        await authenticate('A');
        for (let index = 0; index < 3; index++) {
            __firestoreState.documents.set(`users/A/sesiones_entrenamiento/progress-${index}`, {
                fecha: MockTimestamp.fromDate(new Date(2026, 10, 19, 8 + index)), ejercicios: [
                    { nombreEjercicio: 'Bench Press', tipoEjercicio: 'strength', sets: [{ peso: 60 + index, reps: 8 }] },
                ],
            });
        }
        let release; let held;
        const gate = new Promise(resolve => { release = resolve; });
        __setMockQueryResultHandler((snapshot, source) => {
            if (source.constraints.some(constraint => constraint.__constraint === 'limit' && constraint.count === 301)) {
                held = snapshot; return gate;
            }
            return snapshot;
        });
        const progress = await import('../../js/progress.js');
        const ui = await import('../../js/ui.js');
        const pending = progress.loadExerciseList();
        await until(() => !!held);
        ui.progressElements.periodSelect.value = '3m'; await progress.updateChart();
        expect(ui.progressElements.loadingSpinner.classList.contains('hidden')).toBe(false);
        release(held); await pending;
        expect(ui.progressElements.exerciseSelect.textContent).toContain('Bench Press');
        expect(ui.progressElements.loadingSpinner.classList.contains('hidden')).toBe(true);
    });

    it('renders unfenced history as limited and never freezes a seemingly consistent unmarked query', async () => {
        __firestoreState.documents.set('users/A/app_data/user_preferences', { weeklyTargetDays: 7 });
        __firestoreState.documents.set('users/A/sesiones_entrenamiento/legacy', {
            fecha: MockTimestamp.fromDate(new Date(2026, 10, 11, 10)), ejercicios: [],
        });
        await authenticate('A');
        expect(__firestoreState.documents.get('users/A/app_data/user_preferences').weeklyOutcomesByWeek).toBeUndefined();
        expect(document.getElementById('daily-hub-month-count').textContent).toBe('1');
        expect(document.getElementById('daily-hub-data-status').classList.contains('hidden')).toBe(false);
    });

    it('acknowledges an accepted Quick Log without retry duplication when only post-commit cache completion fails', async () => {
        await authenticate('A');
        await localFirstCache.set('history:A:page:1', { sessions: ['obsolete'] });
        const write = jest.spyOn(localFirstCache, 'writeToLocalStorage');
        let committed = false;
        __setMockTransactionBeforeCommit(({ writes }) => {
            if (!committed && writes.some(item => item.reference.path.startsWith('users/A/sesiones_entrenamiento/'))) {
                committed = true; write.mockReturnValue(false);
            }
        });
        try {
            const { saveQuickLogEntry } = await import('../../js/modules/session-manager.js');
            const input = { workoutLabel: 'Accepted once', notes: 'Keep identity', dateTimeLocal: '2026-11-20T12:00' };
            const first = await saveQuickLogEntry(input);
            write.mockRestore(); __setMockTransactionBeforeCommit(null);
            if (!first.ok) await saveQuickLogEntry(input); // Normal user retry after an error.
            expect([...__firestoreState.documents.keys()].filter(path => path.startsWith('users/A/sesiones_entrenamiento/'))).toHaveLength(1);
            expect(first.ok).toBe(true);
            expect(await new LocalFirstCache().get('history:A:page:1')).toBeNull();
            // Reopen/auth with storage available. The already acknowledged save
            // has no queue entry, so recovery must not depend on queue replay.
            expect(offlineManager.getPendingCount()).toBe(0);
            await authenticate(null); await authenticate('A');
            expect(await localFirstCache.set('daily-hub:A:weekly', { recovered: true })).not.toBeNull();
            expect(await new LocalFirstCache().get('daily-hub:A:weekly')).toEqual({ recovered: true });
        } finally { write.mockRestore(); __setMockTransactionBeforeCommit(null); }
    });

    it('keeps a UI-deleted session absent when the original Quick Log descriptor replays', async () => {
        await authenticate('A');
        const { saveQuickLogEntry } = await import('../../js/modules/session-manager.js');
        const saved = await saveQuickLogEntry({ workoutLabel: 'Lost acknowledgement', notes: 'Receipt fixture', dateTimeLocal: '2026-11-20T12:00' });
        expect(saved.ok).toBe(true);
        const id = saved.data.sessionId;
        document.getElementById('nav-history').click();
        await until(() => !!document.querySelector(`#history-list button[data-session-id="${id}"]`));
        document.querySelector(`#history-list button[data-session-id="${id}"]`).click();
        await until(() => !__firestoreState.documents.has(`users/A/sesiones_entrenamiento/${id}`));
        await until(() => document.getElementById('daily-hub-month-count').textContent === '0');
        const { fecha, ...data } = saved.data;
        await offlineManager.operationHandlers.get('quicklog.save')({ userId: 'A', sessionId: id,
            sessionData: { ...data, fechaIso: fecha.toDate().toISOString() } });
        expect(__firestoreState.documents.has(`users/A/sesiones_entrenamiento/${id}`)).toBe(false);
        expect(document.getElementById('daily-hub-month-count').textContent).toBe('0');
        expect(document.querySelector(`#history-list li[data-session-id="${id}"]`)).toBeNull();
    });

    it('queues the original Quick Log identity after bounded denial exhaustion and replays it once', async () => {
        seedSyncProtocol('A'); await authenticate('A');
        __setMockTransactionAuthorization(({ writes }) => {
            if (writes.some(write => write.reference.path.startsWith('users/A/sesiones_entrenamiento/'))) throw competingSession('A');
        });
        const { saveQuickLogEntry } = await import('../../js/modules/session-manager.js');
        const result = await saveQuickLogEntry({ workoutLabel: 'Contended original', notes: 'Retained intent', dateTimeLocal: '2026-11-20T12:34' });
        expect(result).toMatchObject({ ok: true, queued: true });
        const queued = offlineManager.pendingOperations.find(entry => entry.descriptor?.type === 'quicklog.save');
        expect(queued.descriptor.payload.sessionId).toBe(result.data.sessionId);
        const originalIso = queued.descriptor.payload.sessionData.fechaIso;
        __setMockTransactionAuthorization(null); await offlineManager.processPendingOperations();
        const saved = __firestoreState.documents.get(`users/A/sesiones_entrenamiento/${result.data.sessionId}`);
        expect(saved.fecha.toDate().toISOString()).toBe(originalIso);
        expect(saved.ejercicios).toEqual(result.data.ejercicios);
        expect(JSON.stringify(saved.ejercicios)).toContain('Retained intent');
        expect(offlineManager.getPendingCount()).toBe(0);
    });

    it('retains an exhausted History deletion as an owned durable intent and refreshes after replay', async () => {
        seedSyncProtocol('A'); await authenticate('A');
        const { saveQuickLogEntry } = await import('../../js/modules/session-manager.js');
        const saved = await saveQuickLogEntry({ workoutLabel: 'Contended deletion', notes: 'Delete once', dateTimeLocal: '2026-11-20T12:00' });
        const path = `users/A/sesiones_entrenamiento/${saved.data.sessionId}`;
        __setMockTransactionAuthorization(({ writes }) => {
            if (writes.some(write => write.reference.path === path && write.remove)) throw competingSession('A');
        });
        document.getElementById('nav-history').click();
        await until(() => !!document.querySelector(`#history-list button[data-session-id="${saved.data.sessionId}"]`));
        document.querySelector(`#history-list button[data-session-id="${saved.data.sessionId}"]`).click();
        await until(() => offlineManager.pendingOperations.some(entry => entry.descriptor?.type === 'session.delete'));
        await offlineManager.persistQueue();
        expect(__firestoreState.documents.has(path)).toBe(true);
        const queued = offlineManager.pendingOperations.find(entry => entry.descriptor?.type === 'session.delete');
        expect(queued.descriptor.payload).toEqual({ userId: 'A', sessionId: saved.data.sessionId });
        __setMockTransactionAuthorization(null); await offlineManager.processPendingOperations();
        expect(__firestoreState.documents.has(path)).toBe(false);
        expect(document.querySelector(`#history-list li[data-session-id="${saved.data.sessionId}"]`)).toBeNull();
        expect(offlineManager.getPendingCount()).toBe(0);
    });

    it('retains only a recompute intent when derived finalization exhausts its denial retries', async () => {
        seedSyncProtocol('A');
        const path = 'users/A/app_data/user_preferences';
        const originalIso = '2026-11-01T02:03:04.000Z';
        __firestoreState.documents.set(path, { weeklyTargetDays: 7, updatedAtIso: originalIso });
        for (let index = 0; index < 4; index++) {
            __firestoreState.documents.set(`users/A/sesiones_entrenamiento/derived-${index}`, {
                userId: 'A', fecha: MockTimestamp.fromDate(new Date(2026, 10, 11, 8 + index)), ejercicios: [],
            });
        }
        __setMockTransactionAuthorization(({ writes }) => {
            if (!writes.some(write => write.reference.path === path && write.value.weeklyOutcomesByWeek)) return;
            const server = __firestoreState.documents.get(path);
            __firestoreState.documents.set(path, { ...server, schemaVersion: 3, preferencesRevision: (server.preferencesRevision || 0) + 1 });
            throw Object.assign(new Error('Missing or insufficient permissions'), { code: 'permission-denied' });
        });
        await authenticate('A');
        await until(() => offlineManager.pendingOperations.some(entry => entry.descriptor?.type === 'preferences.syncWeeklyState'));
        const queued = offlineManager.pendingOperations.find(entry => entry.descriptor?.type === 'preferences.syncWeeklyState');
        expect(queued.descriptor.payload).toEqual({ userId: 'A' });
        expect(__firestoreState.documents.get(path).weeklyOutcomesByWeek).toBeUndefined();
        __setMockTransactionAuthorization(null); await offlineManager.processPendingOperations();
        expect(__firestoreState.documents.get(path).weeklyOutcomesByWeek['2026-11-09']).toMatchObject({ targetSessions: 7, sessionCount: 4, met: false });
        expect(__firestoreState.documents.get(path).updatedAtIso).toBe(originalIso);
        expect(offlineManager.pendingOperations.some(entry => entry.descriptor?.type === 'preferences.syncWeeklyState')).toBe(false);
    });

    it('preserves the weekly UI intent base and timestamp in the durable queue after denial exhaustion', async () => {
        seedSyncProtocol('A'); await authenticate('A');
        const path = 'users/A/app_data/user_preferences';
        __setMockTransactionAuthorization(({ writes }) => {
            if (!writes.some(write => write.reference.path === path && write.value.weeklyTargetsByWeek?.['2026-11-16'])) return;
            const server = __firestoreState.documents.get(path) || { weeklyTargetDays: 3 };
            __firestoreState.documents.set(path, { ...server, schemaVersion: 3, preferencesRevision: (server.preferencesRevision || 0) + 1, unrelated: 'keep' });
            throw Object.assign(new Error('Missing or insufficient permissions'), { code: 'permission-denied' });
        });
        field('#weekly-target-days-select', '7'); document.getElementById('weekly-target-save-btn').click();
        await until(() => offlineManager.pendingOperations.some(entry => entry.descriptor?.type === 'preferences.saveWeeklyTarget'));
        await until(() => !document.getElementById('weekly-target-save-btn').disabled);
        const original = JSON.parse(JSON.stringify(offlineManager.pendingOperations.find(entry => entry.descriptor?.type === 'preferences.saveWeeklyTarget').descriptor.payload));
        expect(original).toMatchObject({ userId: 'A', weekKey: '2026-11-16', baseRevision: 0, baseOperationId: null, baseFingerprint: 'absent' });
        expect(document.getElementById('weekly-target-days-select').value).toBe('7');
        __setMockTransactionAuthorization(null); await offlineManager.processPendingOperations();
        expect(__firestoreState.documents.get(path).weeklyTargetsByWeek['2026-11-16']).toMatchObject({
            targetSessions: 7, operationId: original.operationId, updatedAtIso: original.updatedAtIso,
        });
        expect(__firestoreState.documents.get(path).unrelated).toBe('keep');
        expect(offlineManager.getPendingCount()).toBe(0);
    });
});
