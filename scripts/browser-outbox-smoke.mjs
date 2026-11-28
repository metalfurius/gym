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
const signal = AbortSignal.timeout(180_000);
const trace = []; const connections = []; const cleanupErrors = [];
const servers = [];
let browser; let profile; let activeScenario;
let applicationPage;
const result = { status: 'running', runId: crypto.randomUUID(), startedAt: new Date().toISOString(),
    checkoutSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    mode: 'actual app/outbox/cache modules; native Chromium pages + localStorage/IndexedDB; synthetic SDK only, no live backend', negativeCase,
    ownedProfileId: crypto.randomUUID(), scenarios: [], servers: [] };
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
async function startServer(scenarioId) {
    const html = await appHtml();
    const server = createServer(async (request, response) => {
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
    const record = { server, scenarioId };
    servers.push(record);
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
    });
    record.origin = `http://127.0.0.1:${server.address().port}`;
    // Keep every server listening until final cleanup. A later independent case
    // cannot reuse its port/origin and inherit another case's durable storage.
    result.servers.push({ scenarioId, origin: record.origin, closed: false });
    return record.origin;
}
async function ready(client, app = false) {
    await waitForSmoke(client, app ? 'window.appOutboxFixture && !document.getElementById("dashboard-view").classList.contains("hidden")' : 'window.ready === true', signal);
}
function trackPage(connection, app, coldCapture, origin) {
    assert.equal(origin, activeScenario.origin);
    connection.fixtureOrigin = origin;
    connections.push(connection);
    activeScenario.connections.push(connection);
    activeScenario.proof.pages.push({ targetId: connection.targetId, origin, app, coldCapture,
        ownedProfileId: result.ownedProfileId });
}
async function page(app = false, coldCapture = false, origin = activeScenario.origin) {
    const connection = await connectOwnedChromium(browser.owner, profile, `${origin}/${app ? 'app-fixture' : 'fixture'}${coldCapture ? '?coldCapture=1' : ''}`, item => trace.push(item), signal);
    trackPage(connection, app, coldCapture, origin);
    if (app) applicationPage = connection;
    await ready(connection.client, app); return connection;
}
async function journalFootprint(client) {
    return client.evaluate(`(async () => {
        const {localFirstCache:cache}=await import('/js/utils/local-first-cache.js');
        const prefix='offline:journal:v3:batch:';
        const rows=await cache.getAllFromIndexedDb(prefix);
        rows.sort((left,right)=>left.key.localeCompare(right.key));
        const bytes=new TextEncoder().encode(JSON.stringify(rows));
        const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
        return {indexedDbBatches:rows.length,indexedDbBytes:bytes.byteLength,indexedDbSha256:digest,
            localMirrorBatches:cache.localStorageKeys(prefix).length};
    })()`);
}
async function finishScenario() {
    if (!activeScenario) return;
    const scenario = activeScenario;
    const last = scenario.connections.at(-1);
    scenario.proof.journalAfter = await journalFootprint(last.client);
    const ownedIds = new Set(scenario.connections.map(connection => connection.targetId));
    const { targetInfos } = await last.client.send('Target.getTargets');
    const targets = targetInfos.filter(target => ownedIds.has(target.targetId));
    for (const target of targets) await last.client.send('Target.closeTarget', { targetId: target.targetId });
    scenario.proof.closedTargetIds = targets.map(target => target.targetId);
    scenario.proof.assertionsCompleted = true;
    scenario.proof.completedAt = new Date().toISOString();
    scenario.proof.elapsedMs = Math.round(performance.now() - scenario.started);
    scenario.proof.profileAndStorageRetained = true;
    event('completed-fixture-scenario', scenario.proof);
    activeScenario = null;
}
async function startScenario(id) {
    await finishScenario();
    const origin = await startServer(id);
    const proof = { id, origin, ownedProfileId: result.ownedProfileId, startedAt: new Date().toISOString(),
        assertionsCompleted: false, pages: [] };
    activeScenario = { origin, connections: [], proof, started: performance.now() };
    result.scenarios.push(proof);
    event('started-fixture-scenario', { id, origin, ownedProfileId: result.ownedProfileId });
    return origin;
}
async function appScenario(id) {
    await startScenario(id);
    // Observe the new origin before application startup. Startup may itself
    // durably journal and acknowledge an owned fetch through the real manager.
    const storageProbe = await page();
    activeScenario.proof.journalBefore = await journalFootprint(storageProbe.client);
    assert.equal(activeScenario.proof.journalBefore.indexedDbBatches, 0);
    assert.equal(activeScenario.proof.journalBefore.localMirrorBatches, 0);
    await storageProbe.client.send('Target.closeTarget', { targetId: storageProbe.targetId });
    const connection = await page(true);
    applicationPage = connection;
    activeScenario.proof.journalAfterAppStartup = await journalFootprint(connection.client);
    return connection;
}
async function verifyRetainedScenarios() {
    result.retainedOrigins = [];
    for (const scenario of result.scenarios) {
        // A module-only probe restores the real journal without starting the
        // app, executing its queued operations, or changing any fixture data.
        const connection = await connectOwnedChromium(browser.owner, profile, `${scenario.origin}/fixture`, item => trace.push(item), signal);
        connections.push(connection);
        await ready(connection.client);
        const footprint = await journalFootprint(connection.client);
        assert.deepEqual(footprint, scenario.journalAfter);
        await connection.client.send('Target.closeTarget', { targetId: connection.targetId });
        const proof = { scenarioId: scenario.id, origin: scenario.origin, ownedProfileId: result.ownedProfileId,
            targetId: connection.targetId, footprint, verifiedAt: new Date().toISOString() };
        result.retainedOrigins.push(proof);
        event('verified-retained-fixture-storage', proof);
    }
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
async function screenshot(connection, name) {
    const image = await connection.client.send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(output, `${name}.png`), Buffer.from(image.data, 'base64'));
}
async function run() {
    const coreOrigin = await startScenario('core-cross-tab-causal-barriers');
    profile = await fs.mkdtemp(path.join(os.tmpdir(), 'gym-smoke-outbox-'));
    browser = await openSmokeBrowser('chromium', `${coreOrigin}/fixture`, profile, item => trace.push(item), signal);
    trackPage(browser, false, false, coreOrigin); await ready(browser.client); result.browser = browser.version;
    activeScenario.proof.journalBefore = await journalFootprint(browser.client);
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
    let app; result.appCases = [];
    for (const mode of ['success-abort', 'request-error-complete']) {
        app = await appScenario(`quicklog-${mode}`);
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
        app = await appScenario(`quicklog-${mode}`);
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
    event('actual-routine-capture-queued-terminal-identity'); result.captureCases = [];
    for (const mode of ['offline', 'lost-rpc', 'unknown-journal', 'unknown-before-commit', 'draft-cleanup']) {
        app = await appScenario(`capture-${mode}`);
        await network(app, false);
        await app.client.evaluate(`appOutboxFixture.configure(${JSON.stringify(`native-capture-${mode}`)})`);
        await app.client.evaluate('appOutboxFixture.captureStart()');
        if (mode !== 'lost-rpc') await network(app, true);
        const method = { 'lost-rpc': 'lostRpcAcknowledgement()', 'unknown-journal': 'unknownJournalCompletion()', 'unknown-before-commit': 'unknownJournalBeforeCommit()', 'draft-cleanup': 'draftCleanupFault()' }[mode];
        if (method) await app.client.evaluate(`appOutboxFixture.${method}`);
        const saved = await app.client.evaluate('appOutboxFixture.captureSave()');
        assert.equal(saved.ok, true); assert.equal(saved.queued, true);
        const first = await app.client.evaluate('appOutboxFixture.state()');
        assert.equal(first.capture.routine, null); assert.equal(first.capture.visible, false);
        const original = first.pending.filter(entry => entry.descriptor.type === 'session.save');
        assert.equal(original.length, 1);
        await app.client.evaluate('appOutboxFixture.captureSave()');
        const repeated = await app.client.evaluate('appOutboxFixture.state()');
        assert.deepEqual(repeated.pending, first.pending);
        await screenshot(app, `capture-${mode}`);
        await app.client.evaluate('appOutboxFixture.clearFault()');
        let replayPage = app; let writeAhead;
        if (mode === 'unknown-before-commit') {
            writeAhead = await app.client.evaluate('appOutboxFixture.rawCaptureDrafts()');
            assert.equal(writeAhead.primary.captureId, saved.sessionId); assert.deepEqual(writeAhead.primary, writeAhead.mirror);
            assert.equal((await app.client.evaluate('appOutboxFixture.coldQueue()')).length, 0);
            await app.client.evaluate('appOutboxFixture.persistFixtureBackend()'); replayPage = await page(true, true, app.fixtureOrigin);
            await replayPage.client.evaluate('appOutboxFixture.settleOwner()'); await network(replayPage, true);
            await replayPage.client.evaluate('delete navigator.onLine');
            assert.equal(await replayPage.client.evaluate('appOutboxFixture.offerCaptureResume()'), true);
            await replayPage.client.evaluate('document.getElementById("resume-session-btn").click()');
            await waitForSmoke(replayPage.client, '!document.getElementById("session-view").classList.contains("hidden")', signal);
            const retried = await replayPage.client.evaluate('appOutboxFixture.captureSave()');
            assert.equal(retried.sessionId, saved.sessionId);
            const [entry] = await replayPage.client.evaluate('appOutboxFixture.coldQueue()');
            assert.equal(entry.id, writeAhead.primary.submission.queueId);
            assert.deepEqual(entry.descriptor.payload, writeAhead.primary.submission.payload);
        }
        await network(replayPage, false); await replayPage.client.evaluate('appOutboxFixture.replay()');
        const final = await replayPage.client.evaluate('appOutboxFixture.state()');
        assert.equal(final.sessions.length, 1); assert.equal(final.sessions[0].sessionId, saved.sessionId);
        assert.equal(final.sessions[0].fechaIso, original[0].descriptor.payload.sessionData.fechaIso);
        result.captureCases.push({ mode, saved, first, repeated, writeAhead, final });
    }
    event('actual-routine-capture-native-abort-retry');
    app = await appScenario('capture-native-abort-retry');
    await app.client.evaluate("appOutboxFixture.configure('native-capture-abort')");
    await app.client.evaluate('appOutboxFixture.captureStart()'); await network(app, true);
    await app.client.evaluate("appOutboxFixture.nativeFault('success-abort','session.save')");
    const failedCapture = await app.client.evaluate('appOutboxFixture.captureSave()'); assert.equal(failedCapture.ok, false);
    const abortedCapture = await app.client.evaluate('appOutboxFixture.state()');
    assert.equal(abortedCapture.capture.routine, 'One ongoing workout'); assert.equal(abortedCapture.capture.visible, true);
    assert.equal(abortedCapture.capture.weight, '50');
    assert.equal(abortedCapture.capture.draft.data.ejercicios[0].sets[0].peso, 50);
    assert.equal((await app.client.evaluate('appOutboxFixture.coldQueue()')).filter(entry => entry.descriptor.type === 'session.save').length, 0);
    await screenshot(app, 'capture-proven-abort-retained-draft');
    await app.client.evaluate('appOutboxFixture.clearFault()');
    const retriedCapture = await app.client.evaluate('appOutboxFixture.captureSave()'); assert.equal(retriedCapture.queued, true);
    await network(app, false); await app.client.evaluate('appOutboxFixture.replay()');
    const finalCapture = await app.client.evaluate('appOutboxFixture.state()');
    assert.equal(finalCapture.sessions.length, 1); assert.equal(finalCapture.sessions[0].sessionId, retriedCapture.sessionId);
    result.captureCases.push({ mode: 'native-proven-abort-retry', failedCapture, abortedCapture, retriedCapture, finalCapture });

    event('actual-routine-capture-aba-new-form');
    app = await appScenario('capture-auth-and-form-generation');
    await app.client.evaluate("appOutboxFixture.configure('native-capture-ABA')");
    await app.client.evaluate("appOutboxFixture.captureStart('Old A capture')"); await network(app, true);
    await app.client.evaluate('appOutboxFixture.holdQueuedCaptureCompletion();appOutboxFixture.beginCaptureSave()');
    await waitForSmoke(app.client, 'appOutboxFixture.captureCompletionHeld===true', signal);
    await app.client.evaluate("(async()=>{await appOutboxFixture.configure('native-capture-other');await appOutboxFixture.configure('native-capture-ABA');})()");
    await app.client.evaluate("appOutboxFixture.captureStart('New A capture')");
    await app.client.evaluate('appOutboxFixture.releaseQueuedCaptureCompletion();appOutboxFixture.finishCaptureSave()');
    result.captureAba = await app.client.evaluate('appOutboxFixture.state()');
    assert.equal(result.captureAba.capture.routine, 'New A capture'); assert.equal(result.captureAba.capture.weight, '50');
    assert.equal(result.captureAba.capture.draft.routineId, 'capture-routine');
    await app.client.evaluate('appOutboxFixture.clearFault()');
    await app.client.evaluate("appOutboxFixture.captureStart('Old same-owner capture')");
    await app.client.evaluate('appOutboxFixture.holdQueuedCaptureCompletion();appOutboxFixture.beginCaptureSave()');
    await waitForSmoke(app.client, 'appOutboxFixture.captureCompletionHeld===true', signal);
    await app.client.evaluate("appOutboxFixture.captureStart('New same-owner capture')");
    await app.client.evaluate('appOutboxFixture.releaseQueuedCaptureCompletion();appOutboxFixture.finishCaptureSave()');
    result.captureSameOwner = await app.client.evaluate('appOutboxFixture.state()');
    assert.equal(result.captureSameOwner.capture.routine, 'New same-owner capture');
    assert.equal(result.captureSameOwner.capture.weight, '50');
    await app.client.evaluate('appOutboxFixture.clearFault()'); await network(app, false);

    event('actual-routine-two-deliberate-identical-starts');
    app = await appScenario('capture-two-deliberate-starts');
    await app.client.evaluate("appOutboxFixture.configure('native-capture-two-deliberate')"); await network(app, true);
    await app.client.evaluate('appOutboxFixture.captureStart();');
    const deliberateA = await app.client.evaluate('appOutboxFixture.captureSave()');
    await app.client.evaluate('appOutboxFixture.captureStart();');
    const deliberateB = await app.client.evaluate('appOutboxFixture.captureSave()');
    assert.notEqual(deliberateA.sessionId, deliberateB.sessionId);
    await network(app, false); await app.client.evaluate('appOutboxFixture.replay()');
    result.deliberateCaptures = await app.client.evaluate('appOutboxFixture.state()');
    assert.equal(result.deliberateCaptures.sessions.length, 2);

    event('consumed-primary-mirror-drafts-warm-and-cold-native-realms'); result.durableCaptureCases = [];
    for (const slot of ['primary', 'mirror']) {for (const acknowledged of [false, true]) {for (const cold of [false, true]) {
        const owner = `durable-${slot}-${acknowledged}-${cold}`;
        app = await appScenario(owner);
        await network(app, false); await app.client.evaluate(`appOutboxFixture.configure(${JSON.stringify(owner)})`);
        await app.client.evaluate('appOutboxFixture.captureStart()'); await network(app, true);
        await app.client.evaluate(`appOutboxFixture.draftCleanupFault(${JSON.stringify(slot)})`);
        const saved = await app.client.evaluate('appOutboxFixture.captureSave()'); assert.equal(saved.queued, true);
        const stale = (await app.client.evaluate('appOutboxFixture.rawCaptureDrafts()'))[slot];
        assert.equal(stale.captureId, saved.sessionId); assert.equal(stale.submission.payload.sessionId, saved.sessionId);
        await app.client.evaluate('appOutboxFixture.clearFault()');
        if (acknowledged) { await network(app, false); await app.client.evaluate('appOutboxFixture.replay()'); await network(app, true); }
        let target = app;
        if (cold) {
            await app.client.evaluate('appOutboxFixture.persistFixtureBackend()'); target = await page(true, true, app.fixtureOrigin);
            await target.client.evaluate('appOutboxFixture.settleOwner()'); await network(target, true);
            await target.client.evaluate('delete navigator.onLine');
        }
        assert.equal(await target.client.evaluate('appOutboxFixture.offerCaptureResume()'), false);
        await target.client.evaluate('document.getElementById("resume-session-btn").click()');
        await target.client.evaluate('appOutboxFixture.captureSave()');
        assert.equal((await target.client.evaluate('appOutboxFixture.state()')).capture.routine, null);
        await network(target, false); await target.client.evaluate('appOutboxFixture.replay()');
        const final = await target.client.evaluate('appOutboxFixture.state()');
        assert.equal(final.sessions.length, 1); assert.equal(final.sessions[0].sessionId, saved.sessionId);
        assert.equal(final.sessions[0].fechaIso, stale.submission.payload.sessionData.fechaIso);
        await screenshot(target, `consumed-${slot}-${acknowledged}-${cold}`);
        result.durableCaptureCases.push({ slot, acknowledged, coldRealm: cold, saved, stale, final });
    }}}
    event('native-PWA5-no-ID-backup-explicit-resume-preflight');
    app = await appScenario('capture-legacy-PWA5-backup');
    await network(app, false); await app.client.evaluate("appOutboxFixture.configure('native-legacy-no-ID')"); await network(app, true);
    result.legacyCapture = await app.client.evaluate('appOutboxFixture.legacyPwaBackup()'); assert.equal(result.legacyCapture.restored, true);
    assert.equal(await app.client.evaluate('appOutboxFixture.offerCaptureResume()'), true);
    await app.client.evaluate('(async()=>{appOutboxFixture.draftWriteFault();const button=document.getElementById("resume-session-btn");const handler=button.onclick;button.onclick=()=>appOutboxFixture.resumeAttempt=handler();button.click();await appOutboxFixture.resumeAttempt;})()');
    assert.equal((await app.client.evaluate('appOutboxFixture.state()')).capture.routine, null);
    assert.equal((await app.client.evaluate('appOutboxFixture.coldQueue()')).length, 0);
    await app.client.evaluate('appOutboxFixture.clearFault();appOutboxFixture.offerCaptureResume()');
    await app.client.evaluate('document.getElementById("resume-session-btn").focus()');
    await app.client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await app.client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await waitForSmoke(app.client, '!!document.querySelector("input[name=weight-0-0]") && !document.getElementById("session-view").classList.contains("hidden")', signal);
    assert.equal(await app.client.evaluate('document.querySelector("input[name=weight-0-0]").value'), '62.5');
    assert.equal(await app.client.evaluate('document.querySelector("select[name=session-execution-mode]").value'), 'pulley');
    const legacySaved = await app.client.evaluate('appOutboxFixture.captureSave()'); assert.equal(legacySaved.queued, true);
    await network(app, false); await app.client.evaluate('appOutboxFixture.replay()');
    result.legacyCapture.final = await app.client.evaluate('appOutboxFixture.state()');
    assert.equal(result.legacyCapture.final.sessions.length, 1);
    assert.equal(result.legacyCapture.final.sessions[0].sessionId, legacySaved.sessionId);

    event('actual-settings-authoritative-journal-over-advisory-cache');
    app = await appScenario('weekly-advisory-cache');
    await app.client.evaluate("appOutboxFixture.configure('native-weekly-advisory')"); await network(app, true);
    await app.client.evaluate("appOutboxFixture.weeklyCacheFault();appOutboxFixture.weekly(4,'weekly-advisory-first')");
    const advisoryFirst = await app.client.evaluate('appOutboxFixture.state()'); assert.equal(advisoryFirst.uiTarget, '4');
    await app.client.evaluate('appOutboxFixture.clearFault();appOutboxFixture.restartOwnedMemory()');
    const afterMemoryRestart = await app.client.evaluate('appOutboxFixture.state()'); assert.equal(afterMemoryRestart.uiTarget, '4');
    await screenshot(app, 'weekly-advisory-cache-cold-memory');
    await app.client.evaluate("appOutboxFixture.weekly(7,'weekly-advisory-second')");
    const advisoryIntents = (await app.client.evaluate('appOutboxFixture.coldQueue()')).filter(entry => entry.descriptor.type === 'preferences.saveWeeklyTarget');
    assert.equal(advisoryIntents.length, 2);
    assert.equal(advisoryIntents[1].descriptor.payload.baseOperationId, advisoryIntents[0].descriptor.payload.operationId);
    assert.equal(advisoryIntents[1].descriptor.payload.baseRevision, advisoryIntents[0].descriptor.payload.baseRevision + 1);
    await network(app, false); await app.client.evaluate('appOutboxFixture.replay()');
    const advisoryFinal = await app.client.evaluate('appOutboxFixture.state()');
    assert.equal(advisoryFinal.target, 7); assert.equal(advisoryFinal.uiTarget, '7');
    assert.equal(advisoryFinal.pending.length, 0);
    result.weeklyAdvisoryFailure = { advisoryFirst, afterMemoryRestart, advisoryIntents, advisoryFinal };

    event('actual-settings-causal-chain');
    app = await appScenario('weekly-causal-chain');
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
    await finishScenario();
    assert.equal(result.scenarios.length, 26);
    assert.equal(new Set(result.scenarios.map(scenario => scenario.origin)).size, 26);
    assert(result.scenarios.every(scenario => scenario.assertionsCompleted && scenario.profileAndStorageRetained));
    assert.equal(result.appCases.length, 6); assert.equal(result.captureCases.length, 6);
    assert.equal(result.durableCaptureCases.length, 8);
    await verifyRetainedScenarios();
    event('passed-assertions-awaiting-cleanup');
}

await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
try {
    result.sourceHashesLf = Object.fromEntries(await Promise.all(['js/utils/durable-outbox.js', 'js/utils/outbox-order.js',
        'js/utils/outbox-journal-storage.js', 'js/utils/offline-manager.js', 'js/utils/local-first-cache.js', 'js/app.js', 'js/modules/session-manager.js',
        'js/i18n.js', 'js/version-manager.js', 'tests/browser/outbox-app-bootstrap.js', 'tests/browser/outbox-app-environment.js'].map(async file => [file,
        crypto.createHash('sha256').update((await fs.readFile(path.join(root, file), 'utf8')).replace(/\r\n?/g, '\n')).digest('hex')])));
    result.fixtureSourceHashesLf = Object.fromEntries(await Promise.all(['scripts/browser-outbox-smoke.mjs',
        'scripts/verify-outbox-smoke-negative.mjs'].map(async file => [file,
        crypto.createHash('sha256').update((await fs.readFile(path.join(root, file), 'utf8')).replace(/\r\n?/g, '\n')).digest('hex')])));
    if (negativeCase && !['cleanup-owner', 'cleanup-connection', 'cleanup-server'].includes(negativeCase)) throw new Error('Unknown outbox smoke negative case');
    await run();
} catch (error) {
    result.primaryError = serializedError(error);
    try { if (applicationPage || browser) await screenshot(applicationPage || browser, 'failure'); }
    catch (captureError) { result.captureError = serializedError(captureError); }
}
finally {
    const cleanup = async (stage, operation, detail = {}) => {
        try { await operation(); if (negativeCase === stage) throw new Error(`Deliberately injected ${stage} failure after real cleanup`); event(stage, { ...detail, status: 'done' }); }
        catch (error) { cleanupErrors.push({ stage, ...detail, ...serializedError(error) }); event(stage, { ...detail, status: 'failed', message: error.message }); }
    };
    await cleanup('cleanup-owner', async () => { if (browser) await browser.owner.close(); else if (profile) await removeSmokeProfile(profile); });
    for (const connection of connections) await cleanup('cleanup-connection', async () => { connection.client.close(); });
    for (const { server, origin, scenarioId } of servers) {
        await cleanup('cleanup-server', async () => {
            if (server.listening) {
                server.closeAllConnections();
                await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
            }
            const proof = result.servers.find(item => item.origin === origin);
            if (proof) { proof.closed = true; proof.closedAt = new Date().toISOString(); }
        }, { origin, scenarioId });
    }
    result.cleanupErrors = cleanupErrors;
    try { await fs.writeFile(path.join(output, 'trace.json'), `${JSON.stringify(trace, null, 2)}\n`); }
    catch (error) { cleanupErrors.push({ stage: 'cleanup-trace', ...serializedError(error) }); }
    if (signal.aborted && !result.primaryError) result.primaryError = serializedError(signal.reason);
    result.status = result.primaryError || cleanupErrors.length ? 'failed' : 'passed'; result.completedAt = new Date().toISOString();
    result.elapsedMs = Date.parse(result.completedAt) - Date.parse(result.startedAt);
    // Publish final status only after every owner/connection/server/trace cleanup.
    await fs.writeFile(path.join(output, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== 'passed') process.exitCode = 1;
    console.log(JSON.stringify({ status: result.status, primaryError: result.primaryError?.message, cleanupErrors: cleanupErrors.map(item => item.stage), output }));
}
