#!/usr/bin/env node

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIREFOX_PATH = process.env.FIREFOX_PATH || 'C:\\Users\\Fran\\AppData\\Local\\ms-playwright\\firefox-1490\\firefox\\firefox.exe';
const FIREFOX_DEBUG_PORT = Number(process.env.FIREFOX_DEBUG_PORT || 9335);
const SESSION_KEY = 'gymTracker_inProgressSession';
const RELEASE_A = 'v2.7.0';
const RELEASE_B = 'v2.7.1';
const RELEASE_B_VERSION = '2.7.1';
const EVIDENCE_DIRECTORY = path.join(ROOT, 'Validation Evidence');

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function copyRelease(targetDirectory) {
    await fs.mkdir(targetDirectory, { recursive: true });
    for (const entry of ['assets', 'css', 'js', 'index.html', 'manifest.json', 'release.json', 'sw.js', 'scripts', 'update-version.cjs']) {
        await fs.cp(path.join(ROOT, entry), path.join(targetDirectory, entry), { recursive: true });
    }
}

async function writeUpgradeFixture(directory, revision) {
    const fixture = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="gym-release-revision" content="${revision}">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Gym release upgrade fixture</title>
<style>body{font:16px system-ui,sans-serif;max-width:42rem;margin:2rem auto;padding:0 1rem}#status{padding:.75rem;border:1px solid #999}label{display:block;margin-top:1rem}textarea{width:100%;min-height:7rem}</style></head>
<body><main><h1>Gym release upgrade</h1><p id="status" role="status" aria-live="polite">Release ${revision}</p>
<label for="workout">In-progress workout</label><textarea id="workout" aria-describedby="status"></textarea></main>
<script>
const sessionKey='${SESSION_KEY}', backupKey='gym-tracker-backup-session', hadController=Boolean(navigator.serviceWorker.controller), workout=document.getElementById('workout');
workout.value=localStorage.getItem(sessionKey)||''; workout.addEventListener('input',()=>localStorage.setItem(sessionKey,workout.value));
function preserveSession(){const current=localStorage.getItem(sessionKey);if(current)localStorage.setItem(backupKey,current)}
function activateWaiting(registration){if(!registration.waiting)return;preserveSession();document.getElementById('status').textContent='Update available; preserving workout and activating safely';registration.waiting.postMessage({type:'SKIP_WAITING'});if(hadController)setTimeout(()=>{if(navigator.serviceWorker.controller)window.location.reload()},2000)}
navigator.serviceWorker.addEventListener('controllerchange',()=>{if(hadController)window.location.reload()});
navigator.serviceWorker.register('./sw.js').then(registration=>{registration.addEventListener('updatefound',()=>{const installing=registration.installing;installing?.addEventListener('statechange',()=>{if(installing.state==='installed')activateWaiting(registration)})});if(registration.waiting)activateWaiting(registration)});
</script></body></html>`;
    await fs.writeFile(path.join(directory, 'index.html'), fixture, 'utf8');
}

async function createReleases() {
    const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'gym-pwa-firefox-'));
    const releaseADirectory = path.join(temporaryDirectory, 'release-a');
    const releaseBDirectory = path.join(temporaryDirectory, 'release-b');
    await copyRelease(releaseADirectory);
    await writeUpgradeFixture(releaseADirectory, RELEASE_A);
    await fs.cp(releaseADirectory, releaseBDirectory, { recursive: true });
    const releaseIntegrity = path.join(releaseADirectory, 'scripts', 'release-integrity.mjs');
    const updateVersion = path.join(releaseBDirectory, 'update-version.cjs');
    const run = (file, args, cwd) => new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [file, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';
        child.stderr.on('data', (data) => { stderr += String(data); });
        child.once('error', reject);
        child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(stderr || `Child exited ${code}`)));
    });
    await run(releaseIntegrity, ['--write'], releaseADirectory);
    await run(updateVersion, [RELEASE_B_VERSION], releaseBDirectory);
    await writeUpgradeFixture(releaseBDirectory, RELEASE_B);
    await run(path.join(releaseBDirectory, 'scripts', 'release-integrity.mjs'), ['--write'], releaseBDirectory);
    return { temporaryDirectory, releaseADirectory, releaseBDirectory };
}

function contentType(filePath) {
    return {
        '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.ico': 'image/x-icon',
        '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png'
    }[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

async function createSwitchingServer(initialRoot) {
    let activeRoot = initialRoot;
    let online = true;
    const server = createServer(async (request, response) => {
        if (!online) { response.destroy(); return; }
        try {
            const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
            const relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '') || 'index.html';
            const filePath = path.resolve(activeRoot, relativePath);
            if (!filePath.startsWith(`${path.resolve(activeRoot)}${path.sep}`)) { response.writeHead(403); response.end('Forbidden'); return; }
            const body = await fs.readFile(filePath);
            response.writeHead(200, { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'CDN-Cache-Control': 'no-store', 'Content-Type': contentType(filePath), 'Service-Worker-Allowed': '/' });
            response.end(body);
        } catch (error) { response.writeHead(error.code === 'ENOENT' ? 404 : 500); response.end(error.code === 'ENOENT' ? 'Not Found' : 'Internal Server Error'); }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    return { server, url: `http://127.0.0.1:${address.port}/`, setRoot: (root) => { activeRoot = root; }, setOnline: (value) => { online = value; } };
}

