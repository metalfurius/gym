import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { openSmokeBrowser, removeSmokeProfile, waitForSmoke } from '../../scripts/browser-smoke-driver.mjs';
import { connectOwnedChromium } from '../../scripts/browser-cdp-target.mjs';

const root = process.cwd();
const baseline = process.argv.includes('--baseline');
const ackFailure = process.argv.includes('--ack-abort') ? 'ack-abort' : process.argv.includes('--ack-unknown') ? 'completion-unknown' : null;
const negativeCleanup = process.argv.includes('--negative-cleanup');
const evidenceRoot = path.resolve(process.env.WEEKLY_RESOLUTION_EVIDENCE_DIR || path.join(root, 'Validation Evidence/2026-11-28-weekly-offline-resolution'));
const output = path.join(evidenceRoot,
    baseline ? 'baseline-native' : negativeCleanup ? 'native-cleanup-negative' : ackFailure ? `native-${ackFailure}` : 'native-replay');
await fs.mkdir(output);
const signal = AbortSignal.timeout(90_000);
const trace = [], connections = [], cleanupErrors = [];
const result = { status: 'running', runId: crypto.randomUUID(), startedAt: new Date().toISOString(), node: process.version,
    checkoutSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    mode: 'Actual app and outbox, native same-profile tabs/IndexedDB, synthetic SDK only; no live backend', timezone: 'Europe/Paris',
    baselineObservation: baseline, ackFailure, negativeCleanup };
