#!/usr/bin/env node

import { createServer } from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SESSION_KEY = 'gymTracker_inProgressSession';
const RELEASE_A = 'v2.7.0';
const RELEASE_B = 'v2.7.1';
const RELEASE_B_VERSION = '2.7.1';
const CHROME_DEBUG_PORT = Number(process.env.CHROME_DEBUG_PORT || 9271);
const evidenceDirectory = path.join(ROOT, 'Validation Evidence');

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function copyRelease(targetDirectory) {
    await fs.mkdir(targetDirectory, { recursive: true });
    const copyEntries = ['assets', 'css', 'js', 'index.html', 'manifest.json', 'release.json', 'sw.js', 'scripts', 'update-version.cjs'];
    for (const entry of copyEntries) {
        await fs.cp(path.join(ROOT, entry), path.join(targetDirectory, entry), { recursive: true });
    }
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
    <label for="workout">In-progress workout</label>
    <textarea id="workout" aria-describedby="status"></textarea>
  </main>
  <script>
    const sessionKey = '${SESSION_KEY}';
    const backupKey = 'gym-tracker-backup-session';
    const hadController = Boolean(navigator.serviceWorker.controller);
    const workout = document.getElementById('workout');
    workout.value = localStorage.getItem(sessionKey) || '';
    workout.addEventListener('input', () => localStorage.setItem(sessionKey, workout.value));
    function preserveSession() {
      const current = localStorage.getItem(sessionKey);
      if (current) localStorage.setItem(backupKey, current);
    }
    function activateWaiting(registration) {
      if (!registration.waiting) return;
      preserveSession();
      document.getElementById('status').textContent = 'Update available; preserving workout and activating safely';
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      if (hadController) {
        setTimeout(() => {
          if (navigator.serviceWorker.controller) window.location.reload();
        }, 2000);
      }
    }
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) window.location.reload();
    });
    navigator.serviceWorker.register('./sw.js').then((registration) => {
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        installing?.addEventListener('statechange', () => {
          if (installing.state === 'installed') activateWaiting(registration);
        });
      });
      if (registration.waiting) activateWaiting(registration);
    });
  </script>
</body>
</html>
`;
    await fs.writeFile(path.join(directory, 'index.html'), fixture, 'utf8');
}

async function createReleases() {
    const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'gym-pwa-upgrade-'));
    const releaseADirectory = path.join(temporaryDirectory, 'release-a');
    const releaseBDirectory = path.join(temporaryDirectory, 'release-b');
    await copyRelease(releaseADirectory);
    await writeUpgradeFixture(releaseADirectory, RELEASE_A);
    execFileSync(process.execPath, [path.join(releaseADirectory, 'scripts', 'release-integrity.mjs'), '--write'], {
        cwd: releaseADirectory,
        stdio: 'pipe'
    });
    await fs.cp(releaseADirectory, releaseBDirectory, { recursive: true });
    execFileSync(process.execPath, [path.join(releaseBDirectory, 'update-version.cjs'), RELEASE_B_VERSION], {
        cwd: releaseBDirectory,
        stdio: 'pipe'
    });
    await writeUpgradeFixture(releaseBDirectory, RELEASE_B);
    execFileSync(process.execPath, [path.join(releaseBDirectory, 'scripts', 'release-integrity.mjs'), '--write'], {
        cwd: releaseBDirectory,
        stdio: 'pipe'
    });
    return { temporaryDirectory, releaseADirectory, releaseBDirectory };
}

function contentType(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    return {
        '.css': 'text/css; charset=utf-8',
        '.html': 'text/html; charset=utf-8',
        '.ico': 'image/x-icon',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png'
    }[extension] || 'application/octet-stream';
}

async function createSwitchingServer(initialRoot) {
    let activeRoot = initialRoot;
    const server = createServer(async (request, response) => {
        try {
            const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
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
                'Service-Worker-Allowed': '/'
            });
            response.end(body);
        } catch (error) {
            response.writeHead(error.code === 'ENOENT' ? 404 : 500);
            response.end(error.code === 'ENOENT' ? 'Not Found' : 'Internal Server Error');
        }
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    return {
        server,
        url: `http://127.0.0.1:${address.port}/`,
        setRoot(nextRoot) {
            activeRoot = nextRoot;
        }
    };
}

