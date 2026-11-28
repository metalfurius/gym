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
const offlineObservation = process.argv.includes('--observe-offline-replay');
const output = path.join(root, 'Validation Evidence/2026-11-27-outbox-conflict-metadata',
    offlineObservation ? 'native-metadata-offline-replay-diagnostic' : 'native-metadata');
await fs.mkdir(output);
const signal = AbortSignal.timeout(90_000);
const trace = [], connections = [], cleanupErrors = [];
const result = { status: 'running', runId: crypto.randomUUID(), startedAt: new Date().toISOString(), node: process.version,
    checkoutSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    mode: 'Actual app and outbox, native same-profile tabs/IndexedDB, synthetic SDK only; no live backend', timezone: 'Europe/Paris',
    offlineReplayObservation: offlineObservation };
let browser, server, profile, consumer;
const event = (stage, detail = {}) => trace.push({ method: 'ConflictMetadata.stage', params: { runId: result.runId, stage, ...detail } });
const evaluate = (page, code) => page.client.evaluate(code);
async function screenshot(page, name) {
    const captured = await page.client.send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(output, `${name}.png`), Buffer.from(captured.data, 'base64'));
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
        .replace('<head>', `<head><script type="importmap">${JSON.stringify({ imports })}</script><script>Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:undefined});</script>`)
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
        await appOutboxFixture.configure('metadata-owner');
        const{offlineManager:q}=await import('/js/utils/offline-manager.js');window.consumerQueue=q;
    })()`);
    await consumer.client.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await evaluate(browser, `(async()=>{
        const payload={userId:'metadata-owner',weeklyTargetDays:5,updatedAtIso:'2026-11-22T23:30:00.000Z'};
        outbox.queueOperation(null,'Legacy target',{id:'legacy-target',descriptor:{type:'preferences.saveWeeklyTarget',payload}});
        await outbox.persistQueue();await outbox.markConflict('legacy-target',{result:{currentRevision:3}});
    })()`);
    await evaluate(consumer, 'consumerQueue.restorePersistedQueue()');
    result.before = await evaluate(consumer, `(async()=>{const{getWeekKeyForDate}=await import('/js/utils/quick-log.js');return{
        entry:consumerQueue.pendingOperations.find(e=>e.id==='legacy-target'),fallbackWeek:getWeekKeyForDate(new Date('2026-11-22T23:30:00Z')),
        timezone:Intl.DateTimeFormat().resolvedOptions().timeZone};})()`);
    assert.equal(result.before.fallbackWeek, '2026-11-23'); assert.equal(result.before.entry.conflict.weekKey, undefined);
    await evaluate(browser, "outbox.markConflict('legacy-target',{result:{currentRevision:3,weekKey:'2026-11-16'}})");
    await evaluate(consumer, 'consumerQueue.persistQueue()');
    result.afterPublicPersist = await evaluate(consumer, "consumerQueue.pendingOperations.find(e=>e.id==='legacy-target')");
    assert.equal(result.afterPublicPersist.conflict.weekKey, '2026-11-16');
    assert.deepEqual(result.afterPublicPersist.descriptor, result.before.entry.descriptor);
    assert.equal(result.afterPublicPersist.timestamp, result.before.entry.timestamp);
    await evaluate(consumer, "consumerQueue.markConflict('legacy-target',{result:{currentRevision:6}})");
    const cold = await connectOwnedChromium(browser.owner, profile, `${origin}/fixture`, item => trace.push(item), signal);
    connections.push(cold); await waitForSmoke(cold.client, 'window.ready===true', signal);
    result.cold = await evaluate(cold, "outbox.pendingOperations.find(e=>e.id==='legacy-target')");
    assert.deepEqual(result.cold.conflict, { code: 'sync/conflict', currentRevision: 6, weekKey: '2026-11-16' });
    result.canonicalFork = await evaluate(browser, `(async()=>{try{await outbox.markConflict('legacy-target',{result:{currentRevision:7,weekKey:'2026-11-23'}});return null;}
        catch(error){return{code:error.code,reason:error.reason,weeks:error.canonicalWeeks};}})()`);
    assert.equal(result.canonicalFork.code, 'outbox/integrity'); assert.equal(result.canonicalFork.reason, 'conflicting-canonical-week');
    await evaluate(browser, `(async()=>{for(const [id,userId,weekKey]of[['foreign','other-owner','2026-11-16'],['other-week','metadata-owner','2026-11-23']]){
        outbox.queueOperation(null,id,{id,descriptor:{type:'preferences.saveWeeklyTarget',payload:{userId,weekKey,weeklyTargetDays:4}}});
        await outbox.persistQueue();await outbox.markConflict(id,{result:{currentRevision:3,weekKey}});}})()`);
    await evaluate(consumer, 'consumerQueue.restorePersistedQueue()');
    result.beforeReplacement = await evaluate(consumer, `(async()=>{const{__firestoreState}=await import('/tests/mocks/firebase-state.js');return{
        preferences:__firestoreState.documents.get('users/metadata-owner/app_data/user_preferences'),
        conflicts:consumerQueue.pendingOperations.filter(e=>e.status==='conflict').map(e=>({id:e.id,conflict:e.conflict}))};})()`);
    if (!offlineObservation) {
        await consumer.client.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
        await evaluate(consumer, 'delete navigator.onLine;appOutboxFixture.replay()');
    }
    await evaluate(consumer, "appOutboxFixture.weekly(5,'native-ui-resolution')");
    result.replacement = await evaluate(consumer, `(async()=>{const state=await consumerQueue.outbox.read();return{
        entry:state.intents.get('native-ui-resolution'),outcome:state.acknowledgements.get('native-ui-resolution')};})()`);
    if (offlineObservation) {
        await consumer.client.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
        await evaluate(consumer, 'delete navigator.onLine;appOutboxFixture.replay()');
    }
    result.afterUi = await evaluate(consumer, `(async()=>{const state=await consumerQueue.outbox.read();const{__firestoreState}=await import('/tests/mocks/firebase-state.js');return{
        state:appOutboxFixture.state(),outcome:state.acknowledgements.get('legacy-target'),
        replacementOutcome:state.acknowledgements.get('native-ui-resolution'),replacement:state.intents.get('native-ui-resolution'),
        preferences:__firestoreState.documents.get('users/metadata-owner/app_data/user_preferences'),
        receipts:[...__firestoreState.documents].filter(([key])=>key.startsWith('users/metadata-owner/')&&key.includes('/weekly_operations/')),
        entries:state.entries.map(e=>({id:e.id,owner:e.descriptor.payload.userId,week:e.conflict?.weekKey||e.descriptor.payload.weekKey})),
        original:state.intents.get('legacy-target'),resolutionCriteriaLeaked:(await consumerQueue.outbox.storage.readRows()).flatMap(r=>JSON.parse(r.value.eventsJson)).some(e=>Object.hasOwn(e,'resolution'))};})()`);
    assert.equal(result.afterUi.state.target, 5); assert.equal(result.afterUi.state.uiTarget, '5');
    assert.equal(result.afterUi.outcome, 'resolved'); assert.equal(result.afterUi.resolutionCriteriaLeaked, false);
    assert.deepEqual(result.afterUi.entries.map(entry => entry.id).sort(), ['foreign', 'other-week']);
    assert.deepEqual(result.afterUi.original.descriptor, result.before.entry.descriptor);
    assert.equal(result.afterUi.original.timestamp, result.before.entry.timestamp);
    await screenshot(consumer, 'canonical-conflict-ui-resolved'); event('assertions-passed');
} catch (error) {
    result.error = error.stack || error.message;
    try { if (consumer || browser) await screenshot(consumer || browser, 'failure'); } catch (captureError) { result.captureError = captureError.message; }
} finally {
    const cleanup = async (step, action) => { try { await action(); event(step, { status: 'done' }); } catch (error) { cleanupErrors.push({ step, message: error.message }); } };
    await cleanup('browser', async () => { if (browser) await browser.owner.close(); else if (profile) await removeSmokeProfile(profile); });
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