result.runnerSha256Lf = crypto.createHash('sha256').update((await fs.readFile(process.argv[1], 'utf8')).replace(/\r\n?/g, '\n')).digest('hex');
let browser, server, profile, consumer;
const event = (stage, detail = {}) => trace.push({ method: 'ConflictMetadata.stage', params: { runId: result.runId, stage, ...detail } });
const evaluate = (page, code) => page.client.evaluate(code);
async function screenshot(page, name) {
    const captured = await page.client.send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(output, `${name}.png`), Buffer.from(captured.data, 'base64'));
}
async function snapshot() {
    return evaluate(consumer, String.raw`(async()=>{
        const state=await consumerQueue.outbox.read();const {__firestoreState}=await import('/tests/mocks/firebase-state.js');
        const {__getMockTransactionAttempts}=await import('/tests/mocks/firebase-firestore.js');
        const original=state.intents.get('old-conflict'),replacement=state.intents.get('offline-replacement');
        return{state:appOutboxFixture.state(),preferences:__firestoreState.documents.get('users/weekly-resolution-owner/app_data/user_preferences'),
            oldOutcome:state.acknowledgements.get('old-conflict'),newOutcome:state.acknowledgements.get('offline-replacement'),
            appliedReceipt:__firestoreState.documents.get('users/weekly-resolution-owner/app_data/user_preferences/weekly_operations/'+replacement.descriptor.payload.operationId),
            oldReceipt:__firestoreState.documents.get('users/weekly-resolution-owner/app_data/user_preferences/weekly_operations/'+original.descriptor.payload.operationId),
            remaining:state.entries,original,replacement,transactionAttempts:__getMockTransactionAttempts(),
            acknowledgementBatches:(await consumerQueue.outbox.storage.readRows()).map(row=>JSON.parse(row.value.eventsJson))
                .filter(events=>events.some(event=>event.kind==='ack'&&event.id==='offline-replacement'))};
    })()`);
}
try {
    result.sourceHashesLf = Object.fromEntries(await Promise.all(['js/utils/outbox-order.js', 'js/utils/durable-outbox.js',
        'js/utils/offline-manager.js', 'js/modules/session-manager.js', 'js/utils/local-first-cache.js', 'js/app.js',
        'tests/browser/outbox-app-bootstrap.js', 'tests/browser/outbox-app-environment.js'].map(async file => [file,
        crypto.createHash('sha256').update((await fs.readFile(file, 'utf8')).replace(/\r\n?/g, '\n')).digest('hex')])));
    const imports = Object.fromEntries(['app', 'auth', 'firestore'].map(name => [
        `https://www.gstatic.com/firebasejs/11.6.1/firebase-${name}.js`, `/tests/mocks/firebase-${name}.js`,
    ]));
    const html = (await fs.readFile('index.html', 'utf8'))
        .replace('<head>', `<head><script type="importmap">${JSON.stringify({ imports })}</script><script>localStorage.setItem('__outbox_browser_fixture_owner__','weekly-resolution-owner');Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:undefined});</script>`)
        .replace(/\s*<link\b[^>]*https:\/\/fonts\.[^>]*>/g, '')
        .replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/[^"]+"><\/script>/, '')
        .replace('src="js/app.js"', 'src="tests/browser/outbox-app-bootstrap.js"');
    const fixture = '<!doctype html><script type="module">import {OfflineManager} from "/js/utils/offline-manager.js";window.outbox=new OfflineManager();await outbox.restorePersistedQueue();window.ready=true;</script>';
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
            const type = path.extname(file) === '.css' ? 'text/css' : path.extname(file) === '.json' ? 'application/json' : 'application/javascript';
            response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }); response.end(body);
        } catch { response.writeHead(404); response.end(); }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`; result.origin = origin;
    profile = await fs.mkdtemp(path.join(os.tmpdir(), 'gym-smoke-conflict-metadata-'));
    browser = await openSmokeBrowser('chromium', `${origin}/fixture`, profile, item => trace.push(item), signal);
    connections.push(browser); result.browser = browser.version;
    await browser.client.send('Emulation.setTimezoneOverride', { timezoneId: 'Europe/Paris' });
    await waitForSmoke(browser.client, 'window.ready===true', signal);
    consumer = await connectOwnedChromium(browser.owner, profile, `${origin}/app-fixture`, item => trace.push(item), signal);
    connections.push(consumer); await consumer.client.send('Emulation.setTimezoneOverride', { timezoneId: 'Europe/Paris' });
    await waitForSmoke(consumer.client, '!!window.appOutboxFixture', signal);
    await evaluate(consumer, `(async()=>{
        const{setCalendarClock}=await import('/js/utils/calendar-clock.js');setCalendarClock(()=>new Date('2026-11-20T12:00:00Z'));
        await appOutboxFixture.configure('weekly-resolution-owner');
        const{offlineManager:q}=await import('/js/utils/offline-manager.js');window.consumerQueue=q;
    })()`);
    for (let index = 0; index < 6; index++) {
        await evaluate(consumer, 'appOutboxFixture.weekly('+[4,2,6,4,6,3][index]+','+JSON.stringify('seed-'+index)+')');
        if (index === 4) {
            await evaluate(consumer, String.raw`(async()=>{
                const {createWeeklyTargetOperation}=await import('/js/utils/weekly-preferences.js');
                const {__firestoreState}=await import('/tests/mocks/firebase-state.js');
                const record=__firestoreState.documents.get('users/weekly-resolution-owner/app_data/user_preferences').weeklyTargetsByWeek['2026-11-16'];
                window.staleWeeklyPayload=createWeeklyTargetOperation('weekly-resolution-owner','2026-11-16',5,record,'2026-11-20T11:00:00.000Z');
            })()`);
        }
    }
    await evaluate(consumer, String.raw`(async()=>{
        consumerQueue.queueOperation(null,'old revision-5 intent',{id:'old-conflict',descriptor:{type:'preferences.saveWeeklyTarget',payload:staleWeeklyPayload}});
        await consumerQueue.persistQueue();await appOutboxFixture.replay();
    })()`);
    result.before = await evaluate(consumer, String.raw`(async()=>{
        const {__firestoreState}=await import('/tests/mocks/firebase-state.js');
        return{preferences:__firestoreState.documents.get('users/weekly-resolution-owner/app_data/user_preferences'),
            conflictReceipt:__firestoreState.documents.get('users/weekly-resolution-owner/app_data/user_preferences/weekly_operations/'+staleWeeklyPayload.operationId),
            entry:consumerQueue.pendingOperations.find(e=>e.id==='old-conflict')};
    })()`);
    assert.equal(result.before.preferences.weeklyTargetsByWeek['2026-11-16'].revision, 6);
    assert.equal(result.before.conflictReceipt.status, 'conflict'); assert.equal(result.before.conflictReceipt.currentRevision, 6);
    assert.equal(result.before.entry.conflict.weekKey, '2026-11-16');
    await consumer.client.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await evaluate(consumer, "appOutboxFixture.weekly(5,'offline-replacement')");
    result.queued = await evaluate(consumer, "consumerQueue.pendingOperations.find(e=>e.id==='offline-replacement')");
    assert.equal(result.queued.descriptor.payload.baseRevision, 6); assert.equal(result.queued.semanticDependencyIds.includes('old-conflict'), false);
    assert.deepEqual(result.queued.descriptor.observedWeeklyConflictIds, ['old-conflict']);
    if (ackFailure === 'ack-abort') await evaluate(consumer, "appOutboxFixture.nativeFault('ack-abort','preferences.saveWeeklyTarget')");
    if (ackFailure === 'completion-unknown') await evaluate(consumer, 'appOutboxFixture.unknownJournalCompletion()');
    await consumer.client.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await evaluate(consumer, 'delete navigator.onLine;appOutboxFixture.replay()');
    if (ackFailure) {
        result.afterFirstReplay = await snapshot();
        assert.equal(result.afterFirstReplay.appliedReceipt.revision, 7);
        if (ackFailure === 'ack-abort') {
            assert.equal(result.afterFirstReplay.newOutcome, undefined); assert.equal(result.afterFirstReplay.oldOutcome, undefined);
            assert.deepEqual(result.afterFirstReplay.remaining.map(entry => entry.id).sort(), ['offline-replacement', 'old-conflict']);
            result.nativeFaultEvents = await evaluate(consumer, 'appOutboxFixture.nativeEvents');
            assert.ok(result.nativeFaultEvents.some(item => item.event === 'request-success'));
            assert.ok(result.nativeFaultEvents.some(item => item.event === 'tx-abort'));
        } else {
            assert.equal(result.afterFirstReplay.newOutcome, 'accepted'); assert.equal(result.afterFirstReplay.oldOutcome, 'resolved');
        }
        await evaluate(consumer, 'appOutboxFixture.persistFixtureBackend()');
        const closed = await browser.client.send('Target.closeTarget', { targetId: consumer.targetId }); assert.equal(closed.success, true);
        consumer = await connectOwnedChromium(browser.owner, profile, `${origin}/app-fixture?coldCapture`, item => trace.push(item), signal);
        connections.push(consumer); await consumer.client.send('Emulation.setTimezoneOverride', { timezoneId: 'Europe/Paris' });
        await waitForSmoke(consumer.client, '!!window.appOutboxFixture', signal);
        await evaluate(consumer, `(async()=>{
            const{setCalendarClock}=await import('/js/utils/calendar-clock.js');setCalendarClock(()=>new Date('2026-11-20T12:00:00Z'));
            const{offlineManager:q}=await import('/js/utils/offline-manager.js');window.consumerQueue=q;await appOutboxFixture.settleOwner();
        })()`);
        await consumer.client.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
        result.cold = await snapshot();
        assert.deepEqual(result.cold.replacement.descriptor, result.queued.descriptor);
        assert.equal(result.cold.replacement.timestamp, result.queued.timestamp);
        assert.equal(result.cold.state.online, false);
        await consumer.client.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
        await evaluate(consumer, 'delete navigator.onLine;appOutboxFixture.replay()');
    }
    result.afterReplay = await snapshot();
    assert.equal(result.afterReplay.appliedReceipt.status, 'applied'); assert.equal(result.afterReplay.appliedReceipt.revision, 7);
    assert.equal(result.afterReplay.preferences.weeklyTargetsByWeek['2026-11-16'].revision, 7);
    assert.equal(result.afterReplay.newOutcome, 'accepted'); assert.equal(result.afterReplay.oldOutcome, 'resolved');
    assert.deepEqual(result.afterReplay.remaining, []);
    assert.equal(result.afterReplay.state.uiTarget, '5');
    assert.deepEqual(result.afterReplay.oldReceipt, result.before.conflictReceipt);
    assert.deepEqual(result.afterReplay.original.descriptor, result.before.entry.descriptor);
    assert.equal(result.afterReplay.original.timestamp, result.before.entry.timestamp);
    assert.equal(result.afterReplay.acknowledgementBatches.length, 1);
    assert.deepEqual(result.afterReplay.acknowledgementBatches[0].map(event => [event.kind, event.id, event.outcome]),
        [['ack', 'old-conflict', 'resolved'], ['ack', 'offline-replacement', 'accepted']]);
    await evaluate(consumer, 'appOutboxFixture.replay()'); result.duplicateReplay = await snapshot();
    assert.equal(result.duplicateReplay.transactionAttempts, result.afterReplay.transactionAttempts);
    assert.equal(result.duplicateReplay.preferences.weeklyTargetsByWeek['2026-11-16'].revision, 7);
    await screenshot(consumer, 'explicit-offline-replacement-resolved'); event('assertions-passed');
} catch (error) {
    result.error = error.stack || error.message;
    try { if (consumer || browser) await screenshot(consumer || browser, 'failure'); } catch (captureError) { result.captureError = captureError.message; }
} finally {
    const cleanup = async (step, action) => { try { await action(); event(step, { status: 'done' }); } catch (error) { cleanupErrors.push({ step, message: error.message }); } };
    await cleanup('browser', async () => {
        if (browser) await browser.owner.close(); else if (profile) await removeSmokeProfile(profile);
        if (negativeCleanup) throw new Error('Injected owner-close failure after actual cleanup');
    });
    for (const connection of connections) await cleanup('connection', async () => connection.client.close());
    await cleanup('server', async () => { if (server?.listening) { server.closeAllConnections(); await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); } });
    result.cleanupErrors = cleanupErrors;
    if (signal.aborted) result.error ||= signal.reason.message;
    await fs.writeFile(path.join(output, 'trace.json'), `${JSON.stringify(trace, null, 2)}\n`);
    result.status = result.error || cleanupErrors.length ? 'failed' : 'passed'; result.completedAt = new Date().toISOString();
    await fs.writeFile(path.join(output, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
}
console.log(JSON.stringify({ status: result.status, output, error: result.error, cleanupErrors }));
if (result.status !== 'passed') process.exitCode = 1;
