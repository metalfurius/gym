#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { browserEvidenceDirectory } from './browser-fixture-runner.mjs';
import { connectOwnedChromium, connectOwnedChromiumBrowser } from './browser-cdp-target.mjs';
import { captureBrowserDiagnostics } from './browser-process-diagnostics.mjs';
import { removeSmokeProfile, resolveSmokeBrowser } from './browser-smoke-driver.mjs';
import { spawnOwnedBrowser } from './owned-browser-process.mjs';

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function barrier(predicate, signal, label) {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
        signal.throwIfAborted();
        if (await predicate()) return;
        await sleep(25);
    }
    throw new Error(`Owned-target regression timed out: ${label}`);
}

async function run() {
    const output = path.join(browserEvidenceDirectory('owned-target'), 'owned-target');
    await fs.mkdir(output, { recursive: true });
    const trace = [];
    const onEvent = event => trace.push({ receivedAt: new Date().toISOString(), ...event });
    const evidence = { status: 'running', startedAt: new Date().toISOString(), nodeVersion: process.version,
        platform: process.platform, syntheticDataOnly: true, requests: [],
        checkoutSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8', timeout: 5_000 }).trim() };
    await fs.writeFile(path.join(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(new Error('Owned-target smoke exceeded its 60-second deadline')), 60_000);
    let initialResponse;
    let server;
    let profile;
    let owner;
    let connection;
    let setup;
    let diagnostics;
    let failure;
    try {
        server = createServer((request, response) => {
            evidence.requests.push({ url: request.url, at: new Date().toISOString() });
            if (request.url === '/initial-navigation') { initialResponse = response; return; }
            if (request.url === '/broken-navigation') { response.destroy(); return; }
            response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
            response.end(request.url === '/fixture'
                ? '<!doctype html><title>Owned target</title><p id="proof">fixture network body</p>'
                : '<!doctype html><title>Initial destination</title><p>Other tab completed</p>');
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const origin = `http://127.0.0.1:${server.address().port}`;
        profile = await fs.mkdtemp(path.join(os.tmpdir(), 'gym-smoke-owned-target-'));
        const executable = await resolveSmokeBrowser('chromium');
        const args = ['--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run',
            '--no-default-browser-check', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
            `--user-data-dir=${profile}`, 'about:blank'];
        owner = spawnOwnedBrowser(executable, args, { afterClose: () => removeSmokeProfile(profile) });
        diagnostics = captureBrowserDiagnostics(owner, { kind: 'chromium', executable, args, onEvent });
        setup = await connectOwnedChromiumBrowser(owner, profile,
            event => onEvent({ ...event, method: `Setup.${event.method}` }), controller.signal);
        const initialTargets = await setup.raw.send('Target.getTargets');
        evidence.cliTargetIds = initialTargets.targetInfos.filter(target => target.type === 'page').map(target => target.targetId);
        assert.ok(evidence.cliTargetIds.length > 0);
        const pending = await setup.raw.send('Target.createTarget', { url: `${origin}/initial-navigation` });
        // A pre-existing page's navigation is deliberately still pending when
        // the connector used by numeric/counting/upgrade creates its own page.
        await barrier(() => initialResponse, controller.signal, 'pending pre-existing navigation');
        connection = await connectOwnedChromium(owner, profile, `${origin}/fixture`, onEvent, controller.signal);
        evidence.browserVersion = connection.version;
        const expected = process.env.CHROME_EXPECTED_VERSION;
        if (expected) assert.equal(connection.version.product.split('/').pop(), expected);
        evidence.ownedTarget = { targetId: connection.targetId, sessionId: connection.sessionId };
        assert.equal(initialResponse.writableEnded, false);
        assert.notEqual(pending.targetId, connection.targetId, 'The pending target was reused');
        assert.ok(!evidence.cliTargetIds.includes(connection.targetId), 'The CLI target was reused');
        evidence.initialTargetId = pending.targetId;
        evidence.whileInitialPending = await connection.client.evaluate('({url:location.href,text:document.getElementById("proof")?.textContent})');
        assert.deepEqual(evidence.whileInitialPending, { url: `${origin}/fixture`, text: 'fixture network body' });
        initialResponse.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
        initialResponse.end('<!doctype html><script>location.replace("/initial-destination")</script>');
        await barrier(() => evidence.requests.some(request => request.url === '/initial-destination'), controller.signal, 'pre-existing navigation completion');
        evidence.afterInitialCompletes = await connection.client.evaluate('({url:location.href,text:document.getElementById("proof")?.textContent})');
        assert.deepEqual(evidence.afterInitialCompletes, evidence.whileInitialPending);
        assert.equal(evidence.requests.filter(request => request.url === '/fixture').length, 1);
        const commands = trace.filter(event => event.method === 'BrowserProtocol.command').map(event => event.params);
        assert.equal(commands.filter(command => command.method === 'Target.createTarget').length, 1);
        assert.equal(commands.filter(command => command.method === 'Page.navigate').length, 0);
        await fs.writeFile(path.join(output, 'owned-page.png'), Buffer.from((await connection.client.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
        let navigationError;
        try { await connection.client.send('Page.navigate', { url: `${origin}/broken-navigation` }); }
        catch (error) { navigationError = error; }
        assert.match(navigationError?.message || '', /Page\.navigate failed: net::ERR_/);
        evidence.negativeNavigation = { error: navigationError.message, observed: true };
        assert.equal(trace.filter(event => event.method === 'BrowserProtocol.command'
            && event.params.method === 'Page.navigate').length, 1, 'Navigation failure was retried');
        await barrier(async () => {
            const { frameTree } = await connection.client.send('Page.getFrameTree');
            if (frameTree.frame.unreachableUrl !== `${origin}/broken-navigation`) return false;
            try { return await connection.client.evaluate('document.readyState === "complete"'); }
            catch (error) {
                if (/context.*destroyed|Cannot find context|context.*not found/i.test(error.message)) return false;
                throw error;
            }
        }, controller.signal, 'navigation error document');
        await fs.writeFile(path.join(output, 'navigation-error.png'), Buffer.from((await connection.client.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    } catch (error) {
        failure = error;
        evidence.error = error.stack || error.message;
        if (connection) {
            try { await fs.writeFile(path.join(output, 'failure.png'), Buffer.from((await connection.client.send('Page.captureScreenshot', { format: 'png' })).data, 'base64')); }
            catch (captureError) { evidence.captureError = captureError.message; }
        }
    } finally {
        try {
            if (owner) await owner.close();
            else if (profile) await removeSmokeProfile(profile);
        } catch (error) { failure ||= error; evidence.cleanupError = error.message; }
        setup?.raw.close();
        if (diagnostics) evidence.browserProcess = diagnostics.snapshot();
        if (server) {
            server.closeAllConnections();
            await new Promise(resolve => server.close(resolve));
        }
        clearTimeout(deadline);
        if (controller.signal.aborted) { failure ||= controller.signal.reason; evidence.deadlineError = controller.signal.reason.message; }
        evidence.status = failure ? 'failed' : 'passed';
        evidence.completedAt = new Date().toISOString();
        await fs.writeFile(path.join(output, 'trace.json'), `${JSON.stringify(trace, null, 2)}\n`);
        await fs.writeFile(path.join(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    }
    if (failure) throw failure;
    console.log(`[owned-target] passed ${connection.version.product}; isolated target and explicit navigation error; artifacts ${output}`);
}

run().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
