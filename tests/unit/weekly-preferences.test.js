import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { __firestoreState, __resetMockFirebase } from '../mocks/firebase-state.js';
import { __resetMockFirestoreBehavior, __getMockTransactionAttempts, __setMockTransactionBeforeCommit } from '../mocks/firebase-firestore.js';
import { beginAccountSession } from '../../js/utils/account-scope.js';

let user = { uid: 'weekly-owner' };
jest.unstable_mockModule('../../js/auth.js', () => ({ getCurrentUser: () => user }));
const { createWeeklyTargetOperation, persistWeeklyTargetOperation, applyOptimisticWeeklyTarget,
    persistWeeklyOutcomes, normalizeWeeklyState } = await import('../../js/utils/weekly-preferences.js');
const { writeSessionDocument } = await import('../../js/utils/session-store.js');
const db = {};
const path = 'users/weekly-owner/app_data/user_preferences';
const iso = '2026-11-16T09:10:11.123Z';
const state = () => normalizeWeeklyState(__firestoreState.documents.get(path) || {});
const operation = (week, target, base = null, date = iso) => createWeeklyTargetOperation('weekly-owner', week, target, base, date);

describe('atomic weekly preference contract', () => {
    beforeEach(() => {
        __resetMockFirebase(); __resetMockFirestoreBehavior();
        user = { uid: 'weekly-owner' }; beginAccountSession(user.uid);
    });

    it('retries competing different-week commits and preserves metadata, aliases and frozen weeks', async () => {
        const frozen = { targetDays: 3, activeDays: 2, met: false, lockedAtIso: '2026-10-01T12:00:00Z', audit: 'keep' };
        __firestoreState.documents.set(path, { otherSetting: { preserved: true }, weeklyTargetDays: 3,
            weeklyOutcomesByWeek: { '2026-09-21': frozen } });
        const first = operation('2026-11-09', 4);
        const second = operation('2026-11-16', 5, null, '2026-11-10T01:00:00Z'); // Unsynchronized device clock.
        await Promise.all([persistWeeklyTargetOperation(db, first), persistWeeklyTargetOperation(db, second)]);
        expect(__getMockTransactionAttempts()).toBeGreaterThan(2);
        const saved = state();
        expect(saved.preferencesRevision).toBe(2);
        expect(saved.weeklyTargetsByWeek['2026-11-09'].targetDays).toBe(4);
        expect(saved.weeklyTargetsByWeek['2026-11-16'].targetSessions).toBe(5);
        expect(saved.weeklyTargetDays).toBe(5);
        expect(saved.otherSetting).toEqual({ preserved: true });
        expect(saved.weeklyOutcomesByWeek['2026-09-21']).toMatchObject(frozen);
        expect(saved.weeklyTargetsByWeek['2026-11-16'].updatedAtIso).toBe(second.updatedAtIso);
    });

    it('makes same-week concurrency an explicit conflict and never replays over an acknowledged newer edit', async () => {
        const first = operation('2026-11-16', 4);
        const competing = operation('2026-11-16', 6, null, '2099-01-01T00:00:00.000Z');
        const results = await Promise.allSettled([persistWeeklyTargetOperation(db, first), persistWeeklyTargetOperation(db, competing)]);
        expect(results.map(item => item.status).sort()).toEqual(['fulfilled', 'rejected']);
        const rejected = results.find(item => item.status === 'rejected');
        expect(rejected.reason.code).toBe('sync/conflict');
        const current = state().weeklyTargetsByWeek['2026-11-16'];
        const resolution = operation('2026-11-16', 7, current, '2026-11-16T11:00:00.000Z');
        await persistWeeklyTargetOperation(db, resolution);
        await persistWeeklyTargetOperation(db, first); // Acknowledgement lost on the first client.
        await expect(persistWeeklyTargetOperation(db, competing)).rejects.toMatchObject({ code: 'sync/conflict' });
        expect(state().weeklyTargetsByWeek['2026-11-16']).toMatchObject({ targetDays: 7, revision: 2,
            operationId: resolution.operationId, updatedAtIso: resolution.updatedAtIso });
        expect(state().updatedAt.toDate().toISOString()).toBe(resolution.updatedAtIso);
    });

    it('preserves an offline chain and its timestamps, and conflicts if another device changed its base', async () => {
        const first = operation('2026-11-16', 4);
        const optimistic = applyOptimisticWeeklyTarget(first, {});
        const second = operation('2026-11-16', 5, optimistic.weeklyTargetsByWeek['2026-11-16'], '2026-11-16T10:00:00.000Z');
        await persistWeeklyTargetOperation(db, first);
        await persistWeeklyTargetOperation(db, second);
        expect(state().weeklyTargetsByWeek['2026-11-16']).toMatchObject({ targetSessions: 5, revision: 2, updatedAtIso: second.updatedAtIso });
        const stale = operation('2026-11-16', 2, optimistic.weeklyTargetsByWeek['2026-11-16'], '2099-01-01T00:00:00Z');
        await expect(persistWeeklyTargetOperation(db, stale)).rejects.toMatchObject({ code: 'sync/conflict' });
        expect(state().weeklyTargetSessions).toBe(5);
    });

    it('migrates legacy queued descriptors idempotently without treating savesUsed or clock skew as a revision', async () => {
        const legacy = { userId: user.uid, weekKey: '2026-11-16', updatedAtIso: iso,
            weekRecord: { targetDays: 4, savesUsed: 999, updatedAtIso: iso } };
        await persistWeeklyTargetOperation(db, legacy);
        const latest = operation('2026-11-16', 5, state().weeklyTargetsByWeek['2026-11-16'], '2026-11-16T13:00:00.000Z');
        await persistWeeklyTargetOperation(db, latest);
        await persistWeeklyTargetOperation(db, legacy);
        expect(state().weeklyTargetDays).toBe(5);
        await expect(persistWeeklyTargetOperation(db, { ...legacy, updatedAtIso: '2099-01-01T00:00:00Z',
            weekRecord: { ...legacy.weekRecord, targetDays: 7, updatedAtIso: '2099-01-01T00:00:00Z' } }))
            .rejects.toMatchObject({ code: 'sync/conflict' });
    });

    it('does not finalize partial input, stale session revisions, or targets changed during transaction retries', async () => {
        const target = operation('2026-11-09', 4);
        await persistWeeklyTargetOperation(db, target);
        const expected = state().weeklyTargetsByWeek;
        const outcomes = { '2026-11-09': { targetSessions: 4, sessionCount: 4, activeDays: 2, met: true } };
        expect(await persistWeeklyOutcomes(db, user.uid, outcomes, expected, { complete: false, nowIso: iso, sessionRevision: 0 })).toBeNull();
        await writeSessionDocument(db, user.uid, 'new-session', { fechaIso: iso });
        expect((await persistWeeklyOutcomes(db, user.uid, outcomes, expected, { complete: true, nowIso: iso, sessionRevision: 0 })).changed).toBe(false);
        let changed = false;
        __setMockTransactionBeforeCommit(async () => {
            if (changed) return;
            changed = true;
            __setMockTransactionBeforeCommit(null);
            await persistWeeklyTargetOperation(db, operation('2026-11-09', 6, state().weeklyTargetsByWeek['2026-11-09']));
        });
        const result = await persistWeeklyOutcomes(db, user.uid, outcomes, expected, { complete: true, nowIso: iso, sessionRevision: 1 });
        expect(result.changed).toBe(false);
        expect(state().weeklyOutcomesByWeek['2026-11-09']).toBeUndefined();
        expect(state().weeklyTargetDays).toBe(6);
    });

    it('finalizes from complete consistent data without changing a user-edit timestamp or unrelated frozen outcomes', async () => {
        const target = operation('2026-11-09', 4);
        await persistWeeklyTargetOperation(db, target);
        const result = await persistWeeklyOutcomes(db, user.uid,
            { '2026-11-09': { targetDays: 4, activeDays: 2, sessionCount: 4, met: true } },
            state().weeklyTargetsByWeek, { complete: true, sessionRevision: 0, nowIso: '2026-11-23T00:00:00Z' });
        expect(result.changed).toBe(true);
        expect(state().updatedAtIso).toBe(iso);
        expect(state().weeklyTargetsByWeek['2026-11-09'].updatedAtIso).toBe(iso);
        expect(state().weeklyOutcomesByWeek['2026-11-09']).toMatchObject({ targetDays: 4, sessionCount: 4, activeDays: 2, met: true });
    });

    it('aborts an account change during a retried transaction, including A -> B -> A', async () => {
        __setMockTransactionBeforeCommit(async ({ writes }) => {
            if (!writes.length) return;
            user = { uid: 'other-owner' }; beginAccountSession(user.uid);
            user = { uid: 'weekly-owner' }; beginAccountSession(user.uid);
            __firestoreState.documents.set(path, { changedByOther: true });
        });
        await expect(persistWeeklyTargetOperation(db, operation('2026-11-16', 4))).rejects.toMatchObject({ code: 'sync/owner-changed' });
        expect(state().weeklyTargetsByWeek).toEqual({});
    });
});

