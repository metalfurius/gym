import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSmokeBrowser, removeSmokeProfile } from './browser-smoke-driver.mjs';
import { connectOwnedChromium } from './browser-cdp-target.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.env.OUTBOX_SMOKE_EVIDENCE_DIR || path.join(root, 'tmp', 'outbox-smoke', String(Date.now())));
const fixture = `<!doctype html><title>Durable outbox fixture</title><script type="module">
import {OfflineManager} from '/js/utils/offline-manager.js';
window.outbox = new OfflineManager(); await outbox.restorePersistedQueue(); window.ready = true;
</script>`;
const server = createServer(async (request, response) => {
    try {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        if (pathname === '/fixture') {
            response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
            response.end(fixture); return;
        }
        const file = path.resolve(root, `.${pathname}`);
        if (!file.startsWith(`${root}${path.sep}`)) { response.writeHead(403); response.end(); return; }
        const body = await fs.readFile(file);
        response.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' }); response.end(body);
    } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
await fs.mkdir(output, { recursive: true });
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'gym-smoke-outbox-'));
const trace = [], connections = [];
const signal = AbortSignal.timeout(60000);
let browser;
async function ready(client) {
    for (let attempt = 0; attempt < 150; attempt++) {
        if (await client.evaluate('window.ready === true')) return;
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Outbox fixture did not become ready');
}
const url = `http://127.0.0.1:${server.address().port}/fixture`;
async function page() {
    const connection = await connectOwnedChromium(browser.owner, profile, url, event => trace.push(event), signal);
    connections.push(connection); await ready(connection.client); return connection;
}
async function enqueue(connection, id, owner) {
    return connection.client.evaluate(`(async () => {
        outbox.queueOperation(null, 'Synthetic fixture', {id:${JSON.stringify(id)}, descriptor:{
            type:'preferences.saveWeeklyTarget',payload:{userId:${JSON.stringify(owner)},weekKey:'2026-11-23',target:4}
        }}); await outbox.persistQueue(); return outbox.pendingOperations.map(entry => entry.id).sort();
    })()`);
}
async function inspect(connection) {
    return connection.client.evaluate(`(async () => {
        const {localFirstCache:cache}=await import('/js/utils/local-first-cache.js');
        const rows=await cache.getPersistedEntries('offline:journal:v2:');
        const local=cache.localStorageKeys('offline:journal:v2:').map(key=>cache.readFromLocalStorage(key).value);
        const disk=(await cache.getAllFromIndexedDb('offline:journal:v2:')).map(row=>row.value);
        const pending=outbox.pendingOperations.map(entry=>({id:entry.id,status:entry.status||'pending',owner:entry.descriptor.payload.userId})).sort((a,b)=>a.id.localeCompare(b.id));
        return {pending,local:local.map(row=>row.kind+':'+row.id).sort(),indexedDb:disk.map(row=>row.kind+':'+row.id).sort(),durableEvents:rows.length};
    })()`);
}
try {
    browser = await openSmokeBrowser('chromium', url, profile, event => trace.push(event), signal);
    connections.push(browser); await ready(browser.client);
    const second = await page();
    await enqueue(browser, 'intent-A', 'owner-A');
    await enqueue(second, 'intent-B', 'owner-B');
    await second.client.send('Target.closeTarget', { targetId: browser.targetId });
    await second.client.send('Target.closeTarget', { targetId: second.targetId });
    const cold = await page();
    const reopenedIds = await cold.client.evaluate('outbox.pendingOperations.map(entry => entry.id).sort()');
    assert.deepEqual(reopenedIds, ['intent-A', 'intent-B']);
    const afterReopen = await inspect(cold);
    assert.deepEqual(afterReopen.pending.map(entry => entry.id), ['intent-A', 'intent-B']);
    assert.deepEqual(afterReopen.local, afterReopen.indexedDb);
    const stale = await page();
    await cold.client.evaluate("outbox.acknowledgeOperation('intent-A')");
    await stale.client.evaluate('outbox.persistQueue()');
    await enqueue(stale, 'intent-C', 'owner-A');
    await cold.client.evaluate('outbox.persistQueue()');
    // A further cold instance proves storage, rather than only refreshed RAM.
    const final = await page();
    const afterAcknowledgement = await inspect(final);
    assert.deepEqual(afterAcknowledgement.pending.map(entry => entry.id), ['intent-B', 'intent-C']);
    assert(afterAcknowledgement.local.includes('ack:intent-A'));
    assert.deepEqual(afterAcknowledgement.local, afterAcknowledgement.indexedDb);
    await final.client.evaluate("outbox.markConflict('intent-B',{result:{currentRevision:3}})");
    await stale.client.evaluate('outbox.persistQueue()');
    const conflict = await page();
    const afterConflict = await inspect(conflict);
    assert.equal(afterConflict.pending.find(entry => entry.id === 'intent-B').status, 'conflict');
    await conflict.client.evaluate("outbox.resolveConflicts('owner-B','2026-11-23')");
    await stale.client.evaluate('outbox.persistQueue()');
    const resolved = await page();
    const afterResolution = await inspect(resolved);
    assert.deepEqual(afterResolution.pending.map(entry => entry.id), ['intent-C']);
    assert.deepEqual(afterResolution.local, afterResolution.indexedDb);

    // Real durable stores; only the RPC callback boundary is simulated. An
    // unrelated success cannot settle the earlier acknowledgement-unknown RPC.
    const afterUnknownMutation = await resolved.client.evaluate(`(async () => {
        const {localFirstCache:cache}=await import('/js/utils/local-first-cache.js');
        try { await cache.withSessionMutation('owner-A',async()=>{throw Error('RPC acknowledgement unknown')},{sessionId:'late-delete',kind:'delete'}); } catch {}
        const blockedBefore=await cache.set('history:owner-A:page:1',{sessions:['late-delete']})===null;
        await cache.withSessionMutation('owner-A',async()=>({accepted:'fixture second RPC'}),{sessionId:'unrelated-create',kind:'create'});
        const blockedAfter=await cache.set('history:owner-A:page:1',{sessions:['late-delete','unrelated-create']})===null;
        const pending=(await cache.invalidationRows()).filter(row=>row.value?.pending).map(row=>row.value.mutation?.sessionId);
        return {blockedBefore,blockedAfter,pending};
    })()`);
    assert.equal(afterUnknownMutation.blockedBefore, true);
    assert.equal(afterUnknownMutation.blockedAfter, true);
    assert.equal(afterUnknownMutation.pending.length, 8); // Four prefixes in both stores.
    assert(afterUnknownMutation.pending.every(id => id === 'late-delete'));
    const barrierCold = await page();
    const coldUnknownSnapshot = await barrierCold.client.evaluate(`(async () => {
        const {localFirstCache:cache}=await import('/js/utils/local-first-cache.js');
        return cache.get('history:owner-A:page:1');
    })()`);
    assert.equal(coldUnknownSnapshot, null);
    const result = { status: 'passed', mode: 'actual production modules; real Chromium pages and localStorage/IndexedDB; no Firebase/backend',
        browser: browser.version, afterReopen, afterAcknowledgement, afterConflict, afterResolution,
        mutationBoundary: 'simulated acknowledgement-unknown first RPC and successful unrelated second RPC', afterUnknownMutation, coldUnknownSnapshot };
    await fs.writeFile(path.join(output, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify({ status: result.status, browser: result.browser, output }));
} catch (error) {
    await fs.writeFile(path.join(output, 'result.json'), `${JSON.stringify({ status: 'failed', error: error.message }, null, 2)}\n`);
    throw error;
} finally {
    await browser?.owner.close();
    if (!browser) await removeSmokeProfile(profile);
    for (const connection of connections) connection.client.close();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await fs.writeFile(path.join(output, 'trace.json'), `${JSON.stringify(trace, null, 2)}\n`);
}
