import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { __authState, __firestoreState, __notifyAuthListeners, __resetMockFirebase } from '../mocks/firebase-state.js';
import { __resetMockFirestoreBehavior, __setMockTransactionAfterCommit, __setMockTransactionBeforeCommit } from '../mocks/firebase-firestore.js';
import { mountAppDom, waitForUi, field } from '../utils/app-harness.js';
import { seedSyncProtocol } from '../utils/sync-protocol-fixture.js';
import { setCalendarClock } from '../../js/utils/calendar-clock.js';
import { localFirstCache } from '../../js/utils/local-first-cache.js';
import { offlineManager } from '../../js/utils/offline-manager.js';
import { registerSessionMutationInvalidator } from '../../js/utils/session-mutations.js';
import { OUTBOX_JOURNAL_PREFIX } from '../../js/utils/outbox-journal-storage.js';

const now = Date.now.bind(Date);
const online = value => Object.defineProperty(navigator, 'onLine', { configurable: true, value });
const path = 'users/A/app_data/user_preferences';
const sessions = () => [...__firestoreState.documents.entries()].filter(([key]) => key.startsWith('users/A/sesiones_entrenamiento/'));
const input = { label: 'One intended workout', notes: 'Original notes', dateTime: '2026-11-27T12:00' };
const wait = async predicate => {
    const deadline = now() + 2500;
    while (!predicate()) { if (now() > deadline) throw new Error('Actual app outbox condition timed out'); await waitForUi(5); }
};
async function authenticate(uid) {
    __authState.currentUser = uid ? { uid, email: `${uid}@example.test` } : null;
    await __notifyAuthListeners(); await waitForUi(20);
}
function useIndexedAuthority(fault) {
    const previous = { enabled: localFirstCache.indexedDbEnabled, expected: localFirstCache.indexedDbExpected, db: localFirstCache.dbPromise };
    const disk = new Map(localFirstCache.localStorageKeys().map(key => [key, localFirstCache.readFromLocalStorage(key)]));
    localFirstCache.indexedDbEnabled = true; localFirstCache.indexedDbExpected = true; localFirstCache.dbPromise = Promise.resolve({});
    const spies = [
        jest.spyOn(localFirstCache, 'getAllFromIndexedDb').mockImplementation(async prefix => [...disk.values()].filter(row => row.key.startsWith(prefix))),
        jest.spyOn(localFirstCache, 'readFromIndexedDb').mockImplementation(async key => disk.get(key) || null),
        jest.spyOn(localFirstCache, 'deleteFromIndexedDb').mockImplementation(async key => { disk.delete(key); }),
        jest.spyOn(localFirstCache, 'writeToIndexedDb').mockImplementation(async entry => {
            const events = entry.key.startsWith(OUTBOX_JOURNAL_PREFIX) ? JSON.parse(entry.value.eventsJson) : [];
            if (fault(events, entry)) throw Object.assign(new Error('Injected terminal IDB abort'), { provenNotCommitted: true });
            disk.set(entry.key, JSON.parse(JSON.stringify(entry))); return true;
        }),
    ];
    return () => {
        for (const spy of spies) spy.mockRestore();
        localFirstCache.indexedDbEnabled = previous.enabled; localFirstCache.indexedDbExpected = previous.expected; localFirstCache.dbPromise = previous.db;
    };
}

