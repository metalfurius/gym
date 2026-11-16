import { describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { TextDecoder, TextEncoder } from 'node:util';

const root = new URL('../../', import.meta.url);
const release = JSON.parse(readFileSync(new URL('release.json', root), 'utf8'));

class FakeResponse {
    constructor(body) { this.body = Buffer.from(body); this.ok = true; }
    clone() { return new FakeResponse(this.body); }
    async json() { return JSON.parse(this.body.toString('utf8')); }
    async text() { return this.body.toString('utf8'); }
    async arrayBuffer() { return Uint8Array.from(this.body).buffer; }
}

class FakeCache {
    constructor() { this.entries = new Map(); }
    async put(key, response) { this.entries.set(String(key), response.clone()); }
    async match(key) { return this.entries.get(String(key))?.clone(); }
    async add() {}
}

function createWorker({ staleAsset = null, wrongRevision = false, transformedShell = false } = {}) {
    const handlers = {};
    const stores = new Map([['gym-tracker-v2.7.12', new FakeCache()]]);
    const caches = {
        open: async name => {
            if (!stores.has(name)) stores.set(name, new FakeCache());
            return stores.get(name);
        },
        keys: async () => [...stores.keys()],
        delete: async name => stores.delete(name)
    };
    const requests = [];
    const fetch = jest.fn(async input => {
        const url = new URL(String(input));
        requests.push(url);
        const path = url.pathname.slice('/gym/'.length) || 'index.html';
        if (path === staleAsset) return new FakeResponse('stale CDN response');
        if (path === 'release.json' && wrongRevision) {
            return new FakeResponse(JSON.stringify({ ...release, revision: 'v2.7.12' }));
        }
        if (path === 'index.html' && transformedShell) {
            return new FakeResponse(readFileSync(new URL(path, root), 'utf8').replace('<body>', '<body><script>/* edge transformation */</script>'));
        }
        return new FakeResponse(readFileSync(new URL(path, root)));
    });
    const self = {
        location: new URL('https://example.test/gym/sw.js'),
        registration: { scope: 'https://example.test/gym/' },
        clients: { claim: jest.fn(async () => {}) },
        addEventListener: (name, handler) => { handlers[name] = handler; }
    };
    runInNewContext(readFileSync(new URL('sw.js', root), 'utf8'), {
        self, caches, fetch, crypto: webcrypto, URL, TextEncoder, TextDecoder, Uint8Array,
        setTimeout, clearTimeout, console
    });
    const dispatch = name => {
        let work;
        handlers[name]({ waitUntil: promise => { work = promise; } });
        return work;
    };
    return { stores, requests, dispatch, self };
}

describe('verified service worker installation', () => {
    it('refuses mismatched release metadata and keeps the previous cache', async () => {
        const worker = createWorker({ wrongRevision: true });
        await expect(worker.dispatch('install')).rejects.toThrow('does not match');
        expect([...worker.stores.keys()]).toEqual(['gym-tracker-v2.7.12']);
    });

    it('refuses a stale asset without changing the active cache', async () => {
        const worker = createWorker({ staleAsset: 'js/ui.js' });
        await expect(worker.dispatch('install')).rejects.toThrow('does not match: js/ui.js');
        expect(worker.stores.has('gym-tracker-v2.7.12')).toBe(true);
        expect(worker.stores.has(release.cacheName)).toBe(false);
    });

    it('rejects a stale HTML shell without changing the active cache', async () => {
        const worker = createWorker({ staleAsset: 'index.html' });
        await expect(worker.dispatch('install')).rejects.toThrow('does not match: index.html');
        expect(worker.stores.has('gym-tracker-v2.7.12')).toBe(true);
        expect(worker.stores.has(release.cacheName)).toBe(false);
    });

    it('accepts edge-transformed HTML when its release marker matches', async () => {
        const worker = createWorker({ transformedShell: true });
        await worker.dispatch('install');
        expect(worker.stores.has(release.cacheName)).toBe(true);
    });

    it('installs only verified fresh assets and retains the old cache until activation', async () => {
        const worker = createWorker();
        await worker.dispatch('install');
        expect(worker.requests.every(url => url.searchParams.has('gym_update'))).toBe(true);
        expect(worker.stores.has('gym-tracker-v2.7.12')).toBe(true);
        const installed = worker.stores.get(release.cacheName);
        expect(await installed.match('https://example.test/gym/')).toBeDefined();
        expect(await installed.match('https://example.test/gym/js/i18n.js')).toBeDefined();
        expect(await installed.match('https://example.test/gym/js/utils/firebase-usage-tracker.js')).toBeDefined();
        await worker.dispatch('activate');
        expect(worker.stores.has('gym-tracker-v2.7.12')).toBe(false);
        expect(worker.self.clients.claim).toHaveBeenCalled();
    });
});
