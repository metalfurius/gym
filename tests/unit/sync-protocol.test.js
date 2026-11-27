import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { __firestoreState, __resetMockFirebase } from '../mocks/firebase-state.js';
import { __resetMockFirestoreBehavior, __setMockDocumentResultHandler, __setMockTransactionBeforeCommit } from '../mocks/firebase-firestore.js';
import { beginAccountSession } from '../../js/utils/account-scope.js';
import { seedSyncProtocol } from '../utils/sync-protocol-fixture.js';

let user;
jest.unstable_mockModule('../../js/auth.js', () => ({ getCurrentUser: () => user }));
const { verifyAccountSyncProtocol } = await import('../../js/utils/sync-protocol.js');
const { persistWeeklyOutcomes, normalizeWeeklyState } = await import('../../js/utils/weekly-preferences.js');
const { writeSessionDocument, recoverSessionInvalidations } = await import('../../js/utils/session-store.js');
const { localFirstCache } = await import('../../js/utils/local-first-cache.js');
const uid = 'protocol-owner';
const globalPath = 'runtime_config/sync_protocol';
const policyPath = `users/${uid}/app_data/sync_protocol`;
const markerPath = `users/${uid}/app_data/session_revision`;
const preferencesPath = `users/${uid}/app_data/user_preferences`;
const outcomes = { '2026-11-09': { targetSessions: 3, sessionCount: 1, activeDays: 1, met: false } };
const options = proof => ({ complete: true, sessionRevision: 0, protocolProof: proof, nowIso: '2026-11-20T12:00:00Z' });
const sessionPath = id => `users/${uid}/sesiones_entrenamiento/${id}`;
const receiptPath = (id, kind) => `users/${uid}/session_mutations/${id}/receipts/${kind}`;