class DevToolsClient {
    constructor(webSocketUrl) {
        this.nextId = 1;
        this.pending = new Map();
        this.events = [];
        this.socket = new WebSocket(webSocketUrl);
        this.socket.addEventListener('message', (event) => {
            const message = JSON.parse(event.data);
            if (message.id && this.pending.has(message.id)) {
                const pending = this.pending.get(message.id);
                this.pending.delete(message.id);
                if (message.error) pending.reject(new Error(message.error.message));
                else pending.resolve(message.result || {});
                return;
            }
            if (message.method) this.events.push(message);
        });
        this.openPromise = new Promise((resolve, reject) => {
            this.socket.addEventListener('open', resolve, { once: true });
            this.socket.addEventListener('error', reject, { once: true });
        });
    }

    async send(method, params = {}) {
        await this.openPromise;
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.socket.send(JSON.stringify({ id, method, params }));
        });
    }

    async evaluate(expression) {
        const result = await this.send('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true,
            userGesture: true
        });
        if (result.exceptionDetails) {
            throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
        }
        return result.result?.value;
    }

    close() {
        this.socket.close();
    }
}

async function openChrome(url, userDataDirectory) {
    const remotePort = CHROME_DEBUG_PORT;
    console.log(`[browser-upgrade-smoke] starting Chrome remote port ${remotePort}`);

    const chrome = spawn(CHROME_PATH, [
        '--headless=new',
        '--disable-gpu',
        '--in-process-gpu',
        '--disable-gpu-compositing',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--no-first-run',
        '--no-default-browser-check',
        '--remote-allow-origins=*',
        '--remote-debugging-address=127.0.0.1',
        `--remote-debugging-port=${remotePort}`,
        `--user-data-dir=${userDataDirectory}`,
        '--window-size=1440,900',
        url
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    chrome.stderr.on('data', (data) => console.error(`[browser-upgrade-smoke] Chrome: ${String(data).trim()}`));
    chrome.once('error', (error) => console.error(`[browser-upgrade-smoke] Chrome process error: ${error.message}`));
    chrome.once('exit', (code, signal) => console.log(`[browser-upgrade-smoke] Chrome exited (${code ?? 'null'}/${signal ?? 'none'})`));

    let versionResponse;
    for (let attempt = 0; attempt < 50; attempt += 1) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 500);
            versionResponse = await fetch(`http://127.0.0.1:${remotePort}/json/version`, { signal: controller.signal });
            clearTimeout(timeout);
            if (versionResponse.ok) break;
        } catch {
            // Chrome is still starting.
        }
        await sleep(100);
    }

    if (!versionResponse?.ok) {
        chrome.kill();
        throw new Error('Chrome remote debugging endpoint did not start');
    }

    let pageTarget;
    for (let attempt = 0; attempt < 50; attempt += 1) {
        const targets = await fetch(`http://127.0.0.1:${remotePort}/json/list`).then((response) => response.json());
        pageTarget = targets.find(
            (target) => target.type === 'page' && target.webSocketDebuggerUrl && target.url?.startsWith(url)
        );
        if (!pageTarget) {
            pageTarget = targets.find(
                (target) => target.type === 'page' && target.webSocketDebuggerUrl && target.url && !target.url.startsWith('chrome-extension://') && target.url !== 'about:blank'
            );
        }
        if (pageTarget) break;
        await sleep(100);
    }
    if (!pageTarget) {
        chrome.kill();
        throw new Error('Chrome page target did not start');
    }

    console.log(`[browser-upgrade-smoke] page target ${pageTarget.url}`);
    const client = new DevToolsClient(pageTarget.webSocketDebuggerUrl);
    console.log('[browser-upgrade-smoke] enabling Runtime');
    await client.send('Runtime.enable');
    console.log('[browser-upgrade-smoke] enabling Network/Log/ServiceWorker');
    await client.send('Network.enable');
    await client.send('Log.enable');
    await client.send('ServiceWorker.enable');
    await client.send('Page.setLifecycleEventsEnabled', { enabled: true });
    return { chrome, client };
}

