#!/usr/bin/env node

import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { connectOwnedChromium } from './browser-cdp-target.mjs';
import { spawnOwnedBrowser } from './owned-browser-process.mjs';
import { captureBrowserDiagnostics } from './browser-process-diagnostics.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME_PATH_OVERRIDE = process.env.CHROME_PATH;
const CHROME_PATH_CANDIDATES =
    process.platform === 'win32'
        ? [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        ]
        : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const SESSION_KEY = 'gymTracker_inProgressSession';
const UPDATE_MESSAGE_KEY = 'gym-tracker-update-message-seen';
const RELEASE_A = 'v2.7.0';
const RELEASE_B = 'v2.7.1';
const RELEASE_B_VERSION = '2.7.1';
const BOOTSTRAP_DELAY_MS = Number(process.env.UPGRADE_SMOKE_BOOTSTRAP_DELAY_MS || 0);
const NEGATIVE_CASE = process.env.UPGRADE_SMOKE_NEGATIVE_CASE || '';
const evidenceDirectory = path.resolve(process.env.UPGRADE_SMOKE_EVIDENCE_DIR ||
    path.join(ROOT, 'tmp', 'upgrade-smoke', `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`));

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function copyRelease(targetDirectory) {
    await fs.mkdir(targetDirectory, { recursive: true });
    const copyEntries = [
        'assets',
        'css',
        'js',
        'index.html',
        'manifest.json',
        'release.json',
        'sw.js',
        'scripts',
        'update-version.cjs',
    ];
    for (const entry of copyEntries) {
        await fs.cp(path.join(ROOT, entry), path.join(targetDirectory, entry), { recursive: true });
    }
}

async function resolveChromePath() {
    const candidates = CHROME_PATH_OVERRIDE ? [CHROME_PATH_OVERRIDE] : CHROME_PATH_CANDIDATES;
    for (const candidate of candidates) {
        try {
            await fs.access(candidate);
            return candidate;
        } catch {
            // Try the next runner-specific installation path.
        }
    }
    throw new Error(`Chrome executable not found. Set CHROME_PATH; tried ${candidates.join(', ')}`);
}

