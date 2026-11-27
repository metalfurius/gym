import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { LocalFirstCache } from '../../js/utils/local-first-cache.js';
import { DurableOutbox } from '../../js/utils/durable-outbox.js';
import { OfflineManager } from '../../js/utils/offline-manager.js';
import { OUTBOX_JOURNAL_PREFIX } from '../../js/utils/outbox-journal-storage.js';

const descriptor = (operationId, baseOperationId = null, weekKey = '2026-11-23') => ({ type: 'preferences.saveWeeklyTarget',
    payload: { userId: 'A', operationId, baseOperationId, weekKey, updatedAtIso: '2026-11-27T12:01:02.123Z' } });
const entry = (id, payload = descriptor(id)) => ({ id, timestamp: 100, descriptor: payload });
const create = cache => {
    const manager = new OfflineManager({ outbox: new DurableOutbox(cache || new LocalFirstCache()) });
    manager.setActiveUser('A'); return manager;
};
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function indexedCache() {
    const cache = new LocalFirstCache(); const disk = new Map();
    cache.initialized = true; cache.indexedDbEnabled = true; cache.indexedDbExpected = true; cache.dbPromise = Promise.resolve({});
    jest.spyOn(cache, 'getAllFromIndexedDb').mockImplementation(async prefix => [...disk.values()].filter(row => row.key.startsWith(prefix)));
    jest.spyOn(cache, 'readFromIndexedDb').mockImplementation(async key => disk.get(key) || null);
    jest.spyOn(cache, 'writeToIndexedDb').mockImplementation(async row => { disk.set(row.key, JSON.parse(JSON.stringify(row))); return true; });
    return { cache, disk };
}

beforeEach(() => { localStorage.clear(); Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }); });

