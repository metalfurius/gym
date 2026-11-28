import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { OfflineManager } from '../../js/utils/offline-manager.js';
import { LocalFirstCache } from '../../js/utils/local-first-cache.js';
import { DurableOutbox } from '../../js/utils/durable-outbox.js';

const descriptor = userId => ({ type: 'preferences.saveWeeklyTarget', payload: { userId, target: 4 } });
const manager = () => new OfflineManager({ outbox: new DurableOutbox(new LocalFirstCache()) });
async function enqueue(client, id, userId = 'A') {
    client.queueOperation(null, id, { id, descriptor: descriptor(userId) });
    await client.persistQueue();
}

describe('independent durable outbox instances sharing real localStorage', () => {
    beforeEach(() => localStorage.clear());

    it.each([['A', 'A'], ['A', 'B']])('preserves both acknowledged pending intents across stale tabs for owners %s/%s', async (ownerA, ownerB) => {
        const a = manager(), b = manager();
        await Promise.all([a.restorePersistedQueue(), b.restorePersistedQueue()]);
        await enqueue(a, 'intent-A', ownerA);
        await enqueue(b, 'intent-B', ownerB);
        const cold = manager(); await cold.restorePersistedQueue();
        expect(cold.pendingOperations.map(entry => entry.id).sort()).toEqual(['intent-A', 'intent-B']);
        cold.setActiveUser(ownerA);
        expect(cold.getPendingCount()).toBe(ownerA === ownerB ? 2 : 1);
    });

    it('preserves simultaneous enqueues without navigator locks or a shared memory cache', async () => {
        const a = manager(), b = manager();
        await Promise.all([enqueue(a, 'intent-A'), enqueue(b, 'intent-B')]);
        const cold = manager(); await cold.restorePersistedQueue();
        expect(cold.pendingOperations.map(entry => entry.id).sort()).toEqual(['intent-A', 'intent-B']);
    });

    it('never resurrects an acknowledged intent when a stale tab persists it again', async () => {
        const a = manager(), stale = manager();
        await enqueue(a, 'intent-X'); await stale.restorePersistedQueue();
        await a.acknowledgeOperation('intent-X');
        await stale.persistQueue();
        const cold = manager(); await cold.restorePersistedQueue();
        expect(cold.pendingOperations).toHaveLength(0);
        expect(stale.pendingOperations).toHaveLength(0);
        // Even a late duplicate enqueue using the old stable identity loses to
        // the acknowledgement tombstone, after another complete cold reopen.
        await enqueue(stale, 'intent-X');
        const reopened = manager(); await reopened.restorePersistedQueue();
        expect(reopened.pendingOperations).toHaveLength(0);
    });

    it('does not erase another tab addition while acknowledging its own completed operation', async () => {
        const a = manager(), b = manager();
        await enqueue(a, 'intent-X'); await b.restorePersistedQueue();
        await enqueue(b, 'intent-Y', 'B');
        await a.acknowledgeOperation('intent-X');
        const cold = manager(); await cold.restorePersistedQueue();
        expect(cold.pendingOperations.map(entry => entry.id)).toEqual(['intent-Y']);
    });

    it('keeps remote conflicts monotonic and explicit resolution tombstones permanent', async () => {
        const a = manager(), stale = manager();
        a.queueOperation(null, 'target', { id: 'intent-X', descriptor: { type: 'preferences.saveWeeklyTarget', payload: { userId: 'A', weekKey: '2026-11-23' } } });
        await a.persistQueue(); await stale.restorePersistedQueue();
        const error = new Error('conflict'); error.result = { currentRevision: 3 };
        await a.markConflict('intent-X', error); await stale.persistQueue();
        expect(stale.pendingOperations[0].status).toBe('conflict');
        await a.resolveConflicts('A', '2026-11-23'); await stale.persistQueue();
        const cold = manager(); await cold.restorePersistedQueue();
        expect(cold.pendingOperations).toHaveLength(0);
    });

    it('migrates late legacy array writes without losing new work or importing old acknowledgements', async () => {
        const cache = new LocalFirstCache();
        await cache.set('offline:pending-operations:v1', [{ id: 'legacy-X', descriptor: descriptor('A') }], { requireDurable: true });
        const a = manager(); await a.restorePersistedQueue(); await a.acknowledgeOperation('legacy-X');
        await enqueue(a, 'new-Y');
        await cache.set('offline:pending-operations:v1', [{ id: 'legacy-X', descriptor: descriptor('A') }, { id: 'late-Z', descriptor: descriptor('B') }], { requireDurable: true });
        const cold = manager(); await cold.restorePersistedQueue();
        expect(cold.pendingOperations.map(entry => entry.id).sort()).toEqual(['late-Z', 'new-Y']);
    });

    it('retains foreign-owner work when a stale client clears only its known snapshot', async () => {
        const a = manager(), b = manager();
        await enqueue(a, 'intent-X', 'A'); await b.restorePersistedQueue();
        await enqueue(b, 'intent-Y', 'B');
        a.clearPending(); await a.queuePersistenceTail;
        const cold = manager(); await cold.restorePersistedQueue();
        expect(cold.pendingOperations.map(entry => entry.id)).toEqual(['intent-Y']);
    });

    it('rejects an atomic localStorage authority failure without leaving a partial intent or ack', async () => {
        const cache = new LocalFirstCache(); const outbox = new DurableOutbox(cache);
        const write = jest.spyOn(cache, 'writeToLocalStorage').mockReturnValue(false);
        try {
            await expect(outbox.save([{ id: 'intent-X', descriptor: descriptor('A') }])).rejects.toThrow('Durable local storage unavailable');
            await expect(outbox.save([], ['intent-X'])).rejects.toThrow('Durable local storage unavailable');
            expect((await outbox.read()).entries).toEqual([]);
        } finally { write.mockRestore(); }
    });
});