async function writeUpgradeFixture(directory, revision) {
    const fixture = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="gym-release-revision" content="${revision}">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Gym release upgrade fixture</title>
  <style>body{font:16px system-ui,sans-serif;max-width:42rem;margin:2rem auto;padding:0 1rem}#status{padding:.75rem;border:1px solid #999}label{display:block;margin-top:1rem}textarea{width:100%;min-height:7rem}</style>
</head>
<body>
  <main>
    <h1>Gym release upgrade</h1>
    <p id="status" role="status" aria-live="polite">Release ${revision}</p>
    <button id="apply-update" type="button" hidden>Apply verified update</button>
    <label for="workout">In-progress workout</label>
    <textarea id="workout" aria-describedby="status"></textarea>
  </main>
  <script type="module">
    const sessionKey = '${SESSION_KEY}';
    const updateMessageKey = '${UPDATE_MESSAGE_KEY}';
    const backupKey = 'gym-tracker-backup-session';
    const traceKey = 'upgrade-fixture-trace';
    const trace = (type, details = {}) => {
      const entries = JSON.parse(sessionStorage.getItem(traceKey) || '[]');
      entries.push({ type, revision: '${revision}', time: Date.now(), ...details });
      sessionStorage.setItem(traceKey, JSON.stringify(entries));
    };
    window.upgradeFixture = { initialized: false, waitingReady: false };
    trace('bootstrap.started', { delayMs: ${BOOTSTRAP_DELAY_MS} });
    if (${BOOTSTRAP_DELAY_MS} > 0) await new Promise(resolve => setTimeout(resolve, ${BOOTSTRAP_DELAY_MS}));
    let hasBeenControlled = Boolean(navigator.serviceWorker.controller);
    let applyingUpdate = false;
    let reloadRequested = false;
    let registration;
    const workout = document.getElementById('workout');
    const applyButton = document.getElementById('apply-update');
    workout.value = localStorage.getItem(sessionKey) || '';
    workout.addEventListener('input', () => localStorage.setItem(sessionKey, workout.value));
    function preserveSession() {
      const current = localStorage.getItem(sessionKey);
      if (current) localStorage.setItem(backupKey, current);
    }
    function showWaitingUpdate() {
      if (registration.waiting?.state !== 'installed' || !navigator.serviceWorker.controller) return;
      window.upgradeFixture.waitingReady = true;
      sessionStorage.setItem(updateMessageKey, 'true');
      document.getElementById('status').textContent = 'Update available; apply to preserve this workout and reload';
      applyButton.hidden = false;
      trace('update.available');
    }
    applyButton.addEventListener('click', event => {
      if (registration.waiting?.state !== 'installed' || applyingUpdate) return;
      preserveSession();
      applyingUpdate = true;
      applyButton.disabled = true;
      trace('update.clicked', { trusted: event.isTrusted });
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      const controlled = Boolean(navigator.serviceWorker.controller);
      trace('controller.changed', { hasBeenControlled, controlled, applyingUpdate });
      if (!hasBeenControlled) {
        hasBeenControlled = controlled;
        return;
      }
      if (!applyingUpdate || reloadRequested) return;
      reloadRequested = true;
      const count = Number(sessionStorage.getItem('upgrade-fixture-reload-count') || 0) + 1;
      sessionStorage.setItem('upgrade-fixture-reload-count', String(count));
      trace('controller.reload', { count });
      window.location.reload();
    });
    registration = await navigator.serviceWorker.register('./sw.js');
    const observed = new WeakSet();
    function observeInstalling() {
      const installing = registration.installing;
      if (!installing || observed.has(installing)) return;
      observed.add(installing);
      installing.addEventListener('statechange', () => {
        trace('worker.state', { state: installing.state });
        if (installing.state === 'installed') showWaitingUpdate();
      });
    }
    registration.addEventListener('updatefound', observeInstalling);
    observeInstalling();
    showWaitingUpdate();
    window.upgradeFixture.initialized = true;
    trace('bootstrap.initialized');
  </script>
</body>
</html>
`;
    await fs.writeFile(path.join(directory, 'index.html'), fixture, 'utf8');
}

async function createReleases() {
    const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'gym-pwa-upgrade-'));
    try {
        const releaseADirectory = path.join(temporaryDirectory, 'release-a');
        const releaseBDirectory = path.join(temporaryDirectory, 'release-b');
        await copyRelease(releaseADirectory);
        execFileSync(process.execPath, [path.join(releaseADirectory, 'update-version.cjs'), '2.7.0'], {
            cwd: releaseADirectory,
            stdio: 'pipe',
            timeout: 20_000,
            windowsHide: true,
        });
        await writeUpgradeFixture(releaseADirectory, RELEASE_A);
        execFileSync(process.execPath, [path.join(releaseADirectory, 'scripts', 'release-integrity.mjs'), '--write'], {
            cwd: releaseADirectory,
            stdio: 'pipe',
            timeout: 20_000,
            windowsHide: true,
        });
        await fs.cp(releaseADirectory, releaseBDirectory, { recursive: true });
        execFileSync(process.execPath, [path.join(releaseBDirectory, 'update-version.cjs'), RELEASE_B_VERSION], {
            cwd: releaseBDirectory,
            stdio: 'pipe',
            timeout: 20_000,
            windowsHide: true,
        });
        await writeUpgradeFixture(releaseBDirectory, RELEASE_B);
        execFileSync(process.execPath, [path.join(releaseBDirectory, 'scripts', 'release-integrity.mjs'), '--write'], {
            cwd: releaseBDirectory,
            stdio: 'pipe',
            timeout: 20_000,
            windowsHide: true,
        });
        return { temporaryDirectory, releaseADirectory, releaseBDirectory };
    } catch (error) {
        await removeOwnedTemp(temporaryDirectory, 'gym-pwa-upgrade-');
        throw error;
    }
}

function contentType(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    return (
        {
            '.css': 'text/css; charset=utf-8',
            '.html': 'text/html; charset=utf-8',
            '.ico': 'image/x-icon',
            '.js': 'application/javascript; charset=utf-8',
            '.json': 'application/json; charset=utf-8',
            '.png': 'image/png',
        }[extension] || 'application/octet-stream'
    );
}

async function createSwitchingServer(initialRoot) {
    let activeRoot = initialRoot;
    let online = true;
    const server = createServer(async (request, response) => {
        if (!online) { response.destroy(); return; }
        try {
            const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
            if (requestUrl.pathname === '/smoke-connectivity') {
                response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain' });
                response.end('online');
                return;
            }
            const relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '') || 'index.html';
            const filePath = path.resolve(activeRoot, relativePath);
            if (!filePath.startsWith(`${path.resolve(activeRoot)}${path.sep}`)) {
                response.writeHead(403);
                response.end('Forbidden');
                return;
            }

            const body = await fs.readFile(filePath);
            response.writeHead(200, {
                'Cache-Control': 'no-store, no-cache, must-revalidate',
                'CDN-Cache-Control': 'no-store',
                'Content-Type': contentType(filePath),
                'Service-Worker-Allowed': '/',
            });
            response.end(body);
        } catch (error) {
            response.writeHead(error.code === 'ENOENT' ? 404 : 500);
            response.end(error.code === 'ENOENT' ? 'Not Found' : 'Internal Server Error');
        }
    });

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    return {
        server,
        url: `http://127.0.0.1:${address.port}/`,
        setRoot(nextRoot) {
            activeRoot = nextRoot;
        },
        setOnline(value) { online = value; },
    };
}