describe('actual app atomic journal and causal replay', () => {
    let saveQuickLogEntry;
    beforeAll(async () => {
        __resetMockFirebase(); mountAppDom(); online(true); setCalendarClock(() => new Date(2026, 10, 27, 12));
        await import('../../js/app.js'); ({ saveQuickLogEntry } = await import('../../js/modules/session-manager.js'));
        document.dispatchEvent(new Event('DOMContentLoaded')); await waitForUi(40);
    });
    beforeEach(async () => {
        __resetMockFirestoreBehavior(); online(true); await authenticate(null);
        offlineManager.clearPending(); await offlineManager.persistQueue(); await localFirstCache.clearAll();
        __firestoreState.documents.clear(); seedSyncProtocol('A', { activated: true });
        __firestoreState.documents.set(path, { weeklyTargetDays: 3 }); await authenticate('A');
        await offlineManager.queuePersistenceTail;
    });
    afterAll(async () => { __resetMockFirestoreBehavior(); online(true); setCalendarClock(); await authenticate(null); });

    it.each([0, -60_000])('replays offline Settings 4→7 after a cold queue read under a tied/rolled-back enqueue clock (%i)', async rollback => {
        const clock = jest.spyOn(Date, 'now').mockReturnValue(1_806_321_600_000);
        const firstId = `z-first-${rollback}`; const secondId = `a-second-${rollback}`;
        const actualQueue = offlineManager.queueOperation.bind(offlineManager); let count = 0;
        const queue = jest.spyOn(offlineManager, 'queueOperation').mockImplementation((operation, description, options) => actualQueue(operation, description,
            options.descriptor?.type === 'preferences.saveWeeklyTarget' ? { ...options, id: count++ ? secondId : firstId } : options));
        try {
            online(false); field('#weekly-target-days-select', '4'); document.getElementById('weekly-target-save-btn').click();
            await wait(() => !document.getElementById('weekly-target-save-btn').disabled);
            clock.mockReturnValue(1_806_321_600_000 + rollback);
            field('#weekly-target-days-select', '7'); document.getElementById('weekly-target-save-btn').click();
            await wait(() => !document.getElementById('weekly-target-save-btn').disabled);
            expect(document.getElementById('weekly-target-days-select').value).toBe('7');
            const originals = offlineManager.pendingOperations.filter(entry => entry.descriptor.type === 'preferences.saveWeeklyTarget')
                .map(entry => ({ id: entry.id, timestamp: entry.timestamp, updatedAtIso: entry.descriptor.payload.updatedAtIso }));
            expect(originals.map(item => item.id)).toEqual([firstId, secondId]);
            offlineManager.pendingOperations = []; offlineManager.knownIntents.clear(); localFirstCache.memoryCache.clear();
            await offlineManager.restorePersistedQueue();
            expect(offlineManager.pendingOperations.filter(entry => entry.descriptor.type === 'preferences.saveWeeklyTarget')
                .map(entry => ({ id: entry.id, timestamp: entry.timestamp, updatedAtIso: entry.descriptor.payload.updatedAtIso }))).toEqual(originals);
            offlineManager.pendingOperations.reverse(); online(true); await offlineManager.processPendingOperations();
            expect(__firestoreState.documents.get(path).weeklyTargetDays).toBe(7);
            expect(document.getElementById('weekly-target-days-select').value).toBe('7');
            expect(document.getElementById('daily-hub-weekly-progress').textContent).toBe('0/7');
            expect(offlineManager.getPendingCount()).toBe(0);
        } finally { queue.mockRestore(); clock.mockRestore(); }
    });

    it.each([false, true])('a proven journal abort cannot leave a ghost Quick Log or issue RPC before a user retry (online=%s)', async isOnline => {
        let fail = true; let rpcWrites = 0;
        const restore = useIndexedAuthority(events => fail && events.some(event => event.kind === 'intent' && event.entry.descriptor.type === 'quicklog.save'));
        __setMockTransactionBeforeCommit(({ writes }) => { if (writes.some(write => write.reference.path.startsWith('users/A/sesiones_entrenamiento/'))) rpcWrites++; });
        try {
            online(isOnline); const first = await saveQuickLogEntry(input);
            expect(first.ok).toBe(false); expect(rpcWrites).toBe(0); expect(sessions()).toHaveLength(0);
            expect((await offlineManager.outbox.read()).entries.filter(entry => entry.descriptor.type === 'quicklog.save')).toHaveLength(0);
            fail = false; const retry = await saveQuickLogEntry(input);
            expect(retry).toMatchObject({ ok: true, queued: !isOnline });
            if (!isOnline) {
                const durable = (await offlineManager.outbox.read()).entries.filter(entry => entry.descriptor.type === 'quicklog.save');
                expect(durable).toHaveLength(1); expect(durable[0].descriptor.payload.sessionId).toBe(retry.data.sessionId);
                online(true); await offlineManager.processPendingOperations();
            }
            expect(sessions()).toHaveLength(1); expect(sessions()[0][0].endsWith(retry.data.sessionId)).toBe(true);
        } finally { restore(); __resetMockFirestoreBehavior(); }
    });

    it('keeps a conflicted parent and blocked child out of RPC, then clears that reviewed week after a deliberate new save', async () => {
        online(false);
        for (const value of ['4', '7']) {
            field('#weekly-target-days-select', value); document.getElementById('weekly-target-save-btn').click();
            await wait(() => !document.getElementById('weekly-target-save-btn').disabled);
        }
        const { createWeeklyTargetOperation, persistWeeklyTargetOperation } = await import('../../js/utils/weekly-preferences.js');
        await persistWeeklyTargetOperation({}, createWeeklyTargetOperation('A', '2026-11-23', 5, null, '2026-11-27T12:03:00.000Z'));
        online(true); await offlineManager.processPendingOperations();
        expect(__firestoreState.documents.get(path).weeklyTargetDays).toBe(5);
        expect(offlineManager.pendingOperations.filter(entry => entry.descriptor.type === 'preferences.saveWeeklyTarget').map(entry => entry.status)).toEqual(['conflict', 'blocked']);
        expect(document.getElementById('weekly-target-days-select').value).toBe('5');
        field('#weekly-target-days-select', '6'); document.getElementById('weekly-target-save-btn').click();
        await wait(() => !document.getElementById('weekly-target-save-btn').disabled);
        expect(__firestoreState.documents.get(path).weeklyTargetDays).toBe(6); expect(offlineManager.getPendingCount()).toBe(0);
    });

    it('returns queued with the same session identity after a committed RPC loses its acknowledgement', async () => {
        let lost = false;
        __setMockTransactionAfterCommit(({ writes }) => {
            if (!lost && writes.some(write => write.reference.path.startsWith('users/A/sesiones_entrenamiento/'))) {
                lost = true; throw Object.assign(new Error('RPC acknowledgement unavailable'), { code: 'unavailable' });
            }
        });
        const saved = await saveQuickLogEntry(input);
        expect(saved).toMatchObject({ ok: true, queued: true }); expect(sessions()).toHaveLength(1);
        const [pending] = (await offlineManager.outbox.read()).entries.filter(entry => entry.descriptor.type === 'quicklog.save');
        expect(pending.descriptor.payload.sessionId).toBe(saved.data.sessionId);
        const timestamp = pending.descriptor.payload.sessionData.fechaIso;
        __setMockTransactionAfterCommit(null); offlineManager.pendingOperations = []; localFirstCache.memoryCache.clear();
        await offlineManager.processPendingOperations();
        expect(sessions()).toHaveLength(1); expect(sessions()[0][1].fecha.toDate().toISOString()).toBe(timestamp);
        expect(offlineManager.getPendingCount()).toBe(0);
    });

    it('keeps Quick Log form notes available for a failed enqueue retry and persists exactly one accepted queued identity', async () => {
        let fail = true; let aborts = 0;
        const restore = useIndexedAuthority(events => {
            const abort = fail && events.some(event => event.kind === 'intent' && event.entry.descriptor.type === 'quicklog.save');
            if (abort) aborts++; return abort;
        });
        try {
            online(false); field('#quick-log-label', input.label); field('#quick-log-notes', input.notes);
            document.getElementById('quick-log-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            await wait(() => !document.getElementById('quick-log-save-btn').disabled);
            expect(aborts).toBe(1);
            expect(document.getElementById('quick-log-notes').value).toBe(input.notes);
            expect((await offlineManager.outbox.read()).entries.filter(entry => entry.descriptor.type === 'quicklog.save')).toHaveLength(0);
            fail = false; document.getElementById('quick-log-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            await wait(() => !document.getElementById('quick-log-save-btn').disabled);
            expect((await offlineManager.outbox.read()).entries.filter(entry => entry.descriptor.type === 'quicklog.save')).toHaveLength(1);
            online(true); await offlineManager.processPendingOperations(); expect(sessions()).toHaveLength(1);
        } finally { restore(); }
    });

    it('allows two deliberate identical captures as different persisted session identities', async () => {
        const first = await saveQuickLogEntry(input); const second = await saveQuickLogEntry(input);
        expect(first.ok && second.ok).toBe(true); expect(first.data.sessionId).not.toBe(second.data.sessionId);
        expect(sessions()).toHaveLength(2);
        expect(sessions().map(([_key, data]) => data.nombreEntrenamiento)).toEqual([input.label, input.label]);
    });

    it('reports accepted Quick Log success when only ack persistence fails, then flushes the ack without another RPC', async () => {
        let fail = true; let writes = 0;
        const restore = useIndexedAuthority(events => fail && events.some(event => event.kind === 'ack'));
        __setMockTransactionBeforeCommit(({ writes: entries }) => { if (entries.some(write => write.reference.path.startsWith('users/A/sesiones_entrenamiento/'))) writes++; });
        try {
            const saved = await saveQuickLogEntry(input); expect(saved).toMatchObject({ ok: true, queued: false });
            expect(sessions()).toHaveLength(1); expect(offlineManager.pendingAcknowledgements.size).toBe(1);
            fail = false; await offlineManager.processPendingOperations();
            expect(writes).toBe(1); expect(offlineManager.getPendingCount()).toBe(0); expect(sessions()).toHaveLength(1);
        } finally { restore(); __resetMockFirestoreBehavior(); }
    });

    it('keeps a known accepted result successful when a refresh invalidator and the UI callback throw', async () => {
        const unregister = registerSessionMutationInvalidator(() => { throw new Error('Injected post-commit observer failure'); });
        try {
            expect(await saveQuickLogEntry(input, () => { throw new Error('Injected UI callback failure'); })).toMatchObject({ ok: true, queued: false });
            expect(sessions()).toHaveLength(1);
        } finally { unregister(); }
    });
});
