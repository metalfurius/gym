import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { __firestoreState, __resetMockFirebase } from '../mocks/firebase-state.js';
import { __resetMockFirestoreBehavior } from '../mocks/firebase-firestore.js';
import { beginAccountSession } from '../../js/utils/account-scope.js';
import { seedSyncProtocol } from '../utils/sync-protocol-fixture.js';
import { OfflineManager } from '../../js/utils/offline-manager.js';
import { DurableOutbox } from '../../js/utils/durable-outbox.js';
import { LocalFirstCache } from '../../js/utils/local-first-cache.js';

let user = { uid: 'A' };
jest.unstable_mockModule('../../js/auth.js', () => ({ getCurrentUser: () => user }));
const { createWeeklyTargetOperation, persistWeeklyTargetOperation, normalizeWeeklyState } = await import('../../js/utils/weekly-preferences.js');
const week = '2026-11-16', path = 'users/A/app_data/user_preferences';
const state = () => normalizeWeeklyState(__firestoreState.documents.get(path) || {});
const receipt = id => __firestoreState.documents.get(`${path}/weekly_operations/${id}`);
const make = () => {
    const manager = new OfflineManager({ outbox: new DurableOutbox(new LocalFirstCache()) });
    manager.setActiveUser('A');
    manager.registerOperationHandler('preferences.saveWeeklyTarget', payload => persistWeeklyTargetOperation({}, payload));
    return manager;
};
async function seedCoherentConflict(manager) {
    let stale;
    for (let index = 0; index < 6; index++) {
        const payload = createWeeklyTargetOperation('A', week, [4, 2, 6, 4, 6, 3][index],
            state().weeklyTargetsByWeek[week], `2026-11-20T10:0${index}:00.000Z`);
        await persistWeeklyTargetOperation({}, payload);
        if (index === 4) {
            stale = createWeeklyTargetOperation('A', week, 5,
                state().weeklyTargetsByWeek[week], '2026-11-20T10:04:30.000Z');
        }
    }
    manager.queueOperation(null, 'observed old conflict', { id: 'old-conflict', descriptor: { type: 'preferences.saveWeeklyTarget', payload: stale } });
    await manager.persistQueue(); await manager.processPendingOperations();
    expect(state().weeklyTargetsByWeek[week].revision).toBe(6);
    expect(receipt(stale.operationId)).toMatchObject({ status: 'conflict', currentRevision: 6, weekKey: week });
    return stale;
}
async function queueReplacement(manager, observed = manager.getObservedWeeklyConflictIds('A', week), id = 'replacement') {
    const payload = createWeeklyTargetOperation('A', week, 5, state().weeklyTargetsByWeek[week], '2026-11-20T11:00:00.000Z');
    const descriptor = { type: 'preferences.saveWeeklyTarget', payload, ...(observed === null ? {} : { observedWeeklyConflictIds: observed }) };
    manager.queueOperation(null, 'explicit replacement', { id, descriptor }); await manager.persistQueue();
    return payload;
}
async function retainConflict(manager, id, payload, canonicalWeek = payload.weekKey) {
    payload = { ...payload, ...(payload.operationId ? { operationId: `retained-${id}` } : {}) };
    manager.queueOperation(null, id, { id, descriptor: { type: 'preferences.saveWeeklyTarget', payload } });
    await manager.persistQueue(); await manager.markConflict(id, { result: { currentRevision: 6, ...(canonicalWeek ? { weekKey: canonicalWeek } : {}) } });
}
async function acknowledgementBatch(manager, id = 'replacement') {
    return (await manager.outbox.storage.readRows()).map(row => JSON.parse(row.value.eventsJson))
        .find(events => events.some(event => event.kind === 'ack' && event.id === id));
}