describe('journal causal order and execution eligibility', () => {
    it.each([0, -60_000])('restores and reorders RAM causally under equal/rolled-back clocks (%i)', async rollback => {
        const clock = jest.spyOn(Date, 'now').mockReturnValue(10_000);
        try {
            const hot = create(); hot.queueOperation(null, 'first', { id: 'z-first', descriptor: descriptor('operation-A') }); await hot.persistQueue();
            clock.mockReturnValue(10_000 + rollback);
            hot.queueOperation(null, 'second', { id: 'a-second', descriptor: descriptor('operation-B', 'operation-A') }); await hot.persistQueue();
            const cold = create(); await cold.restorePersistedQueue();
            expect(cold.pendingOperations.map(item => item.id)).toEqual(['z-first', 'a-second']);
            expect(cold.pendingOperations.map(item => item.timestamp)).toEqual([10_000, 10_000 + rollback]);
            expect(cold.pendingOperations[1].semanticDependencyIds).toEqual(['z-first']);
            const calls = []; cold.registerOperationHandler('preferences.saveWeeklyTarget', async payload => { calls.push(payload.operationId); });
            cold.pendingOperations.reverse(); await cold.processPendingOperations();
            expect(calls).toEqual(['operation-A', 'operation-B']); expect(cold.getPendingCount()).toBe(0);
        } finally { clock.mockRestore(); }
    });

    it('resolves an imported parent operation ID before committing a staged child queue ID', async () => {
        const first = create(); first.queueOperation(null, 'A', { id: 'queue-A', descriptor: descriptor('operation-A') }); await first.persistQueue();
        const stale = create(); stale.queueOperation(null, 'B', { id: 'queue-B', descriptor: descriptor('operation-B', 'operation-A') });
        await stale.persistQueue();
        const cold = create(); await cold.restorePersistedQueue();
        expect(cold.pendingOperations.map(item => item.id)).toEqual(['queue-A', 'queue-B']);
        expect(cold.pendingOperations[1].semanticDependencyIds).toEqual(['queue-A']);
    });

    it.each(['baseOperationId', 'parentOperationId', 'predecessorOperationId'])('maps %s by operation identity, including acknowledged parents', async field => {
        const manager = create(); manager.queueOperation(null, 'A', { id: 'queue-A', descriptor: descriptor('operation-A') }); await manager.persistQueue();
        await manager.acknowledgeOperation('queue-A');
        const child = descriptor('operation-B'); child.payload[field] = 'operation-A';
        manager.queueOperation(null, 'B', { id: 'queue-B', descriptor: child }); await manager.persistQueue();
        expect(manager.pendingOperations[0].semanticDependencyIds).toEqual(['queue-A']);
        expect(manager.canExecuteOperation('queue-B')).toBe(true);
    });

    it('blocks the failed semantic chain while an unrelated week runs, then continues the chain after acceptance', async () => {
        const manager = create();
        manager.queueOperation(null, 'A', { id: 'A', descriptor: descriptor('op-A') });
        manager.queueOperation(null, 'B', { id: 'B', descriptor: descriptor('op-B', 'op-A') });
        manager.queueOperation(null, 'other week', { id: 'C', descriptor: descriptor('op-C', null, '2026-11-30') });
        let fail = true; const calls = [];
        manager.registerOperationHandler('preferences.saveWeeklyTarget', async payload => { calls.push(payload.operationId); if (payload.operationId === 'op-A' && fail) throw new Error('unavailable'); });
        await manager.processPendingOperations();
        expect(calls).toEqual(['op-A', 'op-C']); expect(manager.pendingOperations.map(item => item.id)).toEqual(['A', 'B']);
        await manager.markConflict('A', { result: { currentRevision: 9 } }); await manager.processPendingOperations();
        expect(calls).toEqual(['op-A', 'op-C']); expect(manager.pendingOperations.find(item => item.id === 'B').status).toBe('blocked');
        // A conflict is retained. A separate accepted proof (same stable ID)
        // unlocks B; deliberately resolving/cancelling A would not do so.
        fail = false; await manager.acknowledgeOperation('A'); await manager.processPendingOperations();
        expect(calls).toEqual(['op-A', 'op-C', 'op-B']);
    });

    it('does not treat cancellation or a missing known parent as semantic acceptance; remote-only bases still use CAS', async () => {
        const manager = create(); manager.queueOperation(null, 'A', { id: 'A', descriptor: descriptor('op-A') }); await manager.persistQueue();
        manager.queueOperation(null, 'B', { id: 'B', descriptor: descriptor('op-B', 'op-A') }); await manager.persistQueue();
        await manager.cancelOperation('A'); expect(manager.canExecuteOperation('B')).toBe(false);
        await manager.outbox.save([{ ...entry('missing-child'), semanticDependencyIds: ['missing-parent'], predecessorIds: ['missing-parent'] }]);
        await manager.restorePersistedQueue(); expect(manager.canExecuteOperation('missing-child')).toBe(false);
        manager.queueOperation(null, 'remote base', { id: 'remote', descriptor: descriptor('remote-op', 'never-in-local-journal') }); await manager.persistQueue();
        expect(manager.canExecuteOperation('remote')).toBe(true);
    });

    it('quarantines a causal cycle and rejects conflicting immutable IDs', async () => {
        const outbox = new DurableOutbox();
        await outbox.save([{ ...entry('A'), predecessorIds: ['B'] }, { ...entry('B'), predecessorIds: ['A'] }]);
        expect((await outbox.read()).entries.every(item => item.status === 'quarantined')).toBe(true);
        await outbox.storage.append([{ kind: 'intent', id: 'A', entry: entry('A', descriptor('DIFFERENT')) }]);
        await expect(outbox.read()).rejects.toThrow('conflicting durable outbox identity');
    });

    it('does not infer acceptance of a parent that provably failed before its first commit', async () => {
        const cache = new LocalFirstCache(); const manager = create(cache);
        const write = jest.spyOn(cache, 'writeToLocalStorage').mockReturnValue(false);
        manager.queueOperation(null, 'A', { id: 'A', descriptor: descriptor('op-A') });
        await expect(manager.persistQueue()).rejects.toMatchObject({ provenNotCommitted: true }); write.mockRestore();
        manager.queueOperation(null, 'B', { id: 'B', descriptor: descriptor('op-B', 'op-A') }); await manager.persistQueue();
        const cold = create(); await cold.restorePersistedQueue();
        expect(cold.pendingOperations.map(entry => entry.id)).toEqual(['B']);
        expect(cold.pendingOperations[0].semanticDependencyIds).toEqual(['A']);
        expect(cold.canExecuteOperation('B')).toBe(false);
        expect(cold.acknowledged.get('A')).toBe('cancelled');
    });

    it('uses a cold acknowledged identity as proof without leaking a staged ID or accepting a conflicting descriptor', async () => {
        const first = create(); first.queueOperation(null, 'A', { id: 'stable', descriptor: descriptor('op-A') }); await first.persistQueue();
        await first.acknowledgeOperation('stable');
        const cold = create(); cold.queueOperation(null, 'same stable intent', { id: 'stable', descriptor: descriptor('op-A') }); await cold.persistQueue();
        expect(cold.pendingOperations).toEqual([]); expect(cold.stagedIds.has('stable')).toBe(false);
        const invalid = create(); invalid.queueOperation(null, 'foreign collision', { id: 'stable', descriptor: descriptor('different-op') });
        await expect(invalid.persistQueue()).rejects.toThrow('Conflicting durable outbox identity');
        expect(invalid.pendingOperations[0].status).toBe('quarantined');
    });

    it.each(['accepted', 'cancelled'])('repairs a live verified %s receipt after storage eviction before executing a child', async outcome => {
        const manager = create(); manager.queueOperation(null, 'A', { id: 'A', descriptor: descriptor('op-A') }); await manager.persistQueue();
        if (outcome === 'accepted') await manager.acknowledgeOperation('A');
        else await manager.cancelOperation('A');
        localStorage.clear();
        manager.queueOperation(null, 'B', { id: 'B', descriptor: descriptor('op-B', 'op-A') });
        await manager.persistQueue();
        const cold = create(); await cold.restorePersistedQueue();
        expect(cold.acknowledged.get('A')).toBe(outcome);
        expect(cold.pendingOperations[0].semanticDependencyIds).toEqual(['A']);
        expect(cold.canExecuteOperation('B')).toBe(outcome === 'accepted');
    });

    it('quarantines a cross-owner parent rather than allowing another account to authorize execution', async () => {
        const outbox = new DurableOutbox(); const foreign = descriptor('foreign-op'); foreign.payload.userId = 'B';
        await outbox.save([entry('foreign', foreign), { ...entry('owned'), predecessorIds: ['foreign'], semanticDependencyIds: ['foreign'] }]);
        expect((await outbox.read()).entries.find(item => item.id === 'owned')).toMatchObject({ status: 'quarantined', quarantineReason: 'cross-owner-dependency' });
    });
});

