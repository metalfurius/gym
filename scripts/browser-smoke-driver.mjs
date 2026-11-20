import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import WebSocket from 'ws';
import { spawnOwnedBrowser } from './owned-browser-process.mjs';
import { captureBrowserDiagnostics } from './browser-process-diagnostics.mjs';

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export async function removeSmokeProfile(directory) {
    const resolved = path.resolve(directory);
    if (!resolved.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)
        || !['gym-smoke-', 'gym-pwa-chrome-profile-'].some(prefix => path.basename(resolved).startsWith(prefix))) {
        throw new Error('Unexpected smoke profile cleanup path');
    }
    await fs.rm(resolved, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
}

export async function resolveSmokeBrowser(kind) {
    const variable = kind === 'firefox' ? 'FIREFOX_PATH' : 'CHROME_PATH';
    if (process.env[variable]) {
        await fs.access(process.env[variable]);
        return process.env[variable];
    }
    const names = kind === 'firefox' ? ['firefox', 'firefox-esr'] : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
    const candidates = process.platform === 'win32'
        ? kind === 'firefox'
            ? ['C:\\Program Files\\Mozilla Firefox\\firefox.exe', 'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe']
            : ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
        : names.map(name => `/usr/bin/${name}`);
    for (const directory of (process.env.PATH || process.env.Path || '').split(path.delimiter).filter(Boolean)) {
        for (const name of names) candidates.push(path.join(directory, `${name}${process.platform === 'win32' ? '.exe' : ''}`));
    }
    for (const candidate of candidates) {
        try { await fs.access(candidate); return candidate; }
        catch { /* Try the next standard installation path. */ }
    }
    throw new Error(`${kind} executable not found; run install-smoke-browser.mjs or set ${variable}`);
}

export function decodeBidiValue(value) {
    if (!value || value.type === 'undefined') return undefined;
    if (value.type === 'null') return null;
    if (value.type === 'array') return value.value.map(decodeBidiValue);
    if (value.type === 'object') return Object.fromEntries((value.value || []).map(([key, item]) => [key, decodeBidiValue(item)]));
    return value.value;
}

