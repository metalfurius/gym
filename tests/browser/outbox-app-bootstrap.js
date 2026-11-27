import { seed, ownerKey } from './outbox-app-environment.js';
import '../../js/app.js';
import { __authState, __firestoreState, __notifyAuthListeners } from '../mocks/firebase-state.js';
import { __setMockTransactionAfterCommit } from '../mocks/firebase-firestore.js';
import { saveQuickLogEntry, startSession, saveSessionData, getCurrentRoutineForSession, loadInProgressSession } from '../../js/modules/session-manager.js';
import { localFirstCache as cache } from '../../js/utils/local-first-cache.js';
import { offlineManager as manager, OfflineManager } from '../../js/utils/offline-manager.js';
import { OUTBOX_JOURNAL_PREFIX } from '../../js/utils/outbox-journal-storage.js';

const originalAdd = IDBObjectStore.prototype.add;
const originalMirror = cache.writeToLocalStorage.bind(cache);
const originalRead = manager.outbox.read.bind(manager.outbox);
const originalAppend = manager.outbox.storage.append.bind(manager.outbox.storage);
const originalCacheSet = cache.set.bind(cache);
const originalExecute = manager.executeWithOfflineHandling.bind(manager);
const originalRemoveItem = Storage.prototype.removeItem;
let releaseCapture;
let clock = Date.parse('2026-11-27T12:00:00.000Z');
Date.now = () => clock;
const nativeEvents = [];
const fixtureInput = { label: 'One intended workout', notes: 'Original browser notes', dateTime: '2026-11-27T12:00' };
function clearFault() {
    IDBObjectStore.prototype.add = originalAdd; cache.writeToLocalStorage = originalMirror;
    manager.outbox.read = originalRead; manager.outbox.storage.append = originalAppend; __setMockTransactionAfterCommit(null);
    cache.set = originalCacheSet; manager.executeWithOfflineHandling = originalExecute; Storage.prototype.removeItem = originalRemoveItem;
}
function sessionRows() {
    return [...__firestoreState.documents.entries()].filter(([key]) => key.startsWith(`users/${__authState.currentUser.uid}/sesiones_entrenamiento/`));
}
window.appOutboxFixture = {
    nativeEvents,
    async configure(owner) {
        clearFault(); seed(owner); localStorage.setItem(ownerKey, owner);
        __authState.currentUser = { uid: owner, email: `${owner}@example.test` };
        await __notifyAuthListeners(); await manager.queuePersistenceTail;
    },
    async nativeFault(mode, type = 'quicklog.save') {
        clearFault();
        const duplicateKey = (await cache.getAllFromIndexedDb(OUTBOX_JOURNAL_PREFIX))[0]?.key;
        IDBObjectStore.prototype.add = function(entry, ...args) {
            const events = entry?.key?.startsWith(OUTBOX_JOURNAL_PREFIX) ? JSON.parse(entry.value.eventsJson) : [];
            const matches = events.some(event => (mode === 'ack-abort' ? event.kind === 'ack' : event.kind === 'intent')
                && event.entry?.descriptor?.type === type);
            const request = originalAdd.call(this, matches && mode === 'request-error-complete' ? { ...entry, key: duplicateKey } : entry, ...args);
            if (matches) {
                const tx = this.transaction;
                request.addEventListener('success', () => { nativeEvents.push({ mode, event: 'request-success' }); if (mode !== 'request-error-complete') tx.abort(); });
                request.addEventListener('error', event => { nativeEvents.push({ mode, event: 'request-error' }); if (mode === 'request-error-complete') event.preventDefault(); });
                tx.addEventListener('abort', () => nativeEvents.push({ mode, event: 'tx-abort' }));
                tx.addEventListener('complete', () => nativeEvents.push({ mode, event: 'tx-complete' }));
            }
            return request;
        };
    },
    mirrorFault() { clearFault(); cache.writeToLocalStorage = entry => entry.key.startsWith(OUTBOX_JOURNAL_PREFIX) ? false : originalMirror(entry); },
    refreshFault() {
        clearFault(); let failNext = false;
        manager.outbox.storage.append = async events => { const receipt = await originalAppend(events); failNext = true; return receipt; };
        manager.outbox.read = () => { if (failNext) { failNext = false; throw new Error('Injected post-commit refresh failure'); } return originalRead(); };
    },
    lostRpcAcknowledgement() {
        clearFault(); let lost = false;
        __setMockTransactionAfterCommit(({ writes }) => {
            if (!lost && writes.some(write => write.reference.path.includes('/sesiones_entrenamiento/'))) {
                lost = true; throw Object.assign(new Error('Injected RPC acknowledgement unavailable'), { code: 'unavailable' });
            }
        });
    },
    unknownJournalCompletion() {
        clearFault(); let lost = false;
        manager.outbox.storage.append = async events => {
            const receipt = await originalAppend(events);
            if (!lost) { lost = true; throw new Error('Injected journal completion reply loss'); }
            return receipt;
        };
    },
    draftCleanupFault() {
        clearFault(); const key = `gymTracker_inProgressSession:${encodeURIComponent(__authState.currentUser.uid)}`;
        Storage.prototype.removeItem = function(candidate) {
            if (candidate === key) throw new Error('Injected native owned-draft cleanup failure');
            return originalRemoveItem.call(this, candidate);
        };
    },
    weeklyCacheFault() {
        clearFault(); const key = `user-preferences:${__authState.currentUser.uid}`;
        cache.set = (candidate, ...args) => {
            if (candidate === key) throw new Error('Injected advisory weekly cache failure');
            return originalCacheSet(candidate, ...args);
        };
    },
    holdQueuedCaptureCompletion() {
        clearFault(); this.captureCompletionHeld = false;
        const gate = new Promise(resolve => { releaseCapture = resolve; });
        manager.executeWithOfflineHandling = async (...args) => {
            try { return await originalExecute(...args); }
            catch (error) { this.captureCompletionHeld = true; await gate; throw error; }
        };
    },
    releaseQueuedCaptureCompletion() { releaseCapture?.(); },
    async captureStart(name = 'One ongoing workout') {
        await startSession('capture-routine', [{ id: 'capture-routine', name,
            exercises: [{ name: 'Bench', type: 'strength', sets: 1, reps: '8', executionMode: 'two_hand' }] }]);
        for (const [selector, value] of [['input[name="weight-0-0"]', '50'], ['input[name="reps-0-0"]', '8']]) {
            const input = document.querySelector(selector); input.value = value; input.dispatchEvent(new Event('input', { bubbles: true }));
        }
    },
    async captureSave() { return await saveSessionData() || { ok: false }; },
    beginCaptureSave() { this.capturePending = this.captureSave(); },
    async finishCaptureSave() { return this.capturePending; },
    async restartOwnedMemory() {
        const user = __authState.currentUser;
        __authState.currentUser = null; await __notifyAuthListeners(); await manager.queuePersistenceTail;
        manager.pendingOperations = []; manager.knownIntents.clear(); manager.acknowledged.clear();
        manager.pendingAcknowledgements.clear(); manager.stagedIds.clear(); manager.unknownIds.clear();
        cache.memoryCache.clear(); __authState.currentUser = user; await __notifyAuthListeners(); await manager.queuePersistenceTail;
    },
    clearFault,
    setClock(value) { clock = value; },
    async save() {
        const result = await saveQuickLogEntry(fixtureInput);
        return { ok: result.ok, queued: result.queued, reason: result.reason, error: result.error?.message,
            sessionId: result.data?.sessionId, fechaIso: result.data?.fecha?.toDate().toISOString() };
    },
    async weekly(value, queueId) {
        const actualQueue = manager.queueOperation.bind(manager);
        manager.queueOperation = (operation, description, options) => actualQueue(operation, description,
            options.descriptor?.type === 'preferences.saveWeeklyTarget' ? { ...options, id: queueId } : options);
        try {
            const select = document.getElementById('weekly-target-days-select'); select.value = String(value);
            document.getElementById('weekly-target-save-btn').click();
            for (let count = 0; count < 400 && document.getElementById('weekly-target-save-btn').disabled; count++) await new Promise(resolve => setTimeout(resolve, 5));
            if (document.getElementById('weekly-target-save-btn').disabled) throw new Error('Weekly UI did not settle');
        } finally { manager.queueOperation = actualQueue; }
    },
    async coldQueue() {
        const cold = new OfflineManager(); cold.setActiveUser(__authState.currentUser.uid); await cold.restorePersistedQueue();
        return cold.pendingOperations.filter(entry => entry.descriptor.payload?.userId === __authState.currentUser.uid);
    },
    async replay() { await manager.processPendingOperations(); },
    state() {
        return { owner: __authState.currentUser.uid, online: navigator.onLine,
            sessions: sessionRows().map(([path, data]) => ({ path, sessionId: data.sessionId, fechaIso: data.fecha.toDate().toISOString() })),
            target: __firestoreState.documents.get(`users/${__authState.currentUser.uid}/app_data/user_preferences`)?.weeklyTargetDays,
            uiTarget: document.getElementById('weekly-target-days-select').value,
            capture: { routine: getCurrentRoutineForSession()?.name || null, visible: !document.getElementById('session-view').classList.contains('hidden'),
                saveEnabled: !document.getElementById('save-session-btn').disabled,
                weight: document.querySelector('input[name="weight-0-0"]')?.value, draft: loadInProgressSession() },
            pending: manager.pendingOperations.filter(entry => entry.descriptor.payload?.userId === __authState.currentUser.uid)
                .map(entry => ({ id: entry.id, descriptor: entry.descriptor, status: entry.status, timestamp: entry.timestamp })),
            nativeEvents: [...nativeEvents] };
    },
};