it('does not let a delayed old-week intent replace an already finalized historical decision', async () => {
    __resetMockFirebase(); __resetMockFirestoreBehavior(); user = { uid: 'weekly-owner' }; beginAccountSession(user.uid);
    const frozen = { targetDays: 3, sessionCount: 3, activeDays: 1, met: true, lockedAtIso: iso };
    __firestoreState.documents.set(path, { weeklyOutcomesByWeek: { '2026-11-09': frozen } });
    await expect(persistWeeklyTargetOperation(db, operation('2026-11-09', 7))).rejects.toMatchObject({ code: 'sync/conflict' });
    expect(state().weeklyOutcomesByWeek['2026-11-09']).toMatchObject(frozen);
});

it('atomically finalizes a pre-target week using the preserved legacy baseline without changing its timestamp', async () => {
    __resetMockFirebase(); __resetMockFirestoreBehavior(); user = { uid: 'weekly-owner' }; beginAccountSession(user.uid);
    __firestoreState.documents.set(path, { weeklyTargetDays: 7 });
    const future = operation('2026-11-23', 5);
    await persistWeeklyTargetOperation(db, future);
    const result = await persistWeeklyOutcomes(db, user.uid,
        { '2026-11-16': { targetSessions: 7, sessionCount: 4, activeDays: 1, met: false } },
        state().weeklyTargetsByWeek, { complete: true, sessionRevision: 0, nowIso: '2026-11-23T12:00:00Z' });
    expect(result.changed).toBe(true);
    expect(state().weeklyOutcomesByWeek['2026-11-16']).toMatchObject({ targetDays: 7, sessionCount: 4, met: false });
    expect(state().updatedAtIso).toBe(future.updatedAtIso);
});