class ProtocolClient {
    constructor(url, onEvent) {
        this.nextId = 1;
        this.pending = new Map();
        this.socket = new WebSocket(url);
        const rejectPending = error => {
            for (const request of this.pending.values()) request.reject(error);
            this.pending.clear();
        };
        this.socket.on('message', bytes => {
            const message = JSON.parse(String(bytes));
            if (message.id && this.pending.has(message.id)) {
                const request = this.pending.get(message.id); this.pending.delete(message.id);
                if (message.error) {
                    request.reject(new Error(typeof message.error === 'string'
                        ? `${message.error}: ${message.message || ''}` : message.error.message));
                } else request.resolve(message.result || {});
            } else if (message.method) onEvent(message);
        });
        this.socket.on('close', () => rejectPending(new Error('Browser protocol disconnected')));
        this.socket.on('error', error => rejectPending(error));
        this.openPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Browser protocol connection timed out')), 10_000);
            this.socket.once('open', () => { clearTimeout(timeout); resolve(); });
            this.socket.once('error', error => { clearTimeout(timeout); reject(error); });
            this.socket.once('close', () => { clearTimeout(timeout); reject(new Error('Browser protocol disconnected')); });
        });
    }

    async send(method, params = {}) {
        await this.openPromise;
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Browser command timed out: ${method}`)); }, 10_000);
            this.pending.set(id, {
                resolve: value => { clearTimeout(timer); resolve(value); },
                reject: error => { clearTimeout(timer); reject(error); },
            });
            try { this.socket.send(JSON.stringify({ id, method, params })); }
            catch (error) { this.pending.get(id)?.reject(error); this.pending.delete(id); }
        });
    }

    close() { this.socket.terminate(); }
}

function ownedSocket(value, port) {
    const url = new URL(value);
    if (url.protocol !== 'ws:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
        || Number(url.port) !== port || url.username || url.password) throw new Error('Browser returned an unowned protocol endpoint');
    return url.toString();
}

export async function openSmokeBrowser(kind, url, profileDirectory, onEvent = () => {}, signal = new AbortController().signal) {
    if (!['chromium', 'firefox'].includes(kind)) throw new Error('Unsupported smoke browser');
    const executable = await resolveSmokeBrowser(kind);
    const args = kind === 'firefox'
        ? ['-headless', '--no-remote', '--remote-debugging-port=0', '-profile', profileDirectory, 'about:blank']
        : ['--headless=new', '--disable-gpu', '--use-angle=swiftshader', '--disable-dev-shm-usage',
            '--disable-extensions', '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
            '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profileDirectory}`, 'about:blank'];
    if (kind === 'firefox') {
        await fs.writeFile(path.join(profileDirectory, 'user.js'), [
            'user_pref("browser.shell.checkDefaultBrowser", false);',
            'user_pref("browser.startup.homepage_override.mstone", "ignore");',
            'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
        ].join('\n'));
    }
    const owner = spawnOwnedBrowser(executable, args, { afterClose: () => removeSmokeProfile(profileDirectory) });
    const diagnostics = captureBrowserDiagnostics(owner, { kind, executable, args, onEvent });
    let startupError;
    let stderr = '';
    owner.process.once('error', error => { startupError = error; });
    owner.process.once('exit', (code, stopSignal) => { startupError ||= new Error(`Browser exited during startup (${code}/${stopSignal})`); });
    owner.process.stderr.on('data', bytes => { stderr = (stderr + String(bytes)).slice(-50_000); });
    try {
        const deadline = Date.now() + 30_000;
        let endpoint;
        let port;
        while (Date.now() < deadline) {
            signal.throwIfAborted();
            if (startupError) throw startupError;
            try {
                if (kind === 'firefox') {
                    const address = stderr.match(/WebDriver BiDi listening on (ws:\/\/[^\s]+)\s/)?.[1];
                    if (address) {
                        port = Number(new URL(address).port);
                        endpoint = ownedSocket(`${address.replace(/\/$/, '')}/session`, port);
                    }
                } else {
                    const activePort = await fs.readFile(path.join(profileDirectory, 'DevToolsActivePort'), 'utf8');
                    port = Number(activePort.split(/\r?\n/)[0]);
                    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid Chrome port');
                    const targets = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1_000) }).then(response => response.json());
                    const target = targets.find(item => item.type === 'page' && item.url === 'about:blank');
                    if (target?.webSocketDebuggerUrl) endpoint = ownedSocket(target.webSocketDebuggerUrl, port);
                }
                if (endpoint) break;
            } catch { /* Wait for this process's own endpoint. */ }
            await sleep(50);
        }
        if (!endpoint) throw new Error(`Owned ${kind} endpoint did not start: ${stderr}`);
        const raw = new ProtocolClient(endpoint, onEvent);
        let context;
        let version;
        if (kind === 'firefox') {
            owner.setClient({ send: () => raw.send('browser.close'), close: () => raw.close() });
            const session = await raw.send('session.new', { capabilities: { alwaysMatch: {} } });
            version = { product: `Firefox/${session.capabilities.browserVersion}`, capabilities: session.capabilities };
            context = (await raw.send('browsingContext.getTree')).contexts?.[0]?.context;
            if (!context) throw new Error('Firefox has no owned browsing context');
            await raw.send('session.subscribe', { events: ['log.entryAdded', 'browsingContext.load', 'browsingContext.navigationStarted', 'network.responseCompleted', 'network.fetchError'] });
        } else {
            owner.setClient({ send: () => raw.send('Browser.close'), close: () => raw.close() });
            for (const domain of ['Runtime', 'Page', 'Network', 'Log', 'ServiceWorker']) await raw.send(`${domain}.enable`);
            version = await raw.send('Browser.getVersion');
        }
        const expected = process.env[kind === 'firefox' ? 'FIREFOX_EXPECTED_VERSION' : 'CHROME_EXPECTED_VERSION'];
        if (expected && version.product.split('/').pop() !== expected) throw new Error(`Browser version mismatch: expected ${expected}, got ${version.product}`);
        const client = {
            async evaluate(expression) {
                const result = kind === 'firefox'
                    ? await raw.send('script.evaluate', { expression, target: { context }, awaitPromise: true, userActivation: true })
                    : await raw.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
                if (result.exceptionDetails || result.type === 'exception') {
                    throw new Error(result.exceptionDetails?.text || result.exceptionDetails?.exception?.description || 'Browser script failed');
                }
                return kind === 'firefox' ? decodeBidiValue(result.result) : result.result?.value;
            },
            async send(method, params = {}) {
                if (kind === 'chromium') return raw.send(method, params);
                if (method === 'Browser.getVersion') return version;
                if (method === 'Page.captureScreenshot') return raw.send('browsingContext.captureScreenshot', { context, origin: params.captureBeyondViewport ? 'document' : 'viewport' });
                if (method === 'Page.navigate') return raw.send('browsingContext.navigate', { context, url: params.url, wait: 'complete' });
                if (method === 'Page.reload') {
                    if (params.ignoreCache) throw new Error('Firefox BiDi cannot ignore the HTTP cache during reload');
                    return raw.send('browsingContext.reload', { context, wait: 'complete' });
                }
                if (method === 'Emulation.setDeviceMetricsOverride') return raw.send('browsingContext.setViewport', { context, viewport: { width: params.width, height: params.height }, devicePixelRatio: 1 });
                if (method === 'Input.dispatchMouseEvent') {
                    const actions = params.type === 'mousePressed'
                        ? [{ type: 'pointerMove', x: Math.round(params.x), y: Math.round(params.y), duration: 0 }, { type: 'pointerDown', button: 0 }]
                        : [{ type: 'pointerUp', button: 0 }];
                    return raw.send('input.performActions', { context, actions: [{ type: 'pointer', id: 'smoke-mouse', parameters: { pointerType: 'mouse' }, actions }] });
                }
                throw new Error(`No Firefox adapter for ${method}`);
            },
            close: () => raw.close(),
        };
        await client.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
        await client.send('Page.navigate', { url });
        return { owner, client, port, version };
    } catch (error) {
        try { await owner.close(); }
        catch (cleanupError) { error.browserCleanupError = cleanupError.message; }
        throw diagnostics.failure(error);
    }
}

export async function waitForSmoke(client, expression, signal, timeoutMs = 20_000) {
    const deadline = Date.now() + timeoutMs;
    let lastError;
    while (Date.now() < deadline) {
        signal.throwIfAborted();
        try { if (await client.evaluate(expression)) return; }
        catch (error) { lastError = error; }
        await sleep(100);
    }
    throw new Error(`Browser readiness timed out${lastError ? `: ${lastError.message}` : ''}`);
}
