import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { LocalFirstCache } from '../../js/utils/local-first-cache.js';

function diskCache(records = new Map()) {
    const cache = new LocalFirstCache();
    cache.indexedDbEnabled = true; cache.indexedDbExpected = true; cache.initialized = true;
    cache.readFromIndexedDb = jest.fn(async key => records.get(key) || null);
    cache.writeToIndexedDb = jest.fn(async entry => { records.set(entry.key, JSON.parse(JSON.stringify(entry))); return true; });
    cache.getAllFromIndexedDb = jest.fn(async () => [...records.values()]);
    cache.deleteFromIndexedDb = jest.fn(async key => { records.delete(key); });
    return cache;
}

async function untilReleased(predicate) {
    for (let index = 0; index < 100 && !predicate(); index++) await Promise.resolve();
    expect(predicate()).toBeTruthy();
}

describe('LocalFirstCache', () => {
    let cache;

    beforeEach(() => {
        localStorage.clear();
        cache = new LocalFirstCache();
        cache.indexedDbEnabled = false; // Force localStorage fallback for deterministic tests
    });

    it('stores and retrieves values', async () => {
        await cache.set('routines:user-1', [{ id: 'r1' }]);

        const value = await cache.get('routines:user-1');
        expect(value).toEqual([{ id: 'r1' }]);
    });

    it('respects maxAge unless allowStale is true', async () => {
        const entry = await cache.set('history:user-1:page:1', [{ id: 's1' }]);
        entry.updatedAt = Date.now() - 60_000;
        cache.memoryCache.set('history:user-1:page:1', entry);

        const freshOnly = await cache.get('history:user-1:page:1', { maxAgeMs: 1_000 });
        const withStale = await cache.get('history:user-1:page:1', {
            maxAgeMs: 1_000,
            allowStale: true
        });

        expect(freshOnly).toBeNull();
        expect(withStale).toEqual([{ id: 's1' }]);
    });

    it('clears keys by prefix', async () => {
        await cache.set('history:user-1:page:1', [{ id: 's1' }]);
        await cache.set('history:user-1:page:2', [{ id: 's2' }]);
        await cache.set('calendar:user-1:2026-3', { a: 1 });

        await cache.clearByPrefix('history:user-1:');

        const firstPage = await cache.get('history:user-1:page:1');
        const secondPage = await cache.get('history:user-1:page:2');
        const calendar = await cache.get('calendar:user-1:2026-3');

        expect(firstPage).toBeNull();
        expect(secondPage).toBeNull();
        expect(calendar).toEqual({ a: 1 });
    });
});

