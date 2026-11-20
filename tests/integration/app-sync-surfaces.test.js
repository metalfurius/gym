import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { __authState, __firestoreState, __notifyAuthListeners, __resetMockFirebase, __getMockCollectionDocuments, MockTimestamp } from '../mocks/firebase-state.js';
import { __resetMockFirestoreBehavior } from '../mocks/firebase-firestore.js';
import { mountAppDom, field, until, waitForUi } from '../utils/app-harness.js';
import { setCalendarClock } from '../../js/utils/calendar-clock.js';
import { localFirstCache } from '../../js/utils/local-first-cache.js';
import { offlineManager } from '../../js/utils/offline-manager.js';

const uid = 'surface-owner';
const collection = `users/${uid}/sesiones_entrenamiento`;
const sessions = () => __getMockCollectionDocuments(collection);
const strength = (id, hour, weight) => ({ sessionId: id, userId: uid, nombreEntrenamiento: id,
    fecha: MockTimestamp.fromDate(new Date(2026, 10, 20, hour)),
    ejercicios: [{ nombreEjercicio: 'Bench Press', tipoEjercicio: 'strength', modoEjecucion: 'two_hand', tipoCarga: 'external', sets: [{ peso: weight, reps: 8 }] }] });
async function authenticate() {
    __authState.currentUser = { uid, email: 'surfaces@example.test' };
    await __notifyAuthListeners(); await waitForUi(20);
}
const monthCount = () => Number(document.getElementById('daily-hub-month-count').textContent);
async function expectCounts(count) {
    await until(() => monthCount() === count);
    await until(() => document.querySelector('#activity-calendar .is-today')?.title.includes(`${count} sesiones`));
}

