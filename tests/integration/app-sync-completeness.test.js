import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { __authState, __firestoreState, __notifyAuthListeners, __resetMockFirebase, MockTimestamp } from '../mocks/firebase-state.js';
import { __resetMockFirestoreBehavior, __setMockQueryResultHandler } from '../mocks/firebase-firestore.js';
import { mountAppDom, until, waitForUi } from '../utils/app-harness.js';
import { setCalendarClock } from '../../js/utils/calendar-clock.js';
import { localFirstCache } from '../../js/utils/local-first-cache.js';
import { offlineManager } from '../../js/utils/offline-manager.js';
import { serializeSessionsForCache } from '../../js/utils/firestore-serialization.js';
import { setLanguage } from '../../js/i18n.js';
import { seedSyncProtocol } from '../utils/sync-protocol-fixture.js';

const preferencesPath = uid => `users/${uid}/app_data/user_preferences`;
const session = (id, date = new Date(2026, 10, 9, 10)) => ({ id, fecha: MockTimestamp.fromDate(date),
    nombreEntrenamiento: id, ejercicios: [], userId: 'fixture' });
function seed(uid, count) {
    seedSyncProtocol(uid);
    for (let index = 0; index < count; index++) __firestoreState.documents.set(`users/${uid}/sesiones_entrenamiento/s-${index}`, { ...session(`wire-${index}`), userId: uid });
    __firestoreState.documents.set(preferencesPath(uid), { weeklyTargetDays: 3, untouched: 'metadata' });
}
async function authenticate(uid) {
    __authState.currentUser = uid ? { uid, email: `${uid}@example.test` } : null;
    await __notifyAuthListeners();
    await waitForUi(20);
}

describe('actual app bounded-history completeness', () => {
    beforeAll(async () => {
        __resetMockFirebase(); mountAppDom();
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
        setCalendarClock(() => new Date(2026, 10, 20, 12));
        await import('../../js/app.js'); document.dispatchEvent(new Event('DOMContentLoaded')); await waitForUi(50);
    });
    beforeEach(async () => {
        __resetMockFirestoreBehavior();
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
        await authenticate(null); __firestoreState.documents.clear();
        offlineManager.clearPending(); await offlineManager.persistQueue(); await localFirstCache.clearAll();
        setLanguage('es', { persist: false, apply: true });
    });
    afterAll(async () => { __resetMockFirestoreBehavior(); setCalendarClock(); await authenticate(null); });

    it.each([[0, true], [1500, true], [1501, false]])('uses lookahead for %i sessions (complete=%s) without unbounded session reads', async (count, complete) => {
        const uid = `cap-${count}`; seed(uid, count); const limits = [];
        __setMockQueryResultHandler((snapshot, query) => {
            if (query.source.path.endsWith('/sesiones_entrenamiento')) limits.push(query.constraints.find(item => item.__constraint === 'limit')?.count);
            return snapshot;
        });
        await authenticate(uid);
        const stored = __firestoreState.documents.get(preferencesPath(uid));
        expect(document.getElementById('daily-hub-data-status').classList.contains('hidden')).toBe(complete);
        expect(stored.untouched).toBe('metadata');
        if (count === 1500) expect(stored.weeklyOutcomesByWeek['2026-11-09']).toMatchObject({ sessionCount: 1500, activeDays: 1, met: true });
        else expect(stored.weeklyOutcomesByWeek).toBeUndefined();
        expect(limits.length).toBeGreaterThan(0); expect(limits.every(value => Number.isInteger(value) && value <= 1501)).toBe(true);
    });

    it('does not finalize a stale Firestore cache snapshot even when it is below the cap', async () => {
        seed('stale', 5);
        __setMockQueryResultHandler(snapshot => ({ ...snapshot, metadata: { fromCache: true, hasPendingWrites: false } }));
        await authenticate('stale');
        expect(__firestoreState.documents.get(preferencesPath('stale')).weeklyOutcomesByWeek).toBeUndefined();
        expect(document.getElementById('daily-hub-data-status').textContent).toContain('limitado');
    });

    it('keeps an offline cached history page limited and makes no derived preference write', async () => {
        seed('offline-page', 30);
        await localFirstCache.set('history:offline-page:page:1', { ownerId: 'offline-page',
            sessions: serializeSessionsForCache([{ ...session('cached-only'), userId: 'offline-page' }]), hasNext: true, complete: false });
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
        await authenticate('offline-page');
        document.getElementById('nav-history').click();
        await until(() => document.querySelector('#history-list li[data-session-id]'));
        document.getElementById('nav-dashboard').click(); await waitForUi(30);
        expect(__firestoreState.documents.get(preferencesPath('offline-page')).weeklyOutcomesByWeek).toBeUndefined();
        expect(document.getElementById('daily-hub-data-status').classList.contains('hidden')).toBe(false);
    });

    it('shows the limited-data state in both Spanish and English', async () => {
        seed('translated', 1501); await authenticate('translated');
        expect(document.getElementById('daily-hub-data-status').textContent).toContain('limitado');
        setLanguage('en', { persist: false, apply: true });
        await until(() => document.getElementById('daily-hub-data-status').textContent.includes('Limited'));
        expect(document.getElementById('daily-hub-data-status').textContent).toContain('Historical streaks');
    });
});