describe('LocalFirstCache mutation durability', () => {
    it('removes cold localStorage pages and preserves another owner on offline restart', async () => {
        const first = new LocalFirstCache(); first.indexedDbEnabled = false;
        await first.set('history:A:page:1', { sessions: ['deleted-session'] });
        await first.set('history:B:page:1', { sessions: ['B-session'] });
        const fresh = new LocalFirstCache(); fresh.indexedDbEnabled = false;
        await fresh.clearByPrefix('history:A:');
        const restarted = new LocalFirstCache(); restarted.indexedDbEnabled = false;
        expect(await restarted.get('history:A:page:1')).toBeNull();
        expect(await restarted.get('history:B:page:1')).toEqual({ sessions: ['B-session'] });
    });

    it('does not resurrect a removed entry when its disk read finishes late', async () => {
        const cache = diskCache();
        let release;
        const read = cache.readFromIndexedDb;
        cache.readFromIndexedDb = jest.fn(key => key === 'history:A:page:1'
            ? new Promise(resolve => { release = resolve; }) : read(key));
        const reading = cache.getEntry('history:A:page:1');
        await untilReleased(() => typeof release === 'function');
        await cache.clearByPrefix('history:A:');
        release({ key: 'history:A:page:1', value: { sessions: ['deleted'] } });
        expect(await reading).toBeNull(); expect(cache.memoryCache.has('history:A:page:1')).toBe(false);
    });

    it('serializes disk deletion after an already pending disk write', async () => {
        const records = new Map(); const cache = diskCache(records);
        let release; const writeToDisk = cache.writeToIndexedDb;
        cache.writeToIndexedDb = jest.fn(entry => entry.key === 'calendar:A:2026-11'
            ? new Promise(resolve => { release = () => { records.set(entry.key, entry); resolve(true); }; }) : writeToDisk(entry));
        const write = cache.set('calendar:A:2026-11', ['old']);
        await untilReleased(() => typeof release === 'function');
        const invalidation = cache.clearByPrefix('calendar:A:');
        release(); await Promise.all([write, invalidation]);
        expect(records.has('calendar:A:2026-11')).toBe(false);
        expect(await cache.get('calendar:A:2026-11')).toBeNull();
    });

    it.each(['remove', 'clearByPrefix'])('%s cannot resurrect an aborted physical deletion on a cold offline restart', async method => {
        const records = new Map(); const warm = diskCache(records);
        await warm.set('history:A:page:1', { sessions: ['deleted'] });
        await warm.set('history:B:page:1', { sessions: ['B-only'] });
        warm.deleteFromIndexedDb.mockRejectedValue(new DOMException('transaction aborted', 'AbortError'));
        await warm[method](method === 'remove' ? 'history:A:page:1' : 'history:A:');
        expect(records.has('history:A:page:1')).toBe(true); // Physical cleanup really failed.
        const cold = diskCache(records);
        expect(await cold.get('history:A:page:1')).toBeNull();
        expect(await cold.get('history:B:page:1')).toEqual({ sessions: ['B-only'] });
        await cold.set('history:A:page:1', { sessions: ['new'] });
        expect(await diskCache(records).get('history:A:page:1')).toEqual({ sessions: ['new'] });
    });

    it('fails before the backend operation if durable stores cannot verify invalidation', async () => {
        const records = new Map(); const cache = diskCache(records);
        await cache.set('history:A:page:1', { sessions: ['old'] });
        const backend = jest.fn(async () => 'committed');
        cache.writeToIndexedDb.mockRejectedValue(new DOMException('put aborted', 'AbortError'));
        const localWrite = jest.spyOn(cache, 'writeToLocalStorage').mockReturnValue(false);
        await expect(cache.withSessionMutation('A', backend)).rejects.toThrow();
        expect(backend).not.toHaveBeenCalled();
        expect(records.has('history:A:page:1')).toBe(true);
        localWrite.mockRestore();
    });

    it('keeps a failed post-commit barrier across restart and recovers only on acknowledgement of the same immutable intent', async () => {
        const records = new Map(); const cache = diskCache(records);
        await cache.set('history:A:page:1', { sessions: ['old'] });
        await cache.set('progress:sessions:AB', { sessions: ['AB-only'] });
        const write = cache.writeToIndexedDb;
        await expect(cache.withSessionMutation('A', async () => {
            cache.writeToIndexedDb.mockRejectedValue(new DOMException('post-commit abort', 'AbortError'));
            return 'committed';
        }, { sessionId: 'same-id', kind: 'create' })).resolves.toBe('committed');
        const cold = diskCache(records);
        expect(await cold.get('history:A:page:1')).toBeNull();
        expect(await cold.get('progress:sessions:AB')).toEqual({ sessions: ['AB-only'] });
        cache.writeToIndexedDb = write;
        await cold.withSessionMutation('A', async () => 'acknowledged', { sessionId: 'same-id', kind: 'create' });
        await cold.set('history:A:page:1', { sessions: ['new'] });
        expect(await diskCache(records).get('history:A:page:1')).toEqual({ sessions: ['new'] });
    });

    it('never settles an unknown earlier RPC when another session mutation succeeds', async () => {
        const records = new Map(); const cache = diskCache(records);
        await expect(cache.withSessionMutation('A', async () => { throw new Error('ack unknown'); },
            { sessionId: 'late-delete', kind: 'delete' })).rejects.toThrow('ack unknown');
        await cache.withSessionMutation('A', async () => 'other accepted', { sessionId: 'other-create', kind: 'create' });
        await expect(cache.set('history:A:page:1', { sessions: ['late-delete'] }, { requireDurable: true }))
            .rejects.toMatchObject({ code: 'cache/persistence-unavailable' });
        const cold = diskCache(records);
        expect(await cold.get('history:A:page:1')).toBeNull();
        const confirm = jest.fn(async mutation => mutation.sessionId === 'other-create');
        expect(await cold.recoverSessionInvalidations('A', confirm)).toBe(0);
        expect(confirm).toHaveBeenCalledWith({ sessionId: 'late-delete', kind: 'delete' });
        await expect(cold.set('daily-hub:A:snapshot', { sessions: ['late-delete'] }, { requireDurable: true })).rejects.toThrow();
        expect(await cold.recoverSessionInvalidations('A', async mutation => mutation.sessionId === 'late-delete')).toBe(4);
        await cold.set('history:A:page:1', { sessions: ['other-create'] }, { requireDurable: true });
        expect(await diskCache(records).get('history:A:page:1')).toEqual({ sessions: ['other-create'] });
    });

    it('does not infer completion of an anonymous unknown operation from a later anonymous success', async () => {
        const cache = diskCache();
        await expect(cache.withSessionMutation('A', async () => { throw new Error('unknown'); })).rejects.toThrow('unknown');
        await cache.withSessionMutation('A', async () => 'accepted');
        await expect(cache.set('history:A:page:1', [], { requireDurable: true })).rejects.toThrow();
    });

    it.each([false, true])('cancels only its own tickets after preflight fails before RPC (older pending=%s)', async older => {
        const records = new Map(); const cache = diskCache(records);
        if (older) {
            await expect(cache.withSessionMutation('A', async () => { throw new Error('unknown'); },
                { sessionId: 'older', kind: 'delete' })).rejects.toThrow();
        }
        const write = cache.writeToIndexedDb; let count = 0;
        cache.writeToIndexedDb = jest.fn(async entry => {
            if (entry.value?.pending && entry.value?.mutation?.sessionId === 'preflight' && ++count === 2) throw new Error('preflight write aborted');
            return write(entry);
        });
        const backend = jest.fn(async () => 'must not run');
        await expect(cache.withSessionMutation('A', backend, { sessionId: 'preflight', kind: 'create' })).rejects.toThrow('preflight write aborted');
        expect(backend).not.toHaveBeenCalled();
        const cold = diskCache(records);
        const pending = (await cold.invalidationRows()).filter(row => row.value?.pending);
        expect(pending.every(row => row.value.mutation?.sessionId === 'older')).toBe(true);
        expect(pending.length).toBe(older ? 8 : 0); // Two durable copies of four prefixes.
        if (older) await expect(cold.set('history:A:page:1', [], { requireDurable: true })).rejects.toThrow();
        else {
            await cold.set('history:A:page:1', [], { requireDurable: true });
            expect(await diskCache(records).get('history:A:page:1')).toEqual([]);
        }
    });

    it('does not acknowledge durable queue data if an expected IndexedDB mirror fails', async () => {
        const cache = diskCache();
        cache.writeToIndexedDb.mockRejectedValue(new DOMException('put aborted', 'AbortError'));
        await expect(cache.set('offline:pending-operations:v1', [{ id: 'intent' }], { requireDurable: true }))
            .rejects.toMatchObject({ code: 'cache/persistence-unavailable' });
    });

    it('rejects a falsely acknowledged invalidation put whose durable readback is missing', async () => {
        const cache = diskCache(); const backend = jest.fn();
        cache.writeToIndexedDb.mockResolvedValue(true);
        await expect(cache.withSessionMutation('A', backend)).rejects.toMatchObject({ code: 'cache/persistence-unavailable' });
        expect(backend).not.toHaveBeenCalled();
    });

    it.each(['writeToIndexedDb', 'deleteFromIndexedDb', 'readFromIndexedDb', 'getAllFromIndexedDb'])('%s rejects a transaction abort even without an error event', async method => {
        const cache = new LocalFirstCache(); cache.indexedDbEnabled = true;
        let transaction;
        const request = {};
        cache.dbPromise = Promise.resolve({ transaction: () => {
            transaction = { objectStore: () => ({ put() {}, delete() {}, get: () => request, getAll: () => request }) };
            return transaction;
        } });
        const argument = method === 'writeToIndexedDb' ? { key: 'sample', value: 1 }
            : method === 'getAllFromIndexedDb' ? '' : 'sample';
        const result = cache[method](argument);
        await untilReleased(() => typeof transaction?.onabort === 'function');
        transaction.onabort();
        await expect(result).rejects.toThrow(/aborted/);
    });
});