function remoteValue(value) {
    if (!value || value.type === 'null') return null;
    if (value.type === 'array') return value.value.map(remoteValue);
    if (value.type === 'object') return Array.isArray(value.value) ? Object.fromEntries(value.value.map(([key, entry]) => [key, remoteValue(entry)])) : null;
    return value.value;
}

class BidiClient {
    constructor(url) {
        this.nextId = 1;
        this.pending = new Map();
        this.events = [];
        this.socket = new WebSocket(url);
        this.socket.on('message', (data) => {
            const message = JSON.parse(String(data));
            if (process.env.FIREFOX_DEBUG) console.error(`[browser-upgrade-smoke-firefox] BiDi ${JSON.stringify(message).slice(0, 1200)}`);
            if (message.id && this.pending.has(message.id)) {
                const pending = this.pending.get(message.id);
                this.pending.delete(message.id);
                if (message.error) pending.reject(new Error(message.error.message || message.error));
                else pending.resolve(message.result || {});
            } else if (message.method) this.events.push(message);
        });
        this.openPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Firefox BiDi WebSocket did not open')), 10_000);
            this.socket.once('open', () => { clearTimeout(timeout); resolve(); });
            this.socket.once('error', reject);
        });
    }

    async send(method, params = {}) {
        await this.openPromise;
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error(`BiDi command timed out: ${method}`)); }, 10_000);
            this.pending.set(id, { resolve: (value) => { clearTimeout(timeout); resolve(value); }, reject: (error) => { clearTimeout(timeout); reject(error); } });
            this.socket.send(JSON.stringify({ id, method, params }));
        });
    }

    async evaluate(context, expression) {
        const result = await this.send('script.evaluate', { expression, target: { context }, awaitPromise: true, userActivation: true });
        return remoteValue(result.result);
    }

    close() { this.socket.close(); }
}