async function removeOwnedTemp(directory, prefix) {
    const resolved = path.resolve(directory);
    if (!resolved.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`) || !path.basename(resolved).startsWith(prefix)) {
        throw new Error(`Refusing unexpected temporary cleanup path: ${resolved}`);
    }
    await fs.rm(resolved, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
}

async function openChrome(url, userDataDirectory, onEvent, signal) {
    const chromePath = await resolveChromePath();
    const args = [
        '--headless=new', '--disable-gpu', '--use-angle=swiftshader',
        '--disable-gpu-compositing', '--disable-dev-shm-usage', '--disable-extensions',
        '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
        '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
        `--user-data-dir=${userDataDirectory}`, '--window-size=1440,900', 'about:blank',
    ];
    const owner = spawnOwnedBrowser(chromePath, args, { afterClose: () => removeOwnedTemp(userDataDirectory, 'gym-pwa-chrome-profile-') });
    const diagnostics = captureBrowserDiagnostics(owner, { kind: 'chromium', executable: chromePath, args, onEvent });
    try {
        const connection = await connectOwnedChromium(owner, userDataDirectory, url, onEvent, signal);
        const expected = process.env.CHROME_EXPECTED_VERSION;
        if (expected && connection.version.product.split('/').pop() !== expected) {
            throw new Error(`Browser version mismatch: expected ${expected}, got ${connection.version.product}`);
        }
        return { owner, ...connection, diagnostics };
    } catch (error) {
        try { await owner.close(); }
        catch (cleanupError) { error.browserCleanupError = cleanupError.message; }
        throw diagnostics.failure(error);
    }
}

async function waitFor(client, predicate, signal, timeout = 20_000) {
    const deadline = Date.now() + timeout;
    let lastError;
    while (Date.now() < deadline) {
        signal.throwIfAborted();
        try {
            const value = await client.evaluate(`(${predicate.toString()})()`);
            if (value) return value;
        } catch (error) {
            lastError = error;
        }
        await sleep(250);
    }
    throw new Error(
        `Timed out waiting for browser condition ${predicate.name || 'anonymous'}${lastError ? `: ${lastError.message}` : ''}`
    );
}

async function pageState(client) {
    return client.evaluate(`(async () => {
        const metadata = await fetch('./release.json', { cache: 'no-store' }).then((response) => response.json());
        const registration = await navigator.serviceWorker.getRegistration();
        const progressResponse = await fetch('./js/progress.js', { cache: 'no-store' });
        const progressBytes = new Uint8Array(await progressResponse.arrayBuffer());
        const progressText = new TextDecoder().decode(progressBytes).replace(/\\r\\n?/g, '\\n');
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(progressText));
        const progressHash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
        return {
            revision: document.querySelector('meta[name="gym-release-revision"]')?.content,
            displayedVersion: document.getElementById('app-version-info')?.textContent,
         controller: navigator.serviceWorker.controller?.scriptURL || null,
         cacheNames: await caches.keys(),
         session: localStorage.getItem('${SESSION_KEY}'),
         updateMessageSeen: sessionStorage.getItem('${UPDATE_MESSAGE_KEY}') === 'true',
         status: document.getElementById('status')?.textContent || null,
         statusRole: document.getElementById('status')?.getAttribute('role'),
         statusLive: document.getElementById('status')?.getAttribute('aria-live'),
         labelFor: document.querySelector('label')?.htmlFor,
         initialized: window.upgradeFixture?.initialized === true,
         controllerIsActive: navigator.serviceWorker.controller === registration?.active,
         activeState: registration?.active?.state || null,
         waitingState: registration?.waiting?.state || null,
         installingState: registration?.installing?.state || null,
         workoutValue: document.getElementById('workout')?.value,
         backupSession: localStorage.getItem('gym-tracker-backup-session'),
         fixtureReloadCount: Number(sessionStorage.getItem('upgrade-fixture-reload-count') || 0),
         lifecycleTrace: JSON.parse(sessionStorage.getItem('upgrade-fixture-trace') || '[]'),
         metadata,
            progressHash
        };
    })()`);
}

async function captureScreenshot(client, filePath, width, height, mobile) {
    await client.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile,
    });
    const screenshot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await fs.writeFile(filePath, Buffer.from(screenshot.data, 'base64'));
}

function assertReleaseState(state, revision, metadata, session, updated = false) {
    assert.equal(state.revision, revision, 'Document shell revision differs from expected release');
    assert.deepEqual(state.metadata, metadata, 'Served release manifest differs from the built target');
    assert.equal(state.progressHash, metadata.assets['js/progress.js'], 'Progress module hash differs from target release');
    assert.equal(state.initialized, true, 'Fixture bootstrap/listeners are not initialized');
    assert.equal(state.statusRole, 'status');
    assert.equal(state.statusLive, 'polite');
    assert.equal(state.labelFor, 'workout');
    assert.equal(state.activeState, 'activated');
    assert.equal(state.controllerIsActive, true, 'Page is not controlled by the active worker');
    assert.equal(state.session, session, 'In-progress workout differs from the exact saved session');
    assert.equal(state.workoutValue, session, 'Reloaded workout field differs from the exact saved session');
    assert.ok(state.cacheNames.includes(`gym-tracker-${revision}`), 'Expected release cache is absent');
    if (updated) {
        assert.equal(state.updateMessageSeen, true, 'Accessible update-available messaging was not shown');
        assert.equal(state.backupSession, session, 'Activation backup differs from the exact saved session');
        assert.equal(state.fixtureReloadCount, 1, 'The update must trigger exactly one controllerchange reload');
        assert.ok(!state.cacheNames.includes(`gym-tracker-${RELEASE_A}`), 'Obsolete release cache remained after activation');
    }
}

async function clickApplyUpdate(client) {
    const point = await client.evaluate(`(() => {
        const button = document.getElementById('apply-update');
        if (!button || button.hidden || button.disabled) throw new Error('Update action is unavailable');
        const rect = button.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`);
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
}

export async function runUpgradeSmoke({
    openBrowser = openChrome, browserName = 'Chromium', networkMode = 'CDP offline emulation',
    setOffline = (browser, _server, offline) => browser.client.send('Network.emulateNetworkConditions',
        { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }),
} = {}) {
    if (!Number.isInteger(BOOTSTRAP_DELAY_MS) || BOOTSTRAP_DELAY_MS < 0 || BOOTSTRAP_DELAY_MS > 10_000) {
        throw new Error('UPGRADE_SMOKE_BOOTSTRAP_DELAY_MS must be an integer from 0 to 10000');
    }
    if (!['', 'corrupt-session'].includes(NEGATIVE_CASE)) throw new Error('Unknown UPGRADE_SMOKE_NEGATIVE_CASE');
    await fs.mkdir(evidenceDirectory, { recursive: true });
    const evidence = {
        status: 'running', startedAt: new Date().toISOString(), browser: browserName,
        nodeVersion: process.version, platform: process.platform, syntheticDataOnly: true, networkMode,
        releaseA: RELEASE_A, releaseB: RELEASE_B, bootstrapDelayMs: BOOTSTRAP_DELAY_MS,
        checkoutSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
        negativeCase: NEGATIVE_CASE || null, stages: [], console: [], exceptions: [], network: [], serviceWorkerEvents: [],
    };
    const trace = [];
    const onEvent = event => {
        trace.push({ receivedAt: new Date().toISOString(), ...event });
        if (event.method === 'Runtime.consoleAPICalled') evidence.console.push(event.params);
        if (event.method === 'Runtime.exceptionThrown') evidence.exceptions.push(event.params);
        if (event.method === 'Network.responseReceived' && /manifest|release|sw\.js|progress\.js/.test(event.params.response.url)) {
            evidence.network.push({ url: event.params.response.url, status: event.params.response.status,
                headers: event.params.response.headers, fromServiceWorker: event.params.response.fromServiceWorker || false });
        }
        if (event.method.startsWith('ServiceWorker.')) evidence.serviceWorkerEvents.push(event);
        if (event.method === 'log.entryAdded') evidence.console.push(event.params);
        if (event.method === 'network.responseCompleted') evidence.network.push(event.params);
    };
    const stage = name => {
        evidence.stage = name;
        evidence.stages.push({ name, at: new Date().toISOString() });
        console.log(`[browser-upgrade-smoke] ${name}`);
    };
    await fs.writeFile(path.join(evidenceDirectory, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    let releases;
    let browserProfile;
    let server;
    let browser;
    let failure;
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(new Error('Upgrade smoke exceeded its 90-second deadline')), 90_000);
    deadline.unref();
    try {
        stage('build-isolated-releases');
        releases = await createReleases();
        const metadataA = JSON.parse(await fs.readFile(path.join(releases.releaseADirectory, 'release.json'), 'utf8'));
        const metadataB = JSON.parse(await fs.readFile(path.join(releases.releaseBDirectory, 'release.json'), 'utf8'));
        browserProfile = await fs.mkdtemp(path.join(os.tmpdir(), 'gym-pwa-chrome-profile-'));
        server = await createSwitchingServer(releases.releaseADirectory);
        browser = await openBrowser(server.url, browserProfile, onEvent, controller.signal);
        evidence.browserVersion = await browser.client.send('Browser.getVersion');
        evidence.ownedDebugPort = browser.port;
        if (browser.targetId) evidence.ownedTarget = { targetId: browser.targetId, sessionId: browser.sessionId };
        stage('wait-for-initialized-active-controlled-A');
        await waitFor(browser.client, async function initializedReleaseA() {
            const registration = await navigator.serviceWorker.getRegistration();
            return window.upgradeFixture?.initialized === true && registration?.active?.state === 'activated'
                && navigator.serviceWorker.controller === registration.active && !registration.installing && !registration.waiting
                && document.querySelector('meta[name="gym-release-revision"]')?.content === 'v2.7.0';
        }, controller.signal);
        const workout = {
            routineId: 'upgrade-fixture-routine',
            data: { ejercicios: [{ nombreEjercicio: 'Bench Press', series: [{ peso: '60', reps: '8' }, { peso: '62,5', reps: '6' }] }],
                notas: 'Preserve every original field', pesoUsuario: '75,4' },
            timestamp: Date.now(),
        };
        const savedSession = JSON.stringify(workout);
        await browser.client.evaluate(`(() => {
            const field = document.getElementById('workout');
            field.value = ${JSON.stringify(savedSession)};
            field.dispatchEvent(new Event('input', { bubbles: true }));
        })()`);
        evidence.beforeUpdate = await pageState(browser.client);
        assertReleaseState(evidence.beforeUpdate, RELEASE_A, metadataA, savedSession);
        assert.equal(evidence.beforeUpdate.fixtureReloadCount, 0, 'Initial A claim must not force a reload');
        stage('switch-server-and-request-B-update');
        server.setRoot(releases.releaseBDirectory);
        await browser.client.evaluate('navigator.serviceWorker.getRegistration().then(registration => registration.update())');
        stage('wait-for-installed-waiting-B-and-update-UI');
        await waitFor(browser.client, async function waitingReleaseB() {
            const registration = await navigator.serviceWorker.getRegistration();
            const button = document.getElementById('apply-update');
            return window.upgradeFixture?.initialized && window.upgradeFixture?.waitingReady
                && document.querySelector('meta[name="gym-release-revision"]')?.content === 'v2.7.0'
                && registration?.waiting?.state === 'installed' && registration.active?.state === 'activated'
                && navigator.serviceWorker.controller === registration.active && !registration.installing
                && button && !button.hidden && !button.disabled;
        }, controller.signal);
        evidence.waitingUpdate = await pageState(browser.client);
        await captureScreenshot(browser.client, path.join(evidenceDirectory, 'update-available.png'), 1440, 900, false);
        stage('click-explicit-update-action');
        await clickApplyUpdate(browser.client);
        stage('wait-for-fixture-reload-and-initialized-controlled-B');
        await waitFor(browser.client, async function initializedReleaseB() {
            const registration = await navigator.serviceWorker.getRegistration();
            return window.upgradeFixture?.initialized && document.querySelector('meta[name="gym-release-revision"]')?.content === 'v2.7.1'
                && registration?.active?.state === 'activated' && navigator.serviceWorker.controller === registration.active
                && !registration.waiting && !registration.installing;
        }, controller.signal);
        if (NEGATIVE_CASE === 'corrupt-session') {
            await browser.client.evaluate(`localStorage.setItem('${SESSION_KEY}', '{"corrupted":true}')`);
        }
        evidence.afterUpdate = await pageState(browser.client);
        assertReleaseState(evidence.afterUpdate, RELEASE_B, metadataB, savedSession, true);
        const lifecycle = evidence.afterUpdate.lifecycleTrace;
        assert.equal(lifecycle.filter(event => event.type === 'update.clicked' && event.trusted).length, 1);
        assert.equal(lifecycle.filter(event => event.type === 'controller.reload').length, 1);
        for (const revision of [RELEASE_A, RELEASE_B]) {
            const started = lifecycle.find(event => event.revision === revision && event.type === 'bootstrap.started');
            const initialized = lifecycle.find(event => event.revision === revision && event.type === 'bootstrap.initialized');
            assert.ok(started && initialized && initialized.time - started.time >= BOOTSTRAP_DELAY_MS,
                `Release ${revision} did not complete the requested bootstrap barrier`);
        }
        stage('offline-restart');
        await setOffline(browser, server, true);
        // This is the deliberate offline restart, after B has already passed all update assertions.
        await browser.client.send('Page.reload', { ignoreCache: false });
        await waitFor(browser.client, async function offlineReleaseB() {
            return window.upgradeFixture?.initialized && document.querySelector('meta[name="gym-release-revision"]')?.content === 'v2.7.1';
        }, controller.signal);
        evidence.offlineProbe = await browser.client.evaluate(`fetch('./smoke-connectivity?probe=' + Date.now(), { cache: 'no-store' })
            .then(() => ({ rejected: false }), error => ({ rejected: true, error: error.message }))`);
        assert.equal(evidence.offlineProbe.rejected, true, 'An uncached network request succeeded during the outage');
        evidence.offlineRestart = await pageState(browser.client);
        assertReleaseState(evidence.offlineRestart, RELEASE_B, metadataB, savedSession, true);
        stage('online-recovery');
        await setOffline(browser, server, false);
        evidence.onlineProbe = await browser.client.evaluate(`fetch('./smoke-connectivity?probe=' + Date.now(), { cache: 'no-store' }).then(response => response.text())`);
        assert.equal(evidence.onlineProbe, 'online', 'Network did not recover');
        evidence.onlineRecovery = await pageState(browser.client);
        assertReleaseState(evidence.onlineRecovery, RELEASE_B, metadataB, savedSession, true);
        await captureScreenshot(browser.client, path.join(evidenceDirectory, 'desktop.png'), 1440, 900, false);
        await captureScreenshot(browser.client, path.join(evidenceDirectory, 'mobile.png'), 390, 844, true);
        stage('close-owned-browser-and-server');
    } catch (error) {
        failure = error;
        evidence.error = error.stack || error.message;
        if (error.browserDiagnostics) evidence.browserProcess = error.browserDiagnostics;
        if (error.browserCleanupError) evidence.cleanupError = error.browserCleanupError;
        if (browser) {
            try { evidence.failureState = await pageState(browser.client); }
            catch (captureError) { evidence.failureStateError = captureError.message; }
            try { await captureScreenshot(browser.client, path.join(evidenceDirectory, 'failure.png'), 1440, 900, false); }
            catch (captureError) { evidence.failureScreenshotError = captureError.message; }
        }
    } finally {
        try {
            if (browser) await browser.owner.close();
            else if (browserProfile) await removeOwnedTemp(browserProfile, 'gym-pwa-chrome-profile-');
        } catch (error) {
            failure ||= error;
            evidence.cleanupError = error.message;
        }
        try {
            if (server) {
                server.server.closeAllConnections();
                await new Promise(resolve => server.server.close(resolve));
            }
            if (releases) await removeOwnedTemp(releases.temporaryDirectory, 'gym-pwa-upgrade-');
        } catch (error) {
            failure ||= error;
            evidence.cleanupError = [evidence.cleanupError, error.message].filter(Boolean).join('; ');
        }
        clearTimeout(deadline);
        if (controller.signal.aborted) {
            failure ||= controller.signal.reason;
            evidence.deadlineError = controller.signal.reason.message;
        }
        if (browser?.diagnostics) evidence.browserProcess = browser.diagnostics.snapshot();
        evidence.status = failure ? 'failed' : 'passed';
        evidence.completedAt = new Date().toISOString();
        await fs.writeFile(path.join(evidenceDirectory, 'trace.json'), `${JSON.stringify(trace, null, 2)}\n`);
        await fs.writeFile(path.join(evidenceDirectory, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    }
    if (failure) throw failure;
    console.log(`[browser-upgrade-smoke] ${browserName} release upgrade passed; artifacts: ${evidenceDirectory}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    runUpgradeSmoke().catch(error => {
        console.error(`[browser-upgrade-smoke] ${error.stack || error.message}; artifacts: ${evidenceDirectory}`);
        process.exitCode = 1;
    });
}