describe('shared persisted mutation cross-surface journey', () => {
    beforeAll(async () => {
        __resetMockFirebase(); __resetMockFirestoreBehavior(); localStorage.clear();
        mountAppDom(); setCalendarClock(() => new Date(2026, 10, 20, 12));
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
        await import('../../js/app.js'); document.dispatchEvent(new Event('DOMContentLoaded')); await waitForUi(40);
    });
    afterAll(async () => { setCalendarClock(); __resetMockFirestoreBehavior(); __authState.currentUser = null; await __notifyAuthListeners(); });

    it('keeps capture, Quick Log, replay and first/last-page deletion consistent through offline reload', async () => {
        __firestoreState.documents.set(`${collection}/seed-one`, strength('wire-one', 8, 60));
        __firestoreState.documents.set(`${collection}/seed-two`, strength('wire-two', 9, 70));
        __firestoreState.documents.set(`users/${uid}/routines/owned-routine`, { name: 'Capture routine', createdAt: MockTimestamp.now(),
            exercises: [{ name: 'Bench Press', type: 'strength', sets: 1, reps: '8', executionMode: 'two_hand', loadType: 'external' }] });
        await authenticate(); await expectCounts(2);
        field('#day-select', 'owned-routine'); document.getElementById('start-session-btn').click();
        await until(() => document.querySelector('input[name="weight-0-0"]'));
        field('input[name="weight-0-0"]', '80.5'); field('input[name="reps-0-0"]', '8');
        document.getElementById('save-session-btn').click();
        await until(() => sessions().length === 3); await expectCounts(3);
        const captured = sessions().find(item => item.data.nombreEntrenamiento === 'Capture routine');
        expect(captured.data.ejercicios[0].sets[0]).toMatchObject({ peso: 80.5, reps: 8 });

        document.getElementById('nav-progress').click();
        await until(() => [...document.getElementById('exercise-select').options].some(option => option.textContent.includes('(3 sesiones)')));
        const exercise = [...document.getElementById('exercise-select').options].find(option => option.value);
        field('#exercise-select', exercise.value);
        await until(() => document.getElementById('session-count').textContent === '3');
        expect(document.getElementById('best-record').textContent).toBe('80.5 kg');
        expect(document.querySelector('#progress-data-table tbody').textContent).toContain('80.5');
        const { exerciseCache } = await import('../../js/exercise-cache.js');
        expect(exerciseCache.getExerciseSuggestions('Bench Press').suggestions.peso).toBe(80.5);

        document.getElementById('nav-dashboard').click();
        field('#quick-log-label', 'Same-day online log'); field('#quick-log-notes', 'Mobility');
        document.getElementById('quick-log-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await until(() => sessions().length === 4); await expectCounts(4);
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
        window.dispatchEvent(new Event('offline'));
        field('#quick-log-label', 'Same-day queued log'); field('#quick-log-notes', 'Stretch');
        document.getElementById('quick-log-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await until(() => offlineManager.pendingOperations.some(item => item.descriptor?.type === 'quicklog.save'));
        await offlineManager.persistQueue();
        const queued = offlineManager.pendingOperations.find(item => item.descriptor?.type === 'quicklog.save').descriptor;
        expect(sessions()).toHaveLength(4);
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
        await offlineManager.handleOnline(); await expectCounts(5);
        expect(sessions().find(item => item.id === queued.payload.sessionId).data.fecha.toDate().toISOString()).toBe(queued.payload.sessionData.fechaIso);
        await offlineManager.operationHandlers.get('quicklog.save')(queued.payload); await expectCounts(5);
        expect(sessions()).toHaveLength(5);
        expect(exerciseCache.getExerciseSuggestions('Bench Press').suggestions.peso).toBe(80.5);

        document.getElementById('nav-history').click();
        await until(() => document.querySelectorAll('#history-list li[data-session-id]').length === 5);
        document.querySelector(`#history-list button[data-session-id="${captured.id}"]`).click();
        await until(() => sessions().length === 4); await expectCounts(4);
        expect(exerciseCache.getExerciseSuggestions('Bench Press').suggestions.peso).toBe(70);
        document.getElementById('nav-progress').click();
        await until(() => !document.getElementById('exercise-select').value);
        await waitForUi(20);
        expect(document.getElementById('progress-stats').classList.contains('hidden')).toBe(true);
        expect(document.getElementById('progress-chart-container').classList.contains('hidden')).toBe(true);
        expect(document.getElementById('progress-data-table')).toBeNull();

        // Add ten distinct backend fixtures, then cold-auth reload as another
        // client would observe them; document IDs deliberately disagree with wire IDs.
        for (let index = 0; index < 10; index++) { __firestoreState.documents.set(`${collection}/extra-${index}`, {
            id: 'duplicate-wire-id', nombreEntrenamiento: `Extra ${index}`, userId: uid, ejercicios: [],
            fecha: MockTimestamp.fromDate(new Date(2026, 10, 20, 14, index)) }); }
        await authenticate(); await expectCounts(14);
        for (let left = 4; left > 0; left--) {
            document.getElementById('nav-history').click();
            await until(() => document.querySelectorAll('#history-list li[data-session-id]').length === 10);
            document.getElementById('history-next-page-btn').click();
            await until(() => document.querySelectorAll('#history-list li[data-session-id]').length === left);
            document.querySelector('#history-list button[data-action="delete-session"]').click();
            await until(() => sessions().length === 10 + left - 1);
            await expectCounts(10 + left - 1);
        }
        expect(document.getElementById('history-page-info').textContent).toContain('1');
        expect(document.getElementById('history-next-page-btn').disabled).toBe(true);
        expect(exerciseCache.getExerciseSuggestions('Bench Press').hasHistory).toBe(false);
        const deleted = captured.id;
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
        localFirstCache.memoryCache.clear(); await authenticate();
        document.getElementById('nav-history').click();
        await until(() => document.querySelectorAll('#history-list li[data-session-id]').length === 10);
        expect(document.querySelector(`#history-list li[data-session-id="${deleted}"]`)).toBeNull();
        expect(document.getElementById('daily-hub-month-count').textContent).toBe('10');
        expect(document.getElementById('daily-hub-data-status').classList.contains('hidden')).toBe(false);
    }, 20000);
});