describe('observed weekly conflict resolution on accepted replay', () => {
    beforeEach(() => {
        localStorage.clear(); __resetMockFirebase(); __resetMockFirestoreBehavior();
        user = { uid: 'A' }; beginAccountSession(user.uid); seedSyncProtocol(user.uid, { activated: true });
    });

    it('atomically resolves the observed revision-6 conflict when its explicit replacement is replayed as revision 7', async () => {
        const manager = make(); await seedCoherentConflict(manager);
        const payload = await queueReplacement(manager);
        expect(payload.baseRevision).toBe(6);
        await manager.processPendingOperations();
        expect(receipt(payload.operationId)).toMatchObject({ status: 'applied', revision: 7, weekKey: week });
        expect(state().weeklyTargetsByWeek[week]).toMatchObject({ revision: 7, targetSessions: 5 });
        const cold = make(); await cold.restorePersistedQueue();
        expect(cold.acknowledged.get('replacement')).toBe('accepted');
        expect(cold.acknowledged.get('old-conflict')).toBe('resolved');
        expect(cold.pendingOperations).toHaveLength(0);
        expect((await acknowledgementBatch(cold)).map(event => [event.kind, event.id, event.outcome])).toEqual([
            ['ack', 'old-conflict', 'resolved'], ['ack', 'replacement', 'accepted'],
        ]);
        expect(JSON.stringify([...__firestoreState.documents.values()])).not.toContain('observedWeeklyConflictIds');
    });

    it('captures a fresh copied list bound to the active UID/week, including blocked children', async () => {
        const manager = make();
        expect(() => manager.getObservedWeeklyConflictIds('A', week)).toThrow(expect.objectContaining({ code: 'outbox/unverified' }));
        const old = await seedCoherentConflict(manager);
        await retainConflict(manager, 'foreign', { ...old, userId: 'B' });
        await retainConflict(manager, 'other-week', { ...old, weekKey: '2026-11-23' });
        manager.queueOperation(null, 'blocked child', { id: 'blocked-child', descriptor: { type: 'preferences.saveWeeklyTarget',
            payload: { ...old, operationId: 'blocked-child-operation', baseOperationId: old.operationId } } });
        await manager.persistQueue();
        const ids = manager.getObservedWeeklyConflictIds('A', week);
        expect(ids.sort()).toEqual(['blocked-child', 'old-conflict']); ids.push('not-observed');
        expect(manager.getObservedWeeklyConflictIds('A', week)).not.toContain('not-observed');
        manager.setActiveUser('B');
        expect(() => manager.getObservedWeeklyConflictIds('A', week)).toThrow(expect.objectContaining({ code: 'sync/owner-changed' }));
        manager.setActiveUser('A');
        expect(manager.getObservedWeeklyConflictIds('A', week).sort()).toEqual(['blocked-child', 'old-conflict']);
    });

    it.each(['direct', 'replay'])('resolves only captured eligible IDs through the shared %s acknowledgement path', async mode => {
        const manager = make(); const old = await seedCoherentConflict(manager);
        const observed = ['old-conflict', 'foreign', 'other-week'];
        const payload = await queueReplacement(manager, observed); observed.push('later-conflict');
        await retainConflict(manager, 'foreign', { ...old, userId: 'B' });
        await retainConflict(manager, 'other-week', { ...old, weekKey: '2026-11-23' });
        await retainConflict(manager, 'later-conflict', { ...old, operationId: 'later-conflict-operation' });
        if (mode === 'direct') {
            await persistWeeklyTargetOperation({}, payload); await manager.acknowledgeOperation('replacement');
        } else await manager.processPendingOperations();
        const cold = make(); await cold.restorePersistedQueue();
        expect(cold.acknowledged.get('old-conflict')).toBe('resolved');
        expect(cold.acknowledged.get('replacement')).toBe('accepted');
        expect(cold.pendingOperations.map(entry => entry.id).sort()).toEqual(['foreign', 'later-conflict', 'other-week']);
        expect(cold.knownIntents.get('replacement').descriptor.observedWeeklyConflictIds).not.toContain('later-conflict');
    });

    it.each(['abort', 'completion-unknown'])('keeps both ACKs atomic and recovers cold after %s following an applied revision-7 receipt', async failure => {
        const manager = make(); await seedCoherentConflict(manager);
        const payload = await queueReplacement(manager);
        const original = JSON.parse(JSON.stringify(manager.pendingOperations.find(entry => entry.id === 'replacement')));
        const append = manager.outbox.storage.append.bind(manager.outbox.storage);
        manager.outbox.storage.append = async events => {
            if (!events.some(event => event.kind === 'ack' && event.id === 'replacement')) return append(events);
            if (failure === 'completion-unknown') await append(events);
            throw Object.assign(new Error(`Injected ${failure}`), failure === 'abort' ? { provenNotCommitted: true } : {});
        };
        await manager.processPendingOperations();
        const applied = JSON.parse(JSON.stringify(receipt(payload.operationId)));
        expect(applied).toMatchObject({ status: 'applied', revision: 7 });
        const disk = await new DurableOutbox(new LocalFirstCache()).read();
        expect(disk.acknowledgements.has('replacement')).toBe(failure === 'completion-unknown');
        expect(disk.acknowledgements.has('old-conflict')).toBe(failure === 'completion-unknown');
        expect(disk.intents.get('replacement').descriptor).toEqual(original.descriptor);
        expect(disk.intents.get('replacement').timestamp).toBe(original.timestamp);
        const cold = make(); const handler = jest.fn(value => persistWeeklyTargetOperation({}, value));
        cold.registerOperationHandler('preferences.saveWeeklyTarget', handler);
        await cold.restorePersistedQueue(); await cold.processPendingOperations();
        expect(cold.acknowledged.get('replacement')).toBe('accepted'); expect(cold.acknowledged.get('old-conflict')).toBe('resolved');
        expect(cold.pendingOperations).toHaveLength(0);
        expect(state().weeklyTargetsByWeek[week].revision).toBe(7); expect(receipt(payload.operationId)).toEqual(applied);
        expect(handler).toHaveBeenCalledTimes(failure === 'abort' ? 1 : 0);
        await cold.processPendingOperations();
        expect(handler).toHaveBeenCalledTimes(failure === 'abort' ? 1 : 0);
        manager.outbox.storage.append = append; await manager.persistQueue();
        expect((await manager.outbox.read()).acknowledgements.get('old-conflict')).toBe('resolved');
        expect((await manager.outbox.read()).acknowledgements.get('replacement')).toBe('accepted');
        expect((await acknowledgementBatch(cold)).filter(event => event.kind === 'ack')).toHaveLength(2);
    });

    it('propagates a failed pre-ACK read and leaves the durable replacement recoverable from its applied receipt', async () => {
        const manager = make(); await seedCoherentConflict(manager); const payload = await queueReplacement(manager);
        await persistWeeklyTargetOperation({}, payload);
        const read = manager.outbox.read.bind(manager.outbox); let failed = false;
        manager.outbox.read = async () => { if (!failed) { failed = true; throw new Error('Injected pre-ACK read failure'); } return read(); };
        await expect(manager.acknowledgeOperation('replacement')).rejects.toThrow('Injected pre-ACK read failure');
        expect(manager.pendingAcknowledgements.has('replacement')).toBe(false);
        const cold = make(); await cold.restorePersistedQueue();
        expect(cold.pendingOperations.map(entry => entry.id).sort()).toEqual(['old-conflict', 'replacement']);
        await cold.processPendingOperations();
        expect(state().weeklyTargetsByWeek[week].revision).toBe(7); expect(cold.pendingOperations).toHaveLength(0);
    });

    it('keeps committed success if the combined ACK refresh and queue observer fail after the batch receipt', async () => {
        const manager = make(); await seedCoherentConflict(manager); const payload = await queueReplacement(manager);
        await persistWeeklyTargetOperation({}, payload);
        const append = manager.outbox.storage.append.bind(manager.outbox.storage), read = manager.outbox.read.bind(manager.outbox);
        let committed = false;
        manager.outbox.storage.append = async events => { const receipt = await append(events); committed = true; return receipt; };
        manager.outbox.read = async () => { if (committed) throw new Error('Injected postcommit refresh failure'); return read(); };
        manager.notifyQueueChange = jest.fn().mockRejectedValue(new Error('Injected observer failure'));
        await expect(manager.acknowledgeOperation('replacement')).resolves.toMatchObject({ committed: true });
        const cold = make(); await cold.restorePersistedQueue();
        expect(cold.acknowledged.get('replacement')).toBe('accepted'); expect(cold.acknowledged.get('old-conflict')).toBe('resolved');
        expect(cold.pendingOperations).toHaveLength(0);
    });

    it('fails closed on a persisted canonical fork after remote acceptance without committing either local ACK', async () => {
        const manager = make(); await seedCoherentConflict(manager); const payload = await queueReplacement(manager);
        await persistWeeklyTargetOperation({}, payload);
        await manager.outbox.storage.append([{ kind: 'conflict', id: 'old-conflict', conflict: { currentRevision: 6, weekKey: '2026-11-23' } }]);
        await expect(manager.acknowledgeOperation('replacement')).rejects.toMatchObject({ code: 'outbox/integrity' });
        expect(manager.queueViewVerified).toBe(false);
        const events = (await manager.outbox.storage.readRows()).flatMap(row => JSON.parse(row.value.eventsJson));
        expect(events.some(event => event.kind === 'ack' && ['replacement', 'old-conflict'].includes(event.id))).toBe(false);
        expect(receipt(payload.operationId)).toMatchObject({ status: 'applied', revision: 7 });
    });

    it('binds fresh eligibility to the selected week while allowing the accepted replacement to finish if a legacy ID learns another canonical week', async () => {
        const manager = make(); await seedCoherentConflict(manager);
        await manager.resolveConflicts('A', week);
        await retainConflict(manager, 'legacy-ambiguous', { userId: 'A', weeklyTargetDays: 4, updatedAtIso: '2026-11-20T10:00:00.000Z' }, null);
        const payload = await queueReplacement(manager, ['legacy-ambiguous']);
        const other = make(); await other.restorePersistedQueue();
        const save = manager.outbox.save.bind(manager.outbox); let learned = false;
        manager.outbox.save = async (entries, acknowledgements) => {
            if (!learned && acknowledgements.some(ack => ack.id === 'replacement')) {
                learned = true; await other.markConflict('legacy-ambiguous', { result: { currentRevision: 6, weekKey: '2026-11-23' } });
            }
            return save(entries, acknowledgements);
        };
        await manager.processPendingOperations();
        const disk = await manager.outbox.read();
        expect(receipt(payload.operationId)).toMatchObject({ status: 'applied', revision: 7 });
        expect(disk.acknowledgements.get('replacement')).toBe('accepted'); expect(disk.acknowledged.has('legacy-ambiguous')).toBe(false);
        expect(disk.entries.map(entry => entry.id)).toEqual(['legacy-ambiguous']);
        expect(disk.entries[0].conflict.weekKey).toBe('2026-11-23');
    });

    it('keeps accepted receipts permanent after an auth ABA and never resolves another account', async () => {
        const manager = make(); const old = await seedCoherentConflict(manager); const payload = await queueReplacement(manager);
        await retainConflict(manager, 'foreign', { ...old, userId: 'B' });
        await persistWeeklyTargetOperation({}, payload);
        user = { uid: 'B' }; beginAccountSession('B'); manager.setActiveUser('B');
        await manager.acknowledgeOperation('replacement');
        user = { uid: 'A' }; beginAccountSession('A'); manager.setActiveUser('A');
        await manager.acknowledgeOperation('replacement');
        const disk = await manager.outbox.read();
        expect(disk.acknowledgements.get('replacement')).toBe('accepted'); expect(disk.acknowledgements.get('old-conflict')).toBe('resolved');
        expect(disk.entries.map(entry => entry.id)).toEqual(['foreign']);
        expect(disk.intents.get('replacement').descriptor.observedWeeklyConflictIds).toEqual(['old-conflict']);
    });

    it('treats legacy descriptors without the optional field as an empty observation set without rewriting them', async () => {
        const manager = make(); await seedCoherentConflict(manager); const payload = await queueReplacement(manager, null);
        const original = JSON.parse(JSON.stringify(manager.pendingOperations.find(entry => entry.id === 'replacement').descriptor));
        await manager.processPendingOperations();
        const disk = await manager.outbox.read();
        expect(receipt(payload.operationId)).toMatchObject({ status: 'applied', revision: 7 });
        expect(disk.acknowledgements.get('replacement')).toBe('accepted'); expect(disk.acknowledged.has('old-conflict')).toBe(false);
        expect(disk.intents.get('replacement').descriptor).toEqual(original);
        expect(disk.intents.get('replacement').descriptor).not.toHaveProperty('observedWeeklyConflictIds');
    });

    it('rejects malformed observation metadata before queueing or executing a restored descriptor', async () => {
        const manager = make(); await manager.restorePersistedQueue();
        const entry = { id: 'malformed', timestamp: 1, descriptor: { type: 'preferences.saveWeeklyTarget',
            payload: { userId: 'A', weekKey: week }, observedWeeklyConflictIds: 'old-conflict' } };
        expect(() => manager.queueOperation(null, 'invalid', { id: entry.id, descriptor: entry.descriptor }))
            .toThrow(expect.objectContaining({ code: 'outbox/integrity' }));
        expect(manager.pendingOperations).toHaveLength(0);
        await manager.outbox.save([entry]);
        const cold = make(); const handler = jest.fn(); cold.registerOperationHandler('preferences.saveWeeklyTarget', handler);
        await expect(cold.processPendingOperations()).rejects.toMatchObject({ code: 'outbox/integrity' });
        expect(cold.queueViewVerified).toBe(false); expect(handler).not.toHaveBeenCalled();
    });
});
