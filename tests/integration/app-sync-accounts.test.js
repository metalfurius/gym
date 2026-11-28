import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { __authState, __firestoreState, __notifyAuthListeners, __resetMockFirebase, MockTimestamp } from '../mocks/firebase-state.js';
import { __resetMockFirestoreBehavior, __setMockDocumentResultHandler, __setMockTransactionBeforeCommit, __setMockWriteFailuresForPath } from '../mocks/firebase-firestore.js';
import { mountAppDom, field, until, waitForUi } from '../utils/app-harness.js';
import { setCalendarClock } from '../../js/utils/calendar-clock.js';
import { localFirstCache } from '../../js/utils/local-first-cache.js';
import { offlineManager } from '../../js/utils/offline-manager.js';

const preferencePath = uid => `users/${uid}/app_data/user_preferences`;
let elapsedClock;
async function authenticate(uid) {
    __authState.currentUser = uid ? { uid, email: `${uid}@example.test` } : null;
    await __notifyAuthListeners(); await waitForUi(10);
}
function deferred() { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const target = () => document.getElementById('weekly-target-days-select').value;
function clickSave(value) { field('#weekly-target-days-select', value); document.getElementById('weekly-target-save-btn').click(); }

describe('actual app account/read/write generations', () => {
    beforeAll(async () => {
        __resetMockFirebase(); mountAppDom();
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
        setCalendarClock(() => new Date(2026, 10, 20, 12));
        await import('../../js/app.js'); document.dispatchEvent(new Event('DOMContentLoaded')); await waitForUi(30);
    });
    beforeEach(async () => {
        // Pin cache age independently from the injected calendar reference.
        // Retain advancing elapsed time so deferred-UI timeouts remain real.
        const realNow = Date.now.bind(Date); const startedAt = realNow();
        elapsedClock = jest.spyOn(Date, 'now').mockImplementation(() => new Date(2026, 10, 20, 12).getTime() + realNow() - startedAt);
        __resetMockFirestoreBehavior();
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
        await authenticate(null); __firestoreState.documents.clear();
        offlineManager.clearPending(); await offlineManager.persistQueue(); await localFirstCache.clearAll();
        __firestoreState.documents.set(preferencePath('A'), { weeklyTargetDays: 7 });
        __firestoreState.documents.set(preferencePath('B'), { weeklyTargetDays: 6 });
    });
    afterEach(() => elapsedClock.mockRestore());
    afterAll(async () => { __resetMockFirestoreBehavior(); setCalendarClock(); await authenticate(null); });

    it.each(['success', 'error'])('does not apply an old A preference %s after B signs in', async outcome => {
        const gate = deferred(); let snapshot;
        __setMockDocumentResultHandler((value, reference) => {
            if (reference.path === preferencePath('A')) { snapshot = value; return gate.promise; } return value;
        });
        const old = authenticate('A'); await until(() => !!snapshot);
        await authenticate('B'); expect(target()).toBe('6');
        if (outcome === 'success') gate.resolve(snapshot); else gate.reject(new Error('delayed old account failure'));
        await old;
        expect(target()).toBe('6');
        expect((await localFirstCache.get('user-preferences:B')).weeklyTargetDays).toBe(6);
        expect(await localFirstCache.get('user-preferences:A')).toBeNull();
        expect(document.getElementById('weekly-target-save-btn').disabled).toBe(false);
    });

    it('rejects an old A result after A -> B -> A even though the UID matches again', async () => {
        const gate = deferred(); let snapshot; let held = false;
        __setMockDocumentResultHandler((value, reference) => {
            if (!held && reference.path === preferencePath('A')) { held = true; snapshot = value; return gate.promise; } return value;
        });
        const old = authenticate('A'); await until(() => !!snapshot);
        await authenticate('B');
        __firestoreState.documents.set(preferencePath('A'), { weeklyTargetDays: 4 });
        await authenticate('A'); expect(target()).toBe('4');
        gate.resolve(snapshot); await old;
        expect(target()).toBe('4'); expect((await localFirstCache.get('user-preferences:A')).weeklyTargetDays).toBe(4);
    });

    it('keeps a pending A transaction owned by A without applying its result or busy state to B', async () => {
        await authenticate('A');
        const gate = deferred(); let held = false;
        __setMockTransactionBeforeCommit(async ({ writes }) => {
            if (!held && writes.some(write => write.reference.path === preferencePath('A'))) { held = true; await gate.promise; }
        });
        clickSave('4'); await until(() => held);
        await authenticate('B'); expect(target()).toBe('6');
        expect(document.getElementById('weekly-target-save-btn').disabled).toBe(false);
        gate.resolve();
        await until(() => __firestoreState.documents.get(preferencePath('A')).weeklyTargetDays === 4);
        await waitForUi(25);
        expect(target()).toBe('6'); expect(__firestoreState.documents.get(preferencePath('B')).weeklyTargetDays).toBe(6);
        expect((await localFirstCache.get('user-preferences:B')).weeklyTargetDays).toBe(6);
    });

    it('retains a same-week conflict for explicit review and clears it after a deliberate new save', async () => {
        await authenticate('A');
        const { persistWeeklyTargetOperation, createWeeklyTargetOperation } = await import('../../js/utils/weekly-preferences.js');
        await persistWeeklyTargetOperation({}, createWeeklyTargetOperation('A', '2026-11-16', 5, null, '2026-11-20T09:00:00.000Z'));
        clickSave('4');
        await until(() => offlineManager.getConflictCount() === 1);
        expect(target()).toBe('5');
        expect(document.getElementById('weekly-target-conflict-status').classList.contains('hidden')).toBe(false);
        expect(__firestoreState.documents.get(preferencePath('A')).weeklyTargetDays).toBe(5);
        await until(() => !document.getElementById('weekly-target-save-btn').disabled);
        clickSave('6');
        await until(() => __firestoreState.documents.get(preferencePath('A')).weeklyTargetDays === 6);
        await until(() => offlineManager.getConflictCount() === 0);
        expect(target()).toBe('6');
        expect(document.getElementById('weekly-target-conflict-status').classList.contains('hidden')).toBe(true);
    });

    it('restores the acknowledged value when a permanent server error rejects the optimistic target', async () => {
        await authenticate('A');
        __setMockWriteFailuresForPath(preferencePath('A'), 1, new Error('permission denied'));
        clickSave('4');
        await until(() => target() === '7' && !document.getElementById('weekly-target-save-btn').disabled);
        expect(__firestoreState.documents.get(preferencePath('A')).weeklyTargetDays).toBe(7);
        expect(offlineManager.getPendingCount()).toBe(0);
        expect((await localFirstCache.get('user-preferences:A')).weeklyTargetDays).toBe(7);
    });
    it('cold-restores offline history, selectors, suggestions and targets only for the returning owner', async () => {
        for (const owner of ['A', 'B']) {
            for (let index = 0; index < 3; index++) { __firestoreState.documents.set(`users/${owner}/sesiones_entrenamiento/${owner}-${index}`, {
                userId: owner, fecha: MockTimestamp.fromDate(new Date(2026, 10, 19, 8 + index)), nombreEntrenamiento: `${owner} only`,
                ejercicios: [{ nombreEjercicio: `${owner} exercise`, tipoEjercicio: 'strength', modoEjecucion: 'two_hand',
                    tipoCarga: 'external', sets: [{ peso: owner === 'A' ? 50 : 150, reps: 8 }] }],
            }); }
        }
        for (const owner of ['A', 'B']) {
            await authenticate(owner); document.getElementById('nav-history').click();
            await until(() => document.querySelectorAll(`#history-list li[data-session-id^="${owner}-"]`).length === 3);
            document.getElementById('nav-progress').click();
            await until(() => document.getElementById('exercise-select').textContent.includes(`${owner} exercise`));
        }
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
        localFirstCache.memoryCache.clear(); await authenticate('A');
        expect(target()).toBe('7');
        expect(document.getElementById('daily-hub-month-count').textContent).toBe('3');
        document.getElementById('nav-history').click();
        await until(() => document.querySelectorAll('#history-list li[data-session-id^="A-"]').length === 3);
        expect(document.querySelector('#history-list [data-session-id^="B-"]')).toBeNull();
        document.getElementById('nav-progress').click();
        await until(() => document.getElementById('exercise-select').textContent.includes('A exercise'));
        expect(document.getElementById('exercise-select').textContent).not.toContain('B exercise');
        const { exerciseCache } = await import('../../js/exercise-cache.js');
        expect(exerciseCache.getExerciseSuggestions('A exercise').suggestions.peso).toBe(50);
        expect(exerciseCache.getExerciseSuggestions('B exercise').hasHistory).toBe(false);
    });

    it('resolves Settings and Hub by the local week while preserving a legacy target before the first future-week edit', async () => {
        await authenticate('A');
        try {
            setCalendarClock(() => new Date(2026, 10, 23, 12)); clickSave('5');
            await until(() => __firestoreState.documents.get(preferencePath('A')).weeklyTargetsByWeek?.['2026-11-23']?.targetSessions === 5);
            await until(() => !document.getElementById('weekly-target-save-btn').disabled);
            setCalendarClock(() => new Date(2026, 10, 20, 12)); await authenticate('A');
            expect(target()).toBe('7');
            expect(document.getElementById('daily-hub-weekly-progress').textContent).toBe('0/7');
            clickSave('4');
            await until(() => __firestoreState.documents.get(preferencePath('A')).weeklyTargetsByWeek?.['2026-11-16']?.targetSessions === 4);
            await until(() => !document.getElementById('weekly-target-save-btn').disabled);
            expect(target()).toBe('4');
            expect(document.getElementById('daily-hub-weekly-progress').textContent).toBe('0/4');
            setCalendarClock(() => new Date(2026, 10, 23, 12)); await authenticate('A');
            expect(target()).toBe('5');
            expect(__firestoreState.documents.get(preferencePath('A')).weeklyTargetDays).toBe(5);
        } finally { setCalendarClock(() => new Date(2026, 10, 20, 12)); }
    });

});