describe('server fence proof and atomic onboarding', () => {
    beforeEach(() => {
        __resetMockFirebase(); __resetMockFirestoreBehavior();
        user = { uid }; beginAccountSession(uid);
    });

    it.each(['absent', 'wrong-epoch', 'cached', 'pending'])('keeps old-writer data renderable but cannot freeze with a %s global proof', async kind => {
        if (kind !== 'absent') seedSyncProtocol(uid);
        if (kind === 'wrong-epoch') __firestoreState.documents.set(globalPath, { version: 1, epoch: 'other' });
        if (kind === 'cached' || kind === 'pending') {
            __setMockDocumentResultHandler((snapshot, ref) => ref.path === globalPath
                ? { ...snapshot, metadata: { fromCache: kind === 'cached', hasPendingWrites: kind === 'pending' } } : snapshot);
        }
        const proof = await verifyAccountSyncProtocol({}, uid);
        expect(proof).toBeNull();
        expect(__firestoreState.documents.has(policyPath)).toBe(false);
        const before = normalizeWeeklyState({ weeklyTargetDays: 3 });
        // A legacy writer can add another session without a counter here. The
        // observed counter therefore proves nothing without the server fence.
        __firestoreState.documents.set(`users/${uid}/sesiones_entrenamiento/unmarked`, { userId: uid });
        expect(await persistWeeklyOutcomes({}, uid, outcomes, before.weeklyTargetsByWeek, options(proof))).toBeNull();
        expect(__firestoreState.documents.has(preferencesPath)).toBe(false);
    });

    it('creates the immutable UID policy and initializes the current marker in one atomic commit', async () => {
        seedSyncProtocol(uid);
        __firestoreState.documents.set(markerPath, { revision: 12, lastSessionId: 'old' });
        const commits = [];
        __setMockTransactionBeforeCommit(({ writes }) => { if (writes.length) commits.push(writes.map(write => write.reference.path)); });
        expect(await verifyAccountSyncProtocol({}, uid)).toEqual({ userId: uid, version: 1, epoch: 'gym-sync-v1-2026-11' });
        expect(commits).toEqual([[policyPath, markerPath]]);
        expect(__firestoreState.documents.get(policyPath)).toEqual({ version: 1, epoch: 'gym-sync-v1-2026-11' });
        expect(__firestoreState.documents.get(markerPath)).toEqual({ revision: 12, lastSessionId: null });
        commits.length = 0;
        await verifyAccountSyncProtocol({}, uid);
        expect(commits).toEqual([]); // Existing policy never resets the counter.
    });

    it('retries onboarding if a legacy write advances the marker before activation', async () => {
        seedSyncProtocol(uid); let raced = false;
        __setMockTransactionBeforeCommit(({ writes }) => {
            if (raced || !writes.some(write => write.reference.path === policyPath)) return;
            raced = true; __firestoreState.documents.set(markerPath, { revision: 5, lastSessionId: 'concurrent' });
        });
        expect(await verifyAccountSyncProtocol({}, uid)).not.toBeNull();
        expect(__firestoreState.documents.get(markerPath)).toEqual({ revision: 5, lastSessionId: null });
    });

    it.each(['policy', 'marker'])('refuses finalization when an existing %s is invalid', async kind => {
        const proof = seedSyncProtocol(uid, { activated: true });
        if (kind === 'policy') __firestoreState.documents.set(policyPath, { version: 1, epoch: 'wrong' });
        else __firestoreState.documents.set(markerPath, { revision: '0', lastSessionId: null });
        expect(await verifyAccountSyncProtocol({}, uid)).toBeNull();
        expect((await persistWeeklyOutcomes({}, uid, outcomes, {}, options(proof))).changed).toBe(false);
    });

    it('revalidates the global and UID policy and session revision on every outcome transaction retry', async () => {
        const proof = seedSyncProtocol(uid, { activated: true });
        let raced = false;
        __setMockTransactionBeforeCommit(({ writes }) => {
            if (raced || !writes.some(write => write.reference.path === preferencesPath)) return;
            raced = true; __firestoreState.documents.set(markerPath, { revision: 1, lastSessionId: 'new-session' });
        });
        expect((await persistWeeklyOutcomes({}, uid, outcomes, {}, options(proof))).changed).toBe(false);
        expect(__firestoreState.documents.has(preferencesPath)).toBe(false);
        __setMockTransactionBeforeCommit(null);
        __firestoreState.documents.delete(globalPath);
        expect((await persistWeeklyOutcomes({}, uid, outcomes, {}, { ...options(proof), sessionRevision: 1 })).changed).toBe(false);
        expect(__firestoreState.documents.get(policyPath)).toBeDefined();
    });

    it('writes schema 3, increments the preference revision and preserves the original edit timestamp', async () => {
        const proof = seedSyncProtocol(uid, { activated: true });
        __firestoreState.documents.set(preferencesPath, { weeklyTargetDays: 3, preferencesRevision: 6,
            updatedAtIso: '2026-11-01T02:03:04.000Z', unknown: 'keep' });
        expect((await persistWeeklyOutcomes({}, uid, outcomes, {}, options(proof))).changed).toBe(true);
        expect(__firestoreState.documents.get(preferencesPath)).toMatchObject({ schemaVersion: 3, preferencesRevision: 7,
            updatedAtIso: '2026-11-01T02:03:04.000Z', unknown: 'keep' });
    });

    it('fences create/delete by the exact persisted session ID and keeps retries idempotent', async () => {
        seedSyncProtocol(uid, { activated: true, revision: 2 });
        await writeSessionDocument({}, uid, 'session-a', { userId: uid });
        expect(__firestoreState.documents.get(markerPath)).toEqual({ revision: 3, lastSessionId: 'session-a' });
        await writeSessionDocument({}, uid, 'session-a', { userId: uid });
        expect(__firestoreState.documents.get(markerPath).revision).toBe(3);
        await writeSessionDocument({}, uid, 'session-a', null, { remove: true });
        expect(__firestoreState.documents.get(markerPath)).toEqual({ revision: 4, lastSessionId: 'session-a' });
    });

    it('does not resurrect a deleted persisted ID when a lost-ack create is replayed later', async () => {
        seedSyncProtocol(uid, { activated: true });
        const sessionPath = `users/${uid}/sesiones_entrenamiento/ack-lost`;
        await writeSessionDocument({}, uid, 'ack-lost', { userId: uid, nombreEntrenamiento: 'Original' });
        // The create acknowledgement is lost; a second client deletes the ID
        // before the original durable descriptor reconnects and replays it.
        await writeSessionDocument({}, uid, 'ack-lost', null, { remove: true });
        const revisionAfterDelete = __firestoreState.documents.get(markerPath).revision;
        await writeSessionDocument({}, uid, 'ack-lost', { userId: uid, nombreEntrenamiento: 'Original' });
        expect(__firestoreState.documents.has(sessionPath)).toBe(false);
        expect(__firestoreState.documents.get(markerPath).revision).toBe(revisionAfterDelete);
    });

    it('tombstones an absent legacy ID without incrementing the session revision', async () => {
        seedSyncProtocol(uid, { activated: true, revision: 8 });
        await writeSessionDocument({}, uid, 'legacy-absent', null, { remove: true });
        expect(__firestoreState.documents.get(receiptPath('legacy-absent', 'delete'))).toEqual({
            sessionId: 'legacy-absent', kind: 'delete', changed: false, revision: 8,
        });
        await writeSessionDocument({}, uid, 'legacy-absent', { userId: uid });
        expect(__firestoreState.documents.has(sessionPath('legacy-absent'))).toBe(false);
        expect(__firestoreState.documents.get(markerPath).revision).toBe(8);
    });

    it('receipts a legacy existing create as a no-op and preserves later same-ID corrections', async () => {
        seedSyncProtocol(uid, { activated: true, revision: 4 });
        __firestoreState.documents.set(sessionPath('legacy'), { userId: uid, value: 'original legacy' });
        await writeSessionDocument({}, uid, 'legacy', { userId: uid, value: 'stale queued' });
        expect(__firestoreState.documents.get(receiptPath('legacy', 'create'))).toEqual({
            sessionId: 'legacy', kind: 'create', changed: false, revision: 4,
        });
        __firestoreState.documents.set(sessionPath('legacy'), { userId: uid, value: 'future editor correction' });
        await writeSessionDocument({}, uid, 'legacy', { userId: uid, value: 'stale queued' });
        expect(__firestoreState.documents.get(sessionPath('legacy')).value).toBe('future editor correction');
        expect(__firestoreState.documents.get(markerPath).revision).toBe(4);
    });

    it.each(['create', 'delete'])('retries a competing %s so delete wins without resurrection', async firstHeld => {
        seedSyncProtocol(uid, { activated: true });
        // Independent clients do not share the browser cache lock. Keep the
        // actual Firestore reducers/MVCC and bypass only this process's cache.
        const separateClients = jest.spyOn(localFirstCache, 'withSessionMutation').mockImplementation((_owner, operation) => operation());
        let release; let held = false;
        const gate = new Promise(resolve => { release = resolve; });
        __setMockTransactionBeforeCommit(async ({ writes }) => {
            if (!held && writes.some(write => write.reference.path === receiptPath('competing', firstHeld))) {
                held = true; await gate;
            }
        });
        const create = () => writeSessionDocument({}, uid, 'competing', { userId: uid });
        const remove = () => writeSessionDocument({}, uid, 'competing', null, { remove: true });
        try {
            const pending = firstHeld === 'create' ? create() : remove();
            for (let count = 0; count < 100 && !held; count++) await Promise.resolve();
            expect(held).toBe(true);
            await (firstHeld === 'create' ? remove() : create());
            release(); await pending;
            await create();
            expect(__firestoreState.documents.has(sessionPath('competing'))).toBe(false);
            expect(__firestoreState.documents.has(receiptPath('competing', 'delete'))).toBe(true);
        } finally { release(); __setMockTransactionBeforeCommit(null); separateClients.mockRestore(); }
    });

    it('bounds the client transaction to four document reads and three real-change writes', async () => {
        seedSyncProtocol(uid, { activated: true });
        const attempts = [];
        __setMockTransactionBeforeCommit(({ reads, writes }) => attempts.push({ reads: reads.size, writes: writes.length }));
        await writeSessionDocument({}, uid, 'bounded', { userId: uid });
        await writeSessionDocument({}, uid, 'bounded', null, { remove: true });
        await writeSessionDocument({}, uid, 'bounded', { userId: uid });
        expect(attempts).toEqual([{ reads: 4, writes: 3 }, { reads: 4, writes: 3 }, { reads: 4, writes: 0 }]);
        // These are SDK counts. Real 10/20 rule-access limits are checked by the
        // parent's emulator suite; a client mock cannot establish that result.
    });

    it.each(['create', 'delete'])('does not recover an unresolved %s from current session presence/absence', async kind => {
        seedSyncProtocol(uid, { activated: true });
        if (kind === 'create') __firestoreState.documents.set(sessionPath('unresolved'), { userId: uid });
        const write = jest.spyOn(localFirstCache, 'writeToLocalStorage');
        await localFirstCache.withSessionMutation(uid, async () => { write.mockReturnValue(false); }, { sessionId: 'unresolved', kind });
        write.mockRestore();
        expect(await recoverSessionInvalidations({}, uid)).toBe(0);
        await localFirstCache.clearByPrefix(`daily-hub:${uid}:`);
        expect(await localFirstCache.set(`daily-hub:${uid}:weekly`, ['must stay blocked'])).toBeNull();
    });

    it('recovers a lost-ack create barrier from its immutable delete tombstone after cold reopening', async () => {
        seedSyncProtocol(uid, { activated: true });
        const write = jest.spyOn(localFirstCache, 'writeToLocalStorage');
        await localFirstCache.withSessionMutation(uid, async () => { write.mockReturnValue(false); }, { sessionId: 'tombstoned', kind: 'create' });
        write.mockRestore(); localFirstCache.memoryCache.clear();
        __firestoreState.documents.set(receiptPath('tombstoned', 'delete'), { sessionId: 'tombstoned', kind: 'delete', changed: false, revision: 0 });
        expect(await recoverSessionInvalidations({}, uid)).toBe(4);
        expect(await localFirstCache.set(`daily-hub:${uid}:weekly`, ['fresh'])).not.toBeNull();
    });

    it('does not settle a barrier using a cached receipt', async () => {
        seedSyncProtocol(uid, { activated: true });
        const write = jest.spyOn(localFirstCache, 'writeToLocalStorage');
        await localFirstCache.withSessionMutation(uid, async () => { write.mockReturnValue(false); }, { sessionId: 'cached', kind: 'delete' });
        write.mockRestore();
        __firestoreState.documents.set(receiptPath('cached', 'delete'), { sessionId: 'cached', kind: 'delete', changed: false, revision: 0 });
        __setMockDocumentResultHandler(snapshot => ({ ...snapshot, metadata: { fromCache: true, hasPendingWrites: false } }));
        expect(await recoverSessionInvalidations({}, uid)).toBe(0);
        expect(await localFirstCache.set(`daily-hub:${uid}:weekly`, ['must stay blocked'])).toBeNull();
    });

    it('does not use an old recovery receipt after A -> B -> A changes the auth generation', async () => {
        seedSyncProtocol(uid, { activated: true });
        const write = jest.spyOn(localFirstCache, 'writeToLocalStorage');
        await localFirstCache.withSessionMutation(uid, async () => { write.mockReturnValue(false); }, { sessionId: 'old-scope', kind: 'create' });
        write.mockRestore();
        __firestoreState.documents.set(receiptPath('old-scope', 'create'), { sessionId: 'old-scope', kind: 'create', changed: true, revision: 1 });
        let release; let held;
        const gate = new Promise(resolve => { release = resolve; });
        __setMockDocumentResultHandler((snapshot, ref) => {
            if (ref.path === receiptPath('old-scope', 'create')) { held = snapshot; return gate; }
            return snapshot;
        });
        const recovering = recoverSessionInvalidations({}, uid);
        for (let count = 0; count < 100 && !held; count++) await Promise.resolve();
        expect(held).toBeDefined();
        user = { uid: 'other' }; beginAccountSession('other'); user = { uid }; beginAccountSession(uid);
        release(held);
        expect(await recovering).toBe(0);
        expect(await localFirstCache.set(`daily-hub:${uid}:weekly`, ['must stay blocked'])).toBeNull();
    });

    it('does not start a real session transaction when durable invalidation cannot be written', async () => {
        seedSyncProtocol(uid, { activated: true });
        const fail = jest.spyOn(localFirstCache, 'writeToLocalStorage').mockReturnValue(false);
        try {
            await expect(writeSessionDocument({}, uid, 'blocked-session', { userId: uid })).rejects.toThrow();
            expect(__firestoreState.documents.has(`users/${uid}/sesiones_entrenamiento/blocked-session`)).toBe(false);
            expect(__firestoreState.documents.get(markerPath).revision).toBe(0);
        } finally { fail.mockRestore(); }
    });

    it('retains the original auth generation while session preflight awaits persistence', async () => {
        seedSyncProtocol(uid, { activated: true });
        let release; let held = false;
        const gate = new Promise(resolve => { release = resolve; });
        const write = localFirstCache.writeInvalidation.bind(localFirstCache);
        const delayed = jest.spyOn(localFirstCache, 'writeInvalidation').mockImplementation(async record => {
            if (!held) { held = true; await gate; }
            return write(record);
        });
        try {
            const pending = writeSessionDocument({}, uid, 'old-generation', { userId: uid });
            for (let index = 0; index < 100 && !held; index++) await Promise.resolve();
            expect(held).toBe(true);
            user = { uid: 'other' }; beginAccountSession('other'); user = { uid }; beginAccountSession(uid);
            release();
            await expect(pending).rejects.toMatchObject({ code: 'sync/owner-changed' });
            expect(__firestoreState.documents.has(`users/${uid}/sesiones_entrenamiento/old-generation`)).toBe(false);
        } finally { release(); delayed.mockRestore(); }
    });
});
