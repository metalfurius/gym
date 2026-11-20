import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { LocalFirstCache } from '../../js/utils/local-first-cache.js';

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
        const cache = new LocalFirstCache(); cache.indexedDbEnabled = true; cache.initialized = true;
        let release;
        cache.readFromIndexedDb = jest.fn(() => new Promise(resolve => { release = resolve; }));
        cache.getAllFromIndexedDb = jest.fn(async () => []); cache.deleteFromIndexedDb = jest.fn(async () => {});
        const reading = cache.getEntry('history:A:page:1');
        for (let index = 0; index < 10 && !release; index++) await Promise.resolve();
        expect(typeof release).toBe('function');
        await cache.clearByPrefix('history:A:');
        release({ key: 'history:A:page:1', value: { sessions: ['deleted'] } });
        expect(await reading).toBeNull(); expect(cache.memoryCache.has('history:A:page:1')).toBe(false);
    });

    it('serializes disk deletion after an already pending disk write', async () => {
        const cache = new LocalFirstCache(); cache.indexedDbEnabled = true; cache.initialized = true;
        let release; const records = new Map();
        cache.writeToIndexedDb = jest.fn(entry => new Promise(resolve => { release = () => { records.set(entry.key, entry); resolve(); }; }));
        cache.getAllFromIndexedDb = jest.fn(async () => [...records.values()]);
        cache.deleteFromIndexedDb = jest.fn(async key => { records.delete(key); });
        const write = cache.set('calendar:A:2026-11', ['old']);
        for (let count = 0; count < 4; count++) await Promise.resolve();
        const invalidation = cache.clearByPrefix('calendar:A:');
        release(); await Promise.all([write, invalidation]);
        expect(records.size).toBe(0); cache.readFromIndexedDb = async () => null;
        expect(await cache.get('calendar:A:2026-11')).toBeNull();
    });
});