describe('journal authority and commit boundaries', () => {
    it('stages without fire-and-forget persistence and atomically rolls back a proven authority failure', async () => {
        const cache = new LocalFirstCache(); const manager = create(cache);
        manager.queueOperation(null, 'A', { id: 'A', descriptor: descriptor('op-A') });
        manager.queueOperation(null, 'B', { id: 'B', descriptor: descriptor('op-B') });
        await Promise.resolve(); expect(cache.localStorageKeys(OUTBOX_JOURNAL_PREFIX)).toEqual([]);
        const write = jest.spyOn(cache, 'writeToLocalStorage').mockReturnValue(false);
        try { await expect(manager.persistQueue()).rejects.toMatchObject({ provenNotCommitted: true }); }
        finally { write.mockRestore(); }
        expect(manager.pendingOperations).toEqual([]); expect((await manager.outbox.read()).entries).toEqual([]);
        await manager.persistQueue(); expect((await manager.outbox.read()).entries).toEqual([]);
    });

    it('uses one authority write for intent/conflict/ack deltas and preserves opaque typed-codec fields', async () => {
        const cache = new LocalFirstCache(); const outbox = new DurableOutbox(cache);
        const opaque = { type: 'session.edit', payload: { userId: 'A', sessionId: 's', operationId: 'edit_01234567890123456789', predecessorOperationId: null,
            baseline: { negativeZero: { doubleValue: '-0' }, unknownInt64: { integerValue: '9223372036854775807' }, nan: { doubleValue: 'NaN' },
                stamp: { timestampValue: '2026-11-20T10:00:00.123456789Z' }, unknown: { future: ['unchanged'] } } } };
        const write = jest.spyOn(cache, 'writeToLocalStorage');
        const receipt = await outbox.save([{ ...entry('edit', opaque), status: 'conflict', conflict: { currentRevision: 4 } }, entry('other')], ['already-done']);
        expect(receipt).toMatchObject({ committed: true, committedIds: ['already-done', 'edit', 'other'] });
        expect(write).toHaveBeenCalledTimes(1);
        const rows = cache.localStorageKeys(OUTBOX_JOURNAL_PREFIX).map(key => cache.readFromLocalStorage(key));
        expect(rows).toHaveLength(1); expect(JSON.parse(rows[0].value.eventsJson)).toHaveLength(4);
        expect((await outbox.read()).entries.find(item => item.id === 'edit').descriptor).toEqual(opaque);
    });

    it('keeps IDB authority after a mirror failure and ignores an advisory-only ghost', async () => {
        const { cache, disk } = indexedCache(); const outbox = new DurableOutbox(cache);
        jest.spyOn(cache, 'writeToLocalStorage').mockReturnValue(false);
        expect(await outbox.save([entry('accepted')])).toMatchObject({ committed: true });
        expect(disk.size).toBe(1); expect((await outbox.read()).entries.map(item => item.id)).toEqual(['accepted']);
        const ghost = { key: `${OUTBOX_JOURNAL_PREFIX}ghost`, value: { version: 3, batchId: 'ghost', eventsJson: JSON.stringify([{ kind: 'intent', id: 'ghost', entry: entry('ghost') }]) }, cacheInvalidations: {} };
        localStorage.setItem(`gym-tracker-local-cache:${ghost.key}`, JSON.stringify(ghost));
        expect((await outbox.read()).entries.map(item => item.id)).toEqual(['accepted']);
    });

    it('retains an unknown commit identity instead of rolling it back and replaying a newly allocated ID', async () => {
        const { cache } = indexedCache(); const manager = create(cache); const write = cache.writeToIndexedDb.getMockImplementation();
        cache.writeToIndexedDb.mockImplementationOnce(async row => { await write(row); throw new Error('Unknown adapter completion after commit'); });
        const rpc = jest.fn();
        await expect(manager.executeWithOfflineHandling(rpc, 'save', true, descriptor('op-A'))).rejects.toMatchObject({ code: 'sync/queued' });
        expect(rpc).not.toHaveBeenCalled(); const [saved] = manager.pendingOperations;
        expect(manager.unknownIds.has(saved.id)).toBe(true);
        expect((await manager.outbox.read()).entries[0].id).toBe(saved.id);
        manager.registerOperationHandler('preferences.saveWeeklyTarget', rpc); await manager.processPendingOperations();
        expect(rpc).toHaveBeenCalledTimes(1); expect(manager.getPendingCount()).toBe(0);
    });

    it('reports a permanent RPC failure only after safe durable cancellation, retaining the ID if cancellation aborts', async () => {
        const { cache } = indexedCache(); const manager = create(cache); const write = cache.writeToIndexedDb.getMockImplementation();
        let failCancel = true;
        cache.writeToIndexedDb.mockImplementation(async row => {
            if (failCancel && JSON.parse(row.value.eventsJson).some(event => event.kind === 'ack' && event.outcome === 'cancelled')) throw Object.assign(new Error('Cancel aborted'), { provenNotCommitted: true });
            return write(row);
        });
        const denied = jest.fn(async () => { throw Object.assign(new Error('Denied'), { code: 'permission-denied' }); });
        await expect(manager.executeWithOfflineHandling(denied, 'save', true, descriptor('op-A'))).rejects.toMatchObject({ code: 'sync/queued' });
        expect((await manager.outbox.read()).entries).toHaveLength(1);
        failCancel = false; await manager.processPendingOperations();
        expect(denied).toHaveBeenCalledTimes(1); expect((await manager.outbox.read()).entries).toHaveLength(0);
        await expect(manager.executeWithOfflineHandling(denied, 'save', true, descriptor('op-B'))).rejects.toMatchObject({ code: 'permission-denied' });
        expect((await manager.outbox.read()).entries).toHaveLength(0);
    });

    it('does not fall back to LS when expected IDB aborts and does not resurrect a rolled-back staged intent', async () => {
        const { cache } = indexedCache(); const manager = create(cache); const write = cache.writeToIndexedDb;
        write.mockRejectedValueOnce(Object.assign(new Error('Native transaction abort'), { provenNotCommitted: true }));
        manager.queueOperation(null, 'A', { id: 'A', descriptor: descriptor('op-A') });
        await expect(manager.persistQueue()).rejects.toMatchObject({ provenNotCommitted: true });
        expect(cache.localStorageKeys(OUTBOX_JOURNAL_PREFIX)).toEqual([]);
        await manager.persistQueue(); expect((await manager.outbox.read()).entries).toEqual([]);
    });

    it.each([false, true])('serializes already-scheduled persists around a failed first batch (unknown commit=%s)', async unknownCommit => {
        const { cache } = indexedCache(); const manager = create(cache); const write = cache.writeToIndexedDb.getMockImplementation();
        const entered = deferred(); const release = deferred(); let first = true;
        cache.writeToIndexedDb.mockImplementation(async row => {
            if (first) {
                first = false; entered.resolve(); await release.promise;
                if (unknownCommit) await write(row);
                throw Object.assign(new Error('First batch completion failed'), unknownCommit ? {} : { provenNotCommitted: true });
            }
            return write(row);
        });
        manager.queueOperation(null, 'A', { id: 'A', descriptor: descriptor('op-A') });
        const attempt = manager.persistQueue(); const rejection = expect(attempt).rejects.toThrow('First batch'); await entered.promise;
        const queued = [manager.persistQueue(), manager.persistQueue()]; release.resolve(); await rejection; await Promise.all(queued);
        expect((await manager.outbox.read()).entries.map(entry => entry.id)).toEqual(unknownCommit ? ['A'] : []);
        expect(manager.pendingOperations.map(entry => entry.id)).toEqual(unknownCommit ? ['A'] : []);
    });

    it('preserves accepted enqueue and RPC results when refresh or ack persistence fails', async () => {
        const { cache } = indexedCache(); const manager = create(cache); const originalRead = manager.outbox.read.bind(manager.outbox);
        let reads = 0; jest.spyOn(manager.outbox, 'read').mockImplementation(() => ++reads === 3 ? Promise.reject(new Error('Post-commit refresh failed')) : originalRead());
        manager.queueOperation(null, 'A', { id: 'A', descriptor: descriptor('op-A') });
        expect(await manager.persistQueue()).toMatchObject({ committed: true });
        manager.outbox.read.mockRestore(); await manager.acknowledgeOperation('A');
        const originalWrite = cache.writeToIndexedDb.getMockImplementation();
        cache.writeToIndexedDb.mockImplementation(async row => {
            if (JSON.parse(row.value.eventsJson).some(event => event.kind === 'ack')) throw Object.assign(new Error('Ack abort'), { provenNotCommitted: true });
            return originalWrite(row);
        });
        const rpc = jest.fn(async () => ({ accepted: true }));
        await expect(manager.executeWithOfflineHandling(rpc, 'save', true, descriptor('op-B'))).resolves.toEqual({ accepted: true });
        expect(rpc).toHaveBeenCalledTimes(1); expect(manager.pendingAcknowledgements.size).toBe(1);
        cache.writeToIndexedDb.mockImplementation(originalWrite); await manager.processPendingOperations();
        expect(rpc).toHaveBeenCalledTimes(1); expect(manager.getPendingCount()).toBe(0);
    });

    it('retains the causal snapshot in a commit receipt when the shared pre-read was old and post-commit refresh fails', async () => {
        const manager = create(); const empty = await manager.outbox.read();
        const other = create(); other.queueOperation(null, 'A', { id: 'A', descriptor: descriptor('op-A') }); await other.persistQueue();
        const actualRead = manager.outbox.read.bind(manager.outbox); let reads = 0;
        const read = jest.spyOn(manager.outbox, 'read').mockImplementation(() => {
            reads++; if (reads === 1) return Promise.resolve(empty);
            if (reads === 3) return Promise.reject(new Error('Post-commit refresh unavailable'));
            return actualRead();
        });
        const rpc = jest.fn();
        await expect(manager.executeWithOfflineHandling(rpc, 'B save', true, descriptor('op-B', 'op-A'), { id: 'B' })).rejects.toMatchObject({ code: 'sync/queued' });
        expect(rpc).not.toHaveBeenCalled(); expect(manager.canExecuteOperation('B')).toBe(false);
        expect(manager.pendingOperations.find(entry => entry.id === 'B').semanticDependencyIds).toEqual(['A']);
        read.mockRestore(); const calls = [];
        manager.registerOperationHandler('preferences.saveWeeklyTarget', async payload => { calls.push(payload.operationId); });
        await manager.processPendingOperations(); expect(calls).toEqual(['op-A', 'op-B']);
    });

    it('does not reintroduce an acknowledged intent when a pre-commit restore finishes late', async () => {
        const manager = create(); manager.queueOperation(null, 'A', { id: 'A', descriptor: descriptor('op-A') }); await manager.persistQueue();
        const actualRead = manager.outbox.read.bind(manager.outbox); const actualAppend = manager.outbox.storage.append.bind(manager.outbox.storage);
        const gate = deferred(); const committed = deferred(); let oldRead; let hold = false;
        jest.spyOn(manager.outbox, 'read').mockImplementation(() => hold ? (hold = false, gate.promise) : actualRead());
        jest.spyOn(manager.outbox.storage, 'append').mockImplementation(async events => {
            const old = await actualRead(); hold = true; oldRead = manager.restorePersistedQueue();
            const receipt = await actualAppend(events); committed.resolve(old); return receipt;
        });
        const acknowledging = manager.acknowledgeOperation('A'); const old = await committed.promise;
        expect((await new DurableOutbox().read()).entries).toEqual([]);
        gate.resolve(old); await acknowledging; await oldRead;
        expect(manager.pendingOperations).toEqual([]); expect(manager.canExecuteOperation('A')).toBe(false);
    });

    it('unions both valid V1 copies with per-owner FIFO and quarantines contradictory FIFO instead of using timestamps', async () => {
        const { cache, disk } = indexedCache(); const outbox = new DurableOutbox(cache); const key = 'offline:pending-operations:v1';
        const local = { key, value: [entry('z-first'), entry('a-second')], cacheInvalidations: {} };
        cache.writeToLocalStorage(local); disk.set(key, { ...local, value: [entry('a-second'), entry('m-third')] });
        expect((await outbox.read()).entries.map(item => item.id)).toEqual(['z-first', 'a-second', 'm-third']);
        disk.set(key, { ...local, value: [entry('a-second'), entry('z-first')] });
        expect((await outbox.read()).entries.every(item => item.status === 'quarantined')).toBe(true);
    });

    it('preserves an explicitly linked transitive V2 chain and quarantines an unlinked same-week order', async () => {
        const cache = new LocalFirstCache(); const outbox = new DurableOutbox(cache);
        for (const value of [entry('A', descriptor('op-A')), entry('B', descriptor('op-B', 'op-A')), entry('C', descriptor('op-C', 'op-B'))]) {
            await cache.set(`offline:journal:v2:intent:${value.id}`, { version: 2, kind: 'intent', id: value.id, entry: value });
        }
        const linked = (await outbox.read()).entries;
        expect(linked.map(value => value.id)).toEqual(['A', 'B', 'C']); expect(linked.every(value => value.status !== 'quarantined')).toBe(true);
        await cache.set('offline:journal:v2:intent:D', { version: 2, kind: 'intent', id: 'D', entry: entry('D', descriptor('unlinked')) });
        expect((await outbox.read()).entries.every(value => value.status === 'quarantined')).toBe(true);
    });

    it('keeps an unpublished V2 acknowledgement identified but never invents acceptance for a dependent', async () => {
        const cache = new LocalFirstCache(); const manager = create(cache);
        await cache.set('offline:journal:v2:intent:A', { version: 2, kind: 'intent', id: 'A', entry: entry('A', descriptor('op-A')) });
        await cache.set('offline:journal:v2:ack:A', { version: 2, kind: 'ack', id: 'A' });
        await manager.restorePersistedQueue();
        expect(manager.pendingOperations[0]).toMatchObject({ id: 'A', status: 'quarantined', quarantineReason: 'unverified-legacy-ack' });
        manager.queueOperation(null, 'B', { id: 'B', descriptor: descriptor('op-B', 'op-A') }); await manager.persistQueue();
        expect(manager.canExecuteOperation('B')).toBe(false);
    });
});

describe('native journal transaction event contract', () => {
    it.each(['success-abort', 'request-error-complete', 'early-error-success-complete'])('waits for terminal proof: %s', async scenario => {
        const cache = new LocalFirstCache(); let request; let tx;
        cache.indexedDbEnabled = true; cache.dbPromise = Promise.resolve({ transaction: () => {
            request = {}; tx = { objectStore: () => ({ add: () => request }), abort: () => {} }; return tx;
        } });
        let settled = false;
        const write = cache.writeToIndexedDb({ key: 'journal-test' }, { journal: true });
        write.then(() => { settled = true; }, () => { settled = true; });
        await Promise.resolve(); await Promise.resolve();
        if (scenario === 'request-error-complete') request.onerror(); else request.onsuccess();
        tx.onerror(); await Promise.resolve(); expect(settled).toBe(false);
        if (scenario === 'success-abort') tx.onabort(); else tx.oncomplete();
        if (scenario === 'early-error-success-complete') await expect(write).resolves.toBe(true);
        else await expect(write).rejects.toMatchObject({ provenNotCommitted: true });
    });
});
