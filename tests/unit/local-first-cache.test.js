import { describe, it, expect, beforeEach } from '@jest/globals';
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
