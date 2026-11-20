#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import process from 'node:process';
import { openChallengeBrowser } from './production-release-smoke.mjs';

const EXPECTED_REVISION = 'v2.8.4';
const WORKER_REVISION = 'v2.8.3';
let networkRevision = EXPECTED_REVISION;
const requests = [];
const html = `<!doctype html><script>
window.workerReady = (async () => {
    await navigator.serviceWorker.register('./sw.js');
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
        await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    }
    return navigator.serviceWorker.controller.scriptURL;
})();
</script><meta name="gym-release-revision" content="${EXPECTED_REVISION}">`;
const worker = `
self.addEventListener('install', event => event.waitUntil((async () => {
    const cache = await caches.open('canonical-transport-regression');
    const response = await fetch('./release.json?gym_update=fixture');
    await cache.put(new URL('./release.json', self.location).toString(), response);
    await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
    if (new URL(event.request.url).pathname === '/gym/release.json') {
        event.respondWith(caches.open('canonical-transport-regression').then(cache =>
            cache.match(new URL('./release.json', self.location).toString())));
    }
});`;

const server = createServer((request, response) => {
    requests.push(request.url);
    response.setHeader('Cache-Control', 'public, max-age=3600');
    if (request.url === '/gym/' || request.url === '/gym/index.html') {
        response.setHeader('Content-Type', 'text/html');
        response.end(html);
    } else if (request.url === '/gym/sw.js') {
        response.setHeader('Content-Type', 'application/javascript');
        response.end(worker);
    } else if (request.url === '/gym/release.json?gym_update=fixture') {
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ revision: WORKER_REVISION, source: 'worker-cache' }));
    } else if (request.url === '/gym/release.json') {
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ revision: networkRevision, source: 'network' }));
    } else {
        response.writeHead(404);
        response.end();
    }
});

let session;
try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = new URL(`http://127.0.0.1:${server.address().port}/gym/`);
    const canonicalUrl = new URL('release.json', base).toString();
    const canonicalRequestCount = () => requests.filter(url => url === '/gym/release.json').length;
    session = await openChallengeBrowser(base, 'gym', EXPECTED_REVISION);
    const browserVersion = await session.client.send('Browser.getVersion');
    const controller = await session.client.callFunction('async function() { return await window.workerReady; }');
    assert.equal(controller, new URL('sw.js', base).toString(), 'the fixture must have an active controlling worker');
    assert.equal(canonicalRequestCount(), 0);
    assert.equal(requests.filter(url => url === '/gym/release.json?gym_update=fixture').length, 1);

    const current = await session.fetchAsset(base, 'release.json');
    assert.equal(current.url, canonicalUrl);
    assert.equal(current.status, 200);
    assert.deepEqual(JSON.parse(current.buffer), { revision: EXPECTED_REVISION, source: 'network' });
    assert.equal(canonicalRequestCount(), 1, 'canonical verification must actually reach the HTTP server');

    // A stale network response must remain observable, even with a warm browser HTTP cache.
    networkRevision = 'v2.8.2';
    const stale = await session.fetchAsset(base, 'release.json');
    assert.equal(stale.url, canonicalUrl);
    assert.deepEqual(JSON.parse(stale.buffer), { revision: 'v2.8.2', source: 'network' });
    assert.equal(canonicalRequestCount(), 2, 'a second canonical request must also reach the HTTP server');

    // Negative control: the same live worker really does intercept and return its query-backed cache entry.
    await session.client.send('Network.setBypassServiceWorker', { bypass: false });
    const intercepted = await session.client.callFunction(`async function(url) {
        const response = await fetch(url, { cache: 'no-store' });
        return { url: response.url, body: await response.json() };
    }`, [canonicalUrl]);
    assert.equal(intercepted.url, `${canonicalUrl}?gym_update=fixture`);
    assert.deepEqual(intercepted.body, { revision: WORKER_REVISION, source: 'worker-cache' });
    assert.equal(canonicalRequestCount(), 2, 'the negative control must produce zero canonical network requests');
    await assert.rejects(session.fetchAsset(base, 'release.json'), /redirected away from canonical URL/);
    assert.equal(canonicalRequestCount(), 2);
    console.log(`[canonical-transport] passed ${browserVersion.product}: active worker bypassed; current/stale canonical responses reached network; negative control intercepted query-backed cache`);
} catch (error) {
    console.error(`[canonical-transport] ${error.stack || error.message}`);
    process.exitCode = 1;
} finally {
    await session?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
}