async function waitFor(client, predicate, timeout = 20_000) {
    const deadline = Date.now() + timeout;
    let lastError;
    while (Date.now() < deadline) {
        try {
            const value = await client.evaluate(`(${predicate.toString()})()`);
            if (value) return value;
        } catch (error) {
            lastError = error;
        }
        await sleep(250);
    }
    throw new Error(`Timed out waiting for browser condition ${predicate.name || 'anonymous'}${lastError ? `: ${lastError.message}` : ''}`);
}

async function pageState(client) {
    return client.evaluate(`(async () => {
        const metadata = await fetch('./release.json', { cache: 'no-store' }).then((response) => response.json());
        const progressResponse = await fetch('./js/progress.js', { cache: 'no-store' });
        const progressBytes = new Uint8Array(await progressResponse.arrayBuffer());
        const digest = await crypto.subtle.digest('SHA-256', progressBytes);
        const progressHash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
        return {
            revision: document.querySelector('meta[name="gym-release-revision"]')?.content,
            displayedVersion: document.getElementById('app-version-info')?.textContent,
            controller: navigator.serviceWorker.controller?.scriptURL || null,
            cacheNames: await caches.keys(),
            session: localStorage.getItem('${SESSION_KEY}'),
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
        mobile
    });
    const screenshot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await fs.writeFile(filePath, Buffer.from(screenshot.data, 'base64'));
}

async function run() {
    const releases = await createReleases();
    const browserProfile = await fs.mkdtemp(path.join(os.tmpdir(), 'gym-pwa-chrome-profile-'));
    let server;
    let browser;
    const evidence = {
        browser: 'Chromium',
        releaseA: RELEASE_A,
        releaseB: RELEASE_B,
        console: [],
        exceptions: [],
        network: [],
        serviceWorkerEvents: []
    };

    try {
        server = await createSwitchingServer(releases.releaseADirectory);
        console.log(`[browser-upgrade-smoke] serving release A at ${server.url}`);
        browser = await openChrome(server.url, browserProfile);
        console.log('[browser-upgrade-smoke] Chromium connected');
        browser.client.events.push = ((originalPush) => (event) => {
            if (event.method === 'Runtime.consoleAPICalled') evidence.console.push(event.params);
            if (event.method === 'Runtime.exceptionThrown') evidence.exceptions.push(event.params);
            if (event.method === 'Network.responseReceived') {
                const responseUrl = event.params.response.url;
                if (/manifest|release|sw\.js|progress\.js/.test(responseUrl)) {
                    evidence.network.push({ url: responseUrl, status: event.params.response.status, headers: event.params.response.headers });
                }
            }
            if (event.method.startsWith('ServiceWorker.')) evidence.serviceWorkerEvents.push(event);
            return originalPush(event);
        })(browser.client.events.push.bind(browser.client.events));

        await waitFor(browser.client, async function firstReleaseReady() {
            return (await fetch('./release.json', { cache: 'no-store' }).then((response) => response.json())).revision === 'v2.7.0';
        });
        console.log('[browser-upgrade-smoke] release A loaded; reloading to establish control');
        await browser.client.send('Page.reload', { ignoreCache: false });
        await waitFor(browser.client, async function controlledByReleaseA() {
            return Boolean(navigator.serviceWorker.controller);
        });
        console.log('[browser-upgrade-smoke] release A controls the page; switching server to release B');

        const workout = {
            routineId: 'upgrade-fixture-routine',
            data: { ejercicios: [{ nombreEjercicio: 'Bench Press', series: [{ peso: '60', reps: '8' }] }] },
            timestamp: Date.now()
        };
        await browser.client.evaluate(`localStorage.setItem('${SESSION_KEY}', ${JSON.stringify(JSON.stringify(workout))})`);
        const beforeUpdate = await pageState(browser.client);

        server.setRoot(releases.releaseBDirectory);
        await browser.client.evaluate("navigator.serviceWorker.ready.then((registration) => registration.update())");
        await waitFor(browser.client, async function releaseBCacheReady() {
            const metadata = await fetch('./release.json', { cache: 'no-store' }).then((response) => response.json());
            return metadata.revision === 'v2.7.1' && (await caches.keys()).includes('gym-tracker-v2.7.1');
        });
        await browser.client.send('Page.reload', { ignoreCache: false });

        let afterUpdate;
        try {
            afterUpdate = await waitFor(browser.client, async function releaseBActivated() {
            const state = await (async () => {
                const metadata = await fetch('./release.json', { cache: 'no-store' }).then((response) => response.json());
                return {
                    revision: document.querySelector('meta[name="gym-release-revision"]')?.content,
                    controller: navigator.serviceWorker.controller?.scriptURL || null,
                    cacheNames: await caches.keys(),
                    session: localStorage.getItem('gymTracker_inProgressSession'),
                    metadata
                };
            })();
            return state.revision === 'v2.7.1' && state.metadata.revision === 'v2.7.1' && state.cacheNames.includes('gym-tracker-v2.7.1') && state.session;
            });
        } catch (error) {
            console.error('[browser-upgrade-smoke] update state:', JSON.stringify(await pageState(browser.client)));
            throw error;
        }
        console.log('[browser-upgrade-smoke] release B activated and session preserved');
        await browser.client.send('Network.emulateNetworkConditions', {
            offline: true,
            latency: 0,
            downloadThroughput: -1,
            uploadThroughput: -1
        });
        await browser.client.send('Page.reload', { ignoreCache: false });
        await waitFor(browser.client, async function offlineReleaseBReady() {
            const state = await (async () => ({
                revision: document.querySelector('meta[name="gym-release-revision"]')?.content,
                session: localStorage.getItem('gymTracker_inProgressSession'),
                metadata: await fetch('./release.json', { cache: 'no-store' }).then((response) => response.json())
            }))();
            return state.revision === 'v2.7.1' && state.metadata.revision === 'v2.7.1' && state.session;
        });
        const offlineState = await pageState(browser.client);
        await browser.client.send('Network.emulateNetworkConditions', {
            offline: false,
            latency: 0,
            downloadThroughput: -1,
            uploadThroughput: -1
        });
        const completeState = offlineState;

        if (completeState.progressHash !== completeState.metadata.assets['js/progress.js']) {
            throw new Error('Activated browser loaded a Progress module whose hash disagrees with release.json');
        }
        if (!completeState.session || JSON.parse(completeState.session).data.ejercicios[0].nombreEjercicio !== 'Bench Press') {
            throw new Error('In-progress workout was not preserved through activation and reload');
        }
        if (completeState.cacheNames.some((name) => name === 'gym-tracker-v2.7.0')) {
            throw new Error('Obsolete release cache remained after replacement activation');
        }

        await fs.mkdir(evidenceDirectory, { recursive: true });
        await captureScreenshot(browser.client, path.join(evidenceDirectory, '2026-07-22-gym-pwa-upgrade-chromium-desktop.png'), 1440, 900, false);
        await captureScreenshot(browser.client, path.join(evidenceDirectory, '2026-07-22-gym-pwa-upgrade-chromium-mobile.png'), 390, 844, true);

        evidence.beforeUpdate = beforeUpdate;
        evidence.afterUpdate = completeState;
        evidence.offlineRestart = offlineState;
        evidence.waitResult = afterUpdate;
        evidence.status = 'passed';
        await fs.writeFile(
            path.join(evidenceDirectory, '2026-07-22-gym-pwa-upgrade-chromium.json'),
            `${JSON.stringify(evidence, null, 2)}\n`,
            'utf8'
        );
        console.log('[browser-upgrade-smoke] Chromium release upgrade passed');
    } finally {
        if (browser) {
            browser.chrome.kill();
            try {
                browser.client.close();
            } catch {
                // Chrome may already have exited after the test.
            }
        }
        if (server) await new Promise((resolve) => server.server.close(resolve));
        await fs.rm(releases.temporaryDirectory, { recursive: true, force: true }).catch(() => {});
        await fs.rm(browserProfile, { recursive: true, force: true }).catch(() => {});
    }
}

run().catch(async (error) => {
    console.error(`[browser-upgrade-smoke] ${error.message}`);
    process.exitCode = 1;
});