async function openFirefox(url, profileDirectory) {
    const firefox = spawn(FIREFOX_PATH, ['-headless', '--no-remote', `--remote-debugging-port=${FIREFOX_DEBUG_PORT}`, '-profile', profileDirectory, url], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let bidiUrl;
    firefox.stderr.on('data', (data) => { stderr += String(data); const endpoint = stderr.match(/WebDriver BiDi listening on (ws:\/\/\S+)/)?.[1]; bidiUrl ||= endpoint ? `${endpoint}/session` : undefined; });
    for (let attempt = 0; attempt < 60 && !bidiUrl; attempt += 1) await sleep(100);
    if (!bidiUrl) { firefox.kill(); throw new Error(`Firefox BiDi endpoint did not start: ${stderr}`); }
    const client = new BidiClient(bidiUrl);
    console.log('[browser-upgrade-smoke-firefox] BiDi connected');
    await client.send('session.new', { capabilities: { alwaysMatch: {} } });
    console.log('[browser-upgrade-smoke-firefox] session created');
    const tree = await client.send('browsingContext.getTree');
    const context = tree.contexts?.[0]?.context;
    if (!context) throw new Error('Firefox did not expose its initial browsing context');
    console.log('[browser-upgrade-smoke-firefox] initial context acquired');
    try { await client.send('session.subscribe', { events: ['log.entryAdded', 'network.responseCompleted', 'browsingContext.domContentLoaded', 'browsingContext.load'], contexts: [context] }); } catch { /* Firefox versions may expose a smaller event set. */ }
    await client.send('browsingContext.navigate', { context, url, wait: 'complete' });
    console.log('[browser-upgrade-smoke-firefox] page loaded');
    return { firefox, client, context };
}

async function evaluateJson(browser, expression) {
    return JSON.parse(await browser.client.evaluate(browser.context, `(async()=>JSON.stringify(await (${expression})))()`));
}

async function waitFor(browser, expression, timeout = 20_000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        try { const result = await evaluateJson(browser, `(${expression})()`); if (result) return result; } catch { /* page may be navigating */ }
        await sleep(250);
    }
    throw new Error(`Timed out waiting for Firefox condition: ${expression}`);
}

async function pageState(browser) {
    return evaluateJson(browser, `(async()=>{const metadata=await fetch('./release.json',{cache:'no-store'}).then(r=>r.json());const bytes=new Uint8Array(await fetch('./js/progress.js',{cache:'no-store'}).then(r=>r.arrayBuffer()));const digest=await crypto.subtle.digest('SHA-256',bytes);return {revision:document.querySelector('meta[name="gym-release-revision"]')?.content,controller:navigator.serviceWorker.controller?.scriptURL||null,activeWorker:(await navigator.serviceWorker.getRegistration())?.active?.state||null,cacheNames:await caches.keys(),session:localStorage.getItem('${SESSION_KEY}'),metadata,progressHash:Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join(''),statusRole:document.getElementById('status')?.getAttribute('role'),statusLive:document.getElementById('status')?.getAttribute('aria-live'),labelFor:document.querySelector('label')?.htmlFor}})()`);
}

async function captureScreenshot(browser, filePath) {
    const result = await browser.client.send('browsingContext.captureScreenshot', { context: browser.context, origin: 'viewport' });
    await fs.writeFile(filePath, Buffer.from(result.data, 'base64'));
}

