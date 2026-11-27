import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSmokeBrowser, removeSmokeProfile, waitForSmoke } from './browser-smoke-driver.mjs';
import { connectOwnedChromium } from './browser-cdp-target.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.env.OUTBOX_SMOKE_EVIDENCE_DIR || path.join(root, 'tmp', 'outbox-smoke', String(Date.now())));
const negativeCase = process.env.OUTBOX_SMOKE_NEGATIVE_CASE || null;
const fixture = `<!doctype html><title>Durable outbox fixture</title><script type="module">
import {OfflineManager} from '/js/utils/offline-manager.js';
window.outbox = new OfflineManager(); await outbox.restorePersistedQueue(); window.ready = true;
</script>`;
const signal = AbortSignal.timeout(60_000);
const trace = []; const connections = []; const cleanupErrors = [];
let browser; let server; let profile; let baseUrl;
const result = { status: 'running', runId: crypto.randomUUID(), startedAt: new Date().toISOString(),
    checkoutSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    mode: 'actual app/outbox/cache modules; native Chromium pages + localStorage/IndexedDB; synthetic SDK only, no live backend', negativeCase };
function event(stage, detail = {}) { trace.push({ method: 'OutboxSmoke.stage', params: { runId: result.runId, stage, at: new Date().toISOString(), ...detail } }); }
function serializedError(error) { return { message: error.message, stack: error.stack }; }
async function appHtml() {
    const imports = {
        'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js': '/tests/mocks/firebase-app.js',
        'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js': '/tests/mocks/firebase-auth.js',
        'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js': '/tests/mocks/firebase-firestore.js',
    };
    return (await fs.readFile(path.join(root, 'index.html'), 'utf8'))
        .replace('<head>', `<head><script type="importmap">${JSON.stringify({ imports })}</script><script>Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:undefined});</script>`)
        .replace(/\s*<link\b[^>]*https:\/\/fonts\.[^>]*>/g, '')
        .replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/[^"]+"><\/script>/, '')
        .replace('src="js/app.js"', 'src="tests/browser/outbox-app-bootstrap.js"');
}
async function startServer() {
    const html = await appHtml();
    server = createServer(async (request, response) => {
        try {
            const pathname = new URL(request.url, 'http://localhost').pathname;
            if (pathname === '/fixture' || pathname === '/app-fixture') {
                response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
                response.end(pathname === '/fixture' ? fixture : html); return;
            }
            const file = path.resolve(root, `.${pathname}`);
            if (!file.startsWith(`${root}${path.sep}`)) { response.writeHead(403); response.end(); return; }
            const body = await fs.readFile(file);
            const type = ({ '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon' })[path.extname(file)] || 'application/javascript';
            response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }); response.end(body);
        } catch { response.writeHead(404); response.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
}
async function ready(client, app = false) {
    await waitForSmoke(client, app ? 'window.appOutboxFixture && !document.getElementById("dashboard-view").classList.contains("hidden")' : 'window.ready === true', signal);
}
async function page(app = false) {
    const connection = await connectOwnedChromium(browser.owner, profile, `${baseUrl}/${app ? 'app-fixture' : 'fixture'}`, item => trace.push(item), signal);
    connections.push(connection); await ready(connection.client, app); return connection;
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
        const prefix='offline:journal:v3:batch:';
        const flatten=rows=>rows.flatMap(row=>JSON.parse(row.value.eventsJson)).map(event=>event.kind+':'+event.id+':'+(event.outcome||'')).sort();
        const local=cache.localStorageKeys(prefix).map(key=>cache.readFromLocalStorage(key));
        const disk=await cache.getAllFromIndexedDb(prefix);
        const pending=outbox.pendingOperations.map(entry=>({id:entry.id,status:entry.status||'pending',owner:entry.descriptor.payload.userId})).sort((a,b)=>a.id.localeCompare(b.id));
        return {pending,local:flatten(local),indexedDb:flatten(disk),durableBatches:disk.length};
    })()`);
}
async function network(connection, offline) {
    await connection.client.send('Network.emulateNetworkConditions', { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
}
async function run() {
    await startServer(); profile = await fs.mkdtemp(path.join(os.tmpdir(), 'gym-smoke-outbox-'));
    browser = await openSmokeBrowser('chromium', `${baseUrl}/fixture`, profile, item => trace.push(item), signal);
    connections.push(browser); await ready(browser.client); result.browser = browser.version;
    event('two-independent-native-tabs');
    const second = await page();
    await enqueue(browser, 'intent-A', 'owner-A'); await enqueue(second, 'intent-B', 'owner-B');
    await second.client.send('Target.closeTarget', { targetId: browser.targetId }); await second.client.send('Target.closeTarget', { targetId: second.targetId });
    const cold = await page(); result.afterReopen = await inspect(cold);
    assert.deepEqual(result.afterReopen.pending.map(entry => entry.id), ['intent-A', 'intent-B']);
    assert.deepEqual(result.afterReopen.local, result.afterReopen.indexedDb);
    const stale = await page();
    await cold.client.evaluate("outbox.acknowledgeOperation('intent-A')"); await stale.client.evaluate('outbox.persistQueue()');
    await enqueue(stale, 'intent-C', 'owner-A'); await cold.client.evaluate('outbox.persistQueue()');
    const final = await page(); result.afterAcknowledgement = await inspect(final);
    assert.deepEqual(result.afterAcknowledgement.pending.map(entry => entry.id), ['intent-B', 'intent-C']);
    assert(result.afterAcknowledgement.local.includes('ack:intent-A:accepted'));
    assert.deepEqual(result.afterAcknowledgement.local, result.afterAcknowledgement.indexedDb);
    await final.client.evaluate("outbox.markConflict('intent-B',{result:{currentRevision:3}})"); await stale.client.evaluate('outbox.persistQueue()');
    const conflict = await page(); result.afterConflict = await inspect(conflict);
    assert.equal(result.afterConflict.pending.find(entry => entry.id === 'intent-B').status, 'conflict');
    await conflict.client.evaluate("outbox.resolveConflicts('owner-B','2026-11-23')"); await stale.client.evaluate('outbox.persistQueue()');
    const resolved = await page(); result.afterResolution = await inspect(resolved);
    assert.deepEqual(result.afterResolution.pending.map(entry => entry.id), ['intent-C']);
    assert.deepEqual(result.afterResolution.local, result.afterResolution.indexedDb);
    event('same-owner-causal-two-tabs');
    const parentTab = await page(); const childTab = await page();
    await parentTab.client.evaluate(`(async()=>{
        Date.now=()=>1806321600000;
        outbox.queueOperation(null,'parent',{id:'same-z-first',descriptor:{type:'preferences.saveWeeklyTarget',payload:{userId:'same-owner',operationId:'same-op-A',baseOperationId:null,weekKey:'2026-11-23'}}});
        await outbox.persistQueue();
    })()`);
    await childTab.client.evaluate(`(async()=>{
        Date.now=()=>1806321540000;
        outbox.queueOperation(null,'child',{id:'same-a-second',descriptor:{type:'preferences.saveWeeklyTarget',payload:{userId:'same-owner',operationId:'same-op-B',baseOperationId:'same-op-A',weekKey:'2026-11-23'}}});
        await outbox.persistQueue();
    })()`);
    const sameOwnerCold = await page();
    result.sameOwnerCausal = await sameOwnerCold.client.evaluate(`(async()=>{
        const before=outbox.pendingOperations.filter(entry=>entry.descriptor.payload.userId==='same-owner').map(entry=>({id:entry.id,timestamp:entry.timestamp}));
        const calls=[];outbox.setActiveUser('same-owner');outbox.registerOperationHandler('preferences.saveWeeklyTarget',async payload=>{calls.push(payload.operationId)});
        outbox.pendingOperations.reverse();await outbox.processPendingOperations();return {before,calls,remaining:outbox.getPendingCount()};
    })()`);
    assert.deepEqual(result.sameOwnerCausal.before.map(entry => entry.id), ['same-z-first', 'same-a-second']);
    assert.deepEqual(result.sameOwnerCausal.calls, ['same-op-A', 'same-op-B']); assert.equal(result.sameOwnerCausal.remaining, 0);
    await childTab.client.evaluate('outbox.persistQueue()');
    const sameOwnerAfterAck = await page();
    assert.equal((await inspect(sameOwnerAfterAck)).pending.filter(entry => entry.owner === 'same-owner').length, 0);
    event('independent-pending-mutation-barriers');
    result.afterUnknownMutation = await resolved.client.evaluate(`(async () => {
        const {localFirstCache:cache}=await import('/js/utils/local-first-cache.js');
        try { await cache.withSessionMutation('owner-A',async()=>{throw Error('RPC acknowledgement unknown')},{sessionId:'late-delete',kind:'delete'}); } catch {}
        const blockedBefore=await cache.set('history:owner-A:page:1',{sessions:['late-delete']})===null;
        await cache.withSessionMutation('owner-A',async()=>({accepted:'fixture second RPC'}),{sessionId:'unrelated-create',kind:'create'});
        const blockedAfter=await cache.set('history:owner-A:page:1',{sessions:['late-delete','unrelated-create']})===null;
        const pending=(await cache.invalidationRows()).filter(row=>row.value?.pending).map(row=>row.value.mutation?.sessionId);
        return {blockedBefore,blockedAfter,pending};
    })()`);
    assert.equal(result.afterUnknownMutation.blockedBefore, true); assert.equal(result.afterUnknownMutation.blockedAfter, true);
    assert.equal(result.afterUnknownMutation.pending.length, 8); assert(result.afterUnknownMutation.pending.every(id => id === 'late-delete'));
    const barrierCold = await page();
    result.coldUnknownSnapshot = await barrierCold.client.evaluate(`(async () => {
        const {localFirstCache:cache}=await import('/js/utils/local-first-cache.js');return cache.get('history:owner-A:page:1');
    })()`);
    assert.equal(result.coldUnknownSnapshot, null);
    event('native-localstorage-fallback-negative');
    result.localStorageFallback = await barrierCold.client.evaluate(`(async () => {
        const {LocalFirstCache}=await import('/js/utils/local-first-cache.js');
        const {DurableOutbox}=await import('/js/utils/durable-outbox.js');
        const {OfflineManager}=await import('/js/utils/offline-manager.js');
        const cache=new LocalFirstCache(); cache.indexedDbEnabled=false;cache.indexedDbExpected=false;
        const manager=new OfflineManager({outbox:new DurableOutbox(cache)});manager.setActiveUser('fallback-owner');
        const actualSet=Storage.prototype.setItem; let error=null;
        Storage.prototype.setItem=function(key,value){if(key.includes('offline:journal:v3:batch:'))throw new DOMException('Injected quota failure','QuotaExceededError');return actualSet.call(this,key,value)};
        try{manager.queueOperation(null,'fallback',{id:'fallback-failed',descriptor:{type:'session.save',payload:{userId:'fallback-owner',sessionId:'fallback-session'}}});await manager.persistQueue()}
        catch(value){error={message:value.message,provenNotCommitted:value.provenNotCommitted}}
        finally{Storage.prototype.setItem=actualSet}
        const durable=await manager.outbox.read();return {mode:'simulated no-IDB capability; native Storage.setItem QuotaExceededError injection',error,
            ghost:durable.entries.some(entry=>entry.id==='fallback-failed'),pending:manager.pendingOperations.some(entry=>entry.id==='fallback-failed')};
    })()`);
    assert.equal(result.localStorageFallback.error.provenNotCommitted, true);
    assert.equal(result.localStorageFallback.ghost, false); assert.equal(result.localStorageFallback.pending, false);

    event('actual-app-native-idb-transaction-negatives');
    const app = await page(true); result.appCases = [];
    for (const mode of ['success-abort', 'request-error-complete']) {
        await app.client.evaluate(`appOutboxFixture.configure(${JSON.stringify(`native-${mode}`)})`);
        await app.client.evaluate(`appOutboxFixture.nativeFault(${JSON.stringify(mode)})`); await network(app, true);
        const first = await app.client.evaluate('appOutboxFixture.save()'); assert.equal(first.ok, false);
        let state = await app.client.evaluate('appOutboxFixture.state()'); assert.equal(state.sessions.length, 0);
        const afterFailure = await app.client.evaluate('appOutboxFixture.coldQueue()');
        assert.equal(afterFailure.filter(entry => entry.descriptor.type === 'quicklog.save').length, 0);
        await app.client.evaluate('appOutboxFixture.clearFault()'); const retry = await app.client.evaluate('appOutboxFixture.save()');
        assert.equal(retry.ok, true); assert.equal(retry.queued, true);
        const afterRetry = await app.client.evaluate('appOutboxFixture.coldQueue()');
        assert.equal(afterRetry.filter(entry => entry.descriptor.type === 'quicklog.save').length, 1);
        await network(app, false); await app.client.evaluate('appOutboxFixture.replay()');
        state = await app.client.evaluate('appOutboxFixture.state()'); assert.equal(state.sessions.length, 1);
        assert.equal(state.sessions[0].sessionId, retry.sessionId);
        const events = state.nativeEvents.filter(item => item.mode === mode).map(item => item.event);
        assert(events.includes(mode === 'success-abort' ? 'tx-abort' : 'tx-complete'));
        assert(events.includes(mode === 'success-abort' ? 'request-success' : 'request-error'));
        result.appCases.push({ mode, first, retry, nativeEvents: events, sessions: state.sessions });
    }
    for (const mode of ['mirror', 'refresh', 'ack-abort', 'lost-rpc']) {
        await app.client.evaluate(`appOutboxFixture.configure(${JSON.stringify(`native-${mode}`)})`);
        const method = { mirror: 'mirrorFault()', refresh: 'refreshFault()', 'ack-abort': "nativeFault('ack-abort')", 'lost-rpc': 'lostRpcAcknowledgement()' }[mode];
        await app.client.evaluate(`appOutboxFixture.${method}`);
        const saved = await app.client.evaluate('appOutboxFixture.save()'); assert.equal(saved.ok, true);
        if (mode === 'lost-rpc') assert.equal(saved.queued, true);
        await app.client.evaluate('appOutboxFixture.clearFault()'); await app.client.evaluate('appOutboxFixture.replay()');
        const state = await app.client.evaluate('appOutboxFixture.state()'); assert.equal(state.sessions.length, 1);
        assert.equal(state.sessions[0].sessionId, saved.sessionId);
        result.appCases.push({ mode, saved, sessions: state.sessions });
    }
    event('actual-settings-causal-chain');
    await app.client.evaluate("appOutboxFixture.configure('native-weekly')"); await network(app, true);
    await app.client.evaluate("appOutboxFixture.setClock(1806321600000);appOutboxFixture.weekly(4,'z-first')");
    await app.client.evaluate("appOutboxFixture.setClock(1806321540000);appOutboxFixture.weekly(7,'a-second')");
    const nativeOrder = await app.client.evaluate('appOutboxFixture.coldQueue()');
    const targets = nativeOrder.filter(entry => entry.descriptor.type === 'preferences.saveWeeklyTarget');
    assert.deepEqual(targets.map(entry => entry.id), ['z-first', 'a-second']);
    await network(app, false); await app.client.evaluate('appOutboxFixture.replay()');
    result.weekly = await app.client.evaluate('appOutboxFixture.state()');
    assert.equal(result.weekly.target, 7); assert.equal(result.weekly.uiTarget, '7');
    result.weekly.originalIntents = targets.map(entry => ({ id: entry.id, timestamp: entry.timestamp, payload: entry.descriptor.payload }));
    event('passed-assertions-awaiting-cleanup');
}

await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
try {
    result.sourceHashesLf = Object.fromEntries(await Promise.all(['js/utils/durable-outbox.js', 'js/utils/outbox-order.js',
        'js/utils/outbox-journal-storage.js', 'js/utils/offline-manager.js', 'js/utils/local-first-cache.js', 'js/app.js'].map(async file => [file,
        crypto.createHash('sha256').update((await fs.readFile(path.join(root, file), 'utf8')).replace(/\r\n?/g, '\n')).digest('hex')])));
    if (negativeCase && !['cleanup-owner', 'cleanup-connection', 'cleanup-server'].includes(negativeCase)) throw new Error('Unknown outbox smoke negative case');
    await run();
} catch (error) { result.primaryError = serializedError(error); }
finally {
    const cleanup = async (stage, operation) => {
        try { await operation(); if (negativeCase === stage) throw new Error(`Deliberately injected ${stage} failure after real cleanup`); event(stage, { status: 'done' }); }
        catch (error) { cleanupErrors.push({ stage, ...serializedError(error) }); event(stage, { status: 'failed', message: error.message }); }
    };
    await cleanup('cleanup-owner', async () => { if (browser) await browser.owner.close(); else if (profile) await removeSmokeProfile(profile); });
    for (const connection of connections) await cleanup('cleanup-connection', async () => { connection.client.close(); });
    await cleanup('cleanup-server', async () => { if (server) { server.closeAllConnections(); await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); } });
    result.cleanupErrors = cleanupErrors;
    try { await fs.writeFile(path.join(output, 'trace.json'), `${JSON.stringify(trace, null, 2)}\n`); }
    catch (error) { cleanupErrors.push({ stage: 'cleanup-trace', ...serializedError(error) }); }
    result.status = result.primaryError || cleanupErrors.length ? 'failed' : 'passed'; result.completedAt = new Date().toISOString();
    // Publish final status only after every owner/connection/server/trace cleanup.
    await fs.writeFile(path.join(output, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== 'passed') process.exitCode = 1;
    console.log(JSON.stringify({ status: result.status, primaryError: result.primaryError?.message, cleanupErrors: cleanupErrors.map(item => item.stage), output }));
}
