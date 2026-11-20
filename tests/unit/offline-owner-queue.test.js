import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { OfflineManager } from '../../js/utils/offline-manager.js';
import { localFirstCache } from '../../js/utils/local-first-cache.js';
const key = 'offline:pending-operations:v1';
const descriptor = (userId, target = 4) => ({ type: 'target', payload: { userId, target, updatedAtIso: '2026-11-16T09:10:11.123Z' } });

describe('durable owner-scoped offline queue', () => {
    beforeEach(async () => {
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
        await localFirstCache.clearAll();
    });

    it('retains A work through cold reload and B replay, then processes it only when A returns', async () => {
        const first = new OfflineManager(); first.setActiveUser('A');
        first.queueOperation(null, 'A target', { descriptor: descriptor('A') }); await first.persistQueue();
        localFirstCache.memoryCache.clear();
        const restarted = new OfflineManager(); restarted.setActiveUser('B');
        const handler = jest.fn(async () => {}); restarted.registerOperationHandler('target', handler);
        await restarted.processPendingOperations();
        expect(handler).not.toHaveBeenCalled(); expect(restarted.getPendingCount()).toBe(0);
        expect(await localFirstCache.get(key)).toHaveLength(1);
        restarted.setActiveUser('A'); await restarted.processPendingOperations();
        expect(handler).toHaveBeenCalledWith(descriptor('A').payload);
        expect(await localFirstCache.get(key)).toBeNull();
    });

    it('keeps in-flight and newly queued operations durable and retains original retry timestamps', async () => {
        const manager = new OfflineManager(); manager.setActiveUser('A');
        const id = manager.queueOperation(null, 'A first', { descriptor: descriptor('A') }); await manager.persistQueue();
        const originalTimestamp = manager.pendingOperations[0].timestamp;
        let reject;
        manager.registerOperationHandler('target', () => new Promise((_resolve, no) => { reject = no; }));
        const processing = manager.processPendingOperations();
        for (let index = 0; index < 6 && !reject; index++) await Promise.resolve();
        manager.queueOperation(null, 'B later', { descriptor: descriptor('B', 7) }); await manager.persistQueue();
        expect((await localFirstCache.get(key)).map(item => item.id)).toContain(id);
        reject(new Error('unavailable')); await processing;
        expect(manager.pendingOperations.find(item => item.id === id).timestamp).toBe(originalTimestamp);
        expect((await localFirstCache.get(key)).map(item => item.descriptor.payload.updatedAtIso))
            .toEqual(['2026-11-16T09:10:11.123Z', '2026-11-16T09:10:11.123Z']);
    });

    it('persists visible conflicts across restart without retrying or discarding the intent', async () => {
        const first = new OfflineManager(); first.setActiveUser('A');
        first.queueOperation(null, 'conflict', { descriptor: descriptor('A') }); await first.persistQueue();
        const conflict = new Error('needs resolution'); conflict.code = 'sync/conflict'; conflict.result = { currentRevision: 3 };
        first.registerOperationHandler('target', async () => { throw conflict; }); await first.processPendingOperations();
        const second = new OfflineManager(); second.setActiveUser('A');
        const handler = jest.fn(); second.registerOperationHandler('target', handler); await second.processPendingOperations();
        expect(second.getConflictCount()).toBe(1); expect(handler).not.toHaveBeenCalled();
        expect(second.pendingOperations[0].descriptor.payload.target).toBe(4);
    });

    it('assigns different stable persisted identities to legacy queued sessions on the same day', async () => {
        const legacy = { type: 'session.save', payload: { userId: 'A', sessionData: { fechaIso: '2026-11-16T10:00:00Z' } } };
        await localFirstCache.set(key, [{ id: 'queue-one', timestamp: 1, descriptor: legacy }, { id: 'queue-two', timestamp: 2, descriptor: legacy }]);
        const manager = new OfflineManager(); await manager.restorePersistedQueue();
        expect(manager.pendingOperations.map(item => item.descriptor.payload.sessionId)).toEqual(['legacy-queue-one', 'legacy-queue-two']);
    });
});

it('does not acknowledge an offline intent when both durable stores cannot write', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const previous = localFirstCache.indexedDbEnabled; localFirstCache.indexedDbEnabled = false;
    const storage = jest.spyOn(localFirstCache, 'writeToLocalStorage').mockReturnValue(false);
    try {
        const manager = new OfflineManager();
        await expect(manager.executeWithOfflineHandling(async () => {}, 'save target', true, descriptor('A')))
            .rejects.toThrow('Durable local storage unavailable');
    } finally { storage.mockRestore(); localFirstCache.indexedDbEnabled = previous; }
});

it.each(['count', 'dispatch'])('quarantines an unverifiable legacy account intent instead of attributing its %s to B', async boundary => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    await localFirstCache.clearAll();
    const manager = new OfflineManager(); manager.setActiveUser('A');
    const handler = jest.fn(async () => {}); manager.registerOperationHandler('session.save', handler);
    manager.queueOperation(null, 'legacy owner missing', { descriptor: { type: 'session.save', payload: { sessionData: { fechaIso: '2026-11-20T10:00:00Z' } } } });
    await manager.persistQueue(); manager.setActiveUser('B');
    if (boundary === 'count') expect(manager.getPendingCount()).toBe(0);
    else { await manager.processPendingOperations(); expect(handler).not.toHaveBeenCalled(); }
    expect(manager.pendingOperations[0].status).toBe('unowned');
    expect(manager.getUnownedCount()).toBe(1);
    expect((await localFirstCache.get(key))[0].descriptor.payload.sessionData.fechaIso).toBe('2026-11-20T10:00:00Z');
});