async function run() {
    const releases = await createReleases();
    const browserProfile = await fs.mkdtemp(path.join(os.tmpdir(), 'gym-pwa-firefox-profile-'));
    let server;
    let browser;
    const evidence = { browser: 'Firefox', releaseA: RELEASE_A, releaseB: RELEASE_B, console: [], network: [], serviceWorker: [], status: 'running' };
    try {
        server = await createSwitchingServer(releases.releaseADirectory);
        browser = await openFirefox(server.url, browserProfile);
        await waitFor(browser, `async()=> (await fetch('./release.json',{cache:'no-store'}).then(r=>r.json())).revision==='${RELEASE_A}'`);
        await browser.client.send('browsingContext.reload', { context: browser.context, wait: 'complete' });
        await waitFor(browser, 'async()=>Boolean(navigator.serviceWorker.controller)');
        await browser.client.evaluate(browser.context, `localStorage.setItem('${SESSION_KEY}',${JSON.stringify(JSON.stringify({routineId:'firefox-upgrade-routine',data:{ejercicios:[{nombreEjercicio:'Bench Press',series:[{peso:'60',reps:'8'}]}]},timestamp:Date.now()}))})`);
        const beforeUpdate = await pageState(browser);
        server.setRoot(releases.releaseBDirectory);
        await browser.client.evaluate(browser.context, 'navigator.serviceWorker.ready.then(registration=>registration.update())');
        await waitFor(browser, `async()=>{const metadata=await fetch('./release.json',{cache:'no-store'}).then(r=>r.json());return metadata.revision==='${RELEASE_B}'&&(await caches.keys()).includes('gym-tracker-${RELEASE_B}')}`);
        await browser.client.send('browsingContext.reload', { context: browser.context, wait: 'complete' });
        const afterUpdate = await waitFor(browser, `async()=>{const state=await (async()=>{const metadata=await fetch('./release.json',{cache:'no-store'}).then(r=>r.json());return {revision:document.querySelector('meta[name="gym-release-revision"]')?.content,metadata,cacheNames:await caches.keys(),session:localStorage.getItem('${SESSION_KEY}')}})();return state.revision==='${RELEASE_B}'&&state.metadata.revision==='${RELEASE_B}'&&state.cacheNames.includes('gym-tracker-${RELEASE_B}')&&state.session?state:null}`);
        server.setOnline(false);
        await browser.client.send('browsingContext.reload', { context: browser.context, wait: 'complete' });
        const offlineState = await waitFor(browser, `async()=>{const state=await (async()=>{const metadata=await fetch('./release.json',{cache:'no-store'}).then(r=>r.json());return {revision:document.querySelector('meta[name="gym-release-revision"]')?.content,metadata,session:localStorage.getItem('${SESSION_KEY}')}})();return state.revision==='${RELEASE_B}'&&state.metadata.revision==='${RELEASE_B}'&&state.session?state:null}`);
        server.setOnline(true);
        const completeState = await pageState(browser);
        if (completeState.progressHash !== completeState.metadata.assets['js/progress.js']) throw new Error('Firefox Progress hash disagrees with release.json');
        if (!completeState.session || JSON.parse(completeState.session).data.ejercicios[0].nombreEjercicio !== 'Bench Press') throw new Error('Firefox did not preserve the in-progress workout');
        if (completeState.cacheNames.includes('gym-tracker-v2.7.0')) throw new Error('Firefox retained the obsolete release cache');
        if (completeState.statusRole !== 'status' || completeState.statusLive !== 'polite' || completeState.labelFor !== 'workout') throw new Error('Firefox update fixture accessibility contract failed');
        await fs.mkdir(EVIDENCE_DIRECTORY, { recursive: true });
        await captureScreenshot(browser, path.join(EVIDENCE_DIRECTORY, '2026-07-22-gym-pwa-upgrade-firefox.png'));
        evidence.beforeUpdate = beforeUpdate;
        evidence.afterUpdate = completeState;
        evidence.offlineRestart = offlineState;
        evidence.console = browser.client.events.filter((event) => event.method === 'log.entryAdded');
        evidence.network = browser.client.events.filter((event) => event.method === 'network.responseCompleted' && /manifest|release|sw\.js|progress\.js|index\.html/.test(event.params?.request?.url || ''));
        evidence.serviceWorker = [{ controller: completeState.controller, activeState: completeState.activeWorker, caches: completeState.cacheNames }];
        evidence.status = 'passed';
        await fs.writeFile(path.join(EVIDENCE_DIRECTORY, '2026-07-22-gym-pwa-upgrade-firefox.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
        console.log('[browser-upgrade-smoke-firefox] Firefox release upgrade passed');
    } finally {
        if (browser) { browser.client.close(); browser.firefox.kill(); }
        if (server) await new Promise((resolve) => server.server.close(resolve));
        await fs.rm(releases.temporaryDirectory, { recursive: true, force: true }).catch(() => {});
        await fs.rm(browserProfile, { recursive: true, force: true }).catch(() => {});
    }
}

run().catch((error) => { console.error(`[browser-upgrade-smoke-firefox] ${error.stack || error.message}`); process.exitCode = 1; });
