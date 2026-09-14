#!/usr/bin/env node

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SMOKE_TARGET = process.env.PRODUCTION_SMOKE_TARGET || 'gym';
const GYM_PUBLIC_BASE_URL = 'https://codeoverdose.es/gym/';
const PORTFOLIO_PUBLIC_BASE_URL = 'https://codeoverdose.es/';
const RETRY_COUNT = Number(process.env.PRODUCTION_SMOKE_RETRY_COUNT || 12);
const RETRY_DELAY_MS = Number(process.env.PRODUCTION_SMOKE_RETRY_DELAY_MS || 5_000);
const CHALLENGE_BROWSER_TIMEOUT_MS = 45_000;
const BROWSER_COMMAND_TIMEOUT_MS = 10_000;
const FORCE_BROWSER_TRANSPORT = process.env.PRODUCTION_SMOKE_FORCE_BROWSER === '1';
const WINDOWS_CHROME_PATHS = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];
const UNIX_CHROME_PATHS = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
];
const XVFB_PATH_CANDIDATES = ['/usr/bin/xvfb-run', '/bin/xvfb-run'];
const CHROME_PATH_CANDIDATES = [
    process.env.CHROME_PATH,
    ...(process.platform === 'win32' ? WINDOWS_CHROME_PATHS : UNIX_CHROME_PATHS),
].filter(Boolean);
const CORE_ASSETS = ['', 'index.html', 'manifest.json', 'release.json', 'sw.js', 'js/progress.js'];
const PORTFOLIO_MEDIA_PATHS = [
    'assets/1.png',
    'assets/2.png',
    'assets/2048.webp',
    'assets/cc.webp',
    'assets/gym-icon.png',
    'assets/luckbound_concept.jpg',
    'assets/logo.png',
];
const REVISION_PATTERN = /const RELEASE_REVISION = ['"]([^'"]+)['"]/;
const META_PATTERN = /<meta\s+name=["']gym-release-revision["']\s+content=["']([^"']+)["']/i;
const PORTFOLIO_META_PATTERN = /<meta\s+name=["']codeoverdose:revision["']\s+content=["']([^"']+)["']/i;
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function createProductionError(layer, message) {
    const error = new Error(`[production-smoke:${layer}] ${message}`);
    error.layer = layer;
    return error;
}

function fail(layer, message) {
    throw createProductionError(layer, message);
}

function normalizeText(buffer) {
    return Buffer.from(buffer).toString('utf8').replace(/\r\n?/g, '\n');
}

function transformHtmlElements(value, tagName, transform) {
    const lowerValue = value.toLowerCase();
    const openingToken = `<${tagName}`;
    const closingToken = `</${tagName}`;
    let cursor = 0;
    let result = '';

    while (cursor < value.length) {
        const start = lowerValue.indexOf(openingToken, cursor);
        if (start === -1) return result + value.slice(cursor);

        const tagSuffix = lowerValue[start + openingToken.length];
        if (tagSuffix && tagSuffix !== '>' && !' \t\r\n\f'.includes(tagSuffix)) {
            cursor = start + openingToken.length;
            continue;
        }

        const openingEnd = lowerValue.indexOf('>', start + openingToken.length);
        if (openingEnd === -1) return result + value.slice(cursor);
        const closingStart = lowerValue.indexOf(closingToken, openingEnd + 1);
        if (closingStart === -1) return result + value.slice(cursor);
        const closingEnd = lowerValue.indexOf('>', closingStart + closingToken.length);
        if (closingEnd === -1) return result + value.slice(cursor);

        result += value.slice(cursor, start);
        result += transform(value.slice(start, closingEnd + 1));
        cursor = closingEnd + 1;
    }

    return result;
}

function stripHtmlElements(value, tagName) {
    return transformHtmlElements(value, tagName, () => '');
}

function normalizeCloudflareScripts(value) {
    return transformHtmlElements(value, 'script', element => {
        const lowerElement = element.toLowerCase();
        if (
            lowerElement.includes('/cdn-cgi/') ||
            lowerElement.includes('__cf$cv_params') ||
            lowerElement.includes('static.cloudflareinsights.com/beacon.min.js')
        ) {
            return '';
        }
        return element
            .replace(/ type="[^"]+-text\/javascript"/gi, '')
            .replace(/ type="[^"]+-module"/gi, ' type="module"')
            .replace(/ data-cf-settings="[^"]+"/gi, '');
    });
}

function normalizeCloudflareEmailSpans(value) {
    return transformHtmlElements(value, 'span', element =>
        element.toLowerCase().includes('class="__cf_email__"') ? '[email-protected]' : element
    );
}

function normalizeShellHtml(value) {
    return normalizeCloudflareScripts(normalizeCloudflareEmailSpans(stripHtmlElements(value, 'style')))
        .replace(
            /<a\s+href="https:\/\/codeoverdose\.es\/cdn-cgi\/content\?id=[^"]+"[^>]*aria-hidden="true"[^>]*><\/a>/gi,
            ''
        )
        .replace(/<link\s+rel="preconnect"\s+href="https:\/\/fonts\.googleapis\.com"\s*\/?>/gi, '')
        .replace(/<link\s+rel="preconnect"\s+href="https:\/\/fonts\.gstatic\.com"\s+crossorigin\s*\/?>/gi, '')
        .replace(/<link\s+href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]+"\s+rel="stylesheet"\s*\/?>/gi, '')
        .replace(/\[email&#160;protected\]/gi, '[email-protected]')
        .replace(
            /<a\s+href="mailto:contact@codeoverdose\.es">contact@codeoverdose\.es<\/a>/gi,
            '<a href="[cloudflare-email-protection]">[email-protected]</a>'
        )
        .replace(/\s+data-cfemail="[^"]*"/gi, '')
        .replace(/href="\/cdn-cgi\/(?:l\/)?email-protection#[^"]+"/gi, 'href="[cloudflare-email-protection]"')
        .replace(/\s+/g, ' ')
        .trim();
}

function shellDifferenceSummary(expected, actual) {
    let firstDifference = 0;
    while (firstDifference < Math.min(expected.length, actual.length)) {
        if (expected[firstDifference] !== actual[firstDifference]) break;
        firstDifference += 1;
    }
    return `normalized-lengths=${expected.length}/${actual.length}, first-difference=${firstDifference}`;
}

function sha256(buffer, relativePath) {
    const normalized = /\.(?:css|cjs|html|js|json|mjs|svg|txt)$/i.test(relativePath)
        ? Buffer.from(normalizeText(buffer), 'utf8')
        : Buffer.from(buffer);
    return crypto.createHash('sha256').update(normalized).digest('hex');
}

function normalizeBaseUrl(value) {
    const base = new URL(value);
    if (base.search || base.hash) fail('config', 'GYM_PUBLIC_BASE_URL must not contain a query or fragment');
    base.pathname = `${base.pathname.replace(/\/+$/, '')}/`;
    return base;
}

async function readLocalRelease() {
    try {
        return JSON.parse(await fs.readFile(path.join(ROOT, 'release.json'), 'utf8'));
    } catch (error) {
        fail('pages', `could not read the checked-out release.json: ${error.message}`);
    }
}

function getExpectedAssets(release) {
    if (!release || typeof release !== 'object' || !release.assets || typeof release.assets !== 'object') {
        fail('manifest', 'checked-out release.json has no asset manifest');
    }
    return [...new Set([...CORE_ASSETS, ...Object.keys(release.assets)])].sort();
}

function selectedHeaders(responseOrHeaders) {
    const headers = responseOrHeaders?.headers || responseOrHeaders;
    return Object.fromEntries(
        [
            'cache-control',
            'cdn-cache-control',
            'cf-cache-status',
            'cf-mitigated',
            'cf-ray',
            'content-type',
            'date',
            'etag',
            'age',
            'server',
            'via',
            'x-cache',
        ].map(name => [name, typeof headers?.get === 'function' ? headers.get(name) : headers?.[name] || null])
    );
}

function browserHeaders(base, relativePath) {
    const document = relativePath === '' || relativePath === 'index.html';
    const extension = path.extname(relativePath).toLowerCase();
    let accept = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8';
    let fetchDest = 'image';
    if (document) {
        accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';
        fetchDest = 'document';
    } else if (extension === '.css') {
        accept = 'text/css,*/*;q=0.1';
        fetchDest = 'style';
    } else if (extension === '.js') {
        accept = '*/*';
        fetchDest = 'script';
    } else if (extension === '.json') {
        accept = 'application/json,text/plain,*/*;q=0.8';
        fetchDest = 'empty';
    }
    const headers = {
        Accept: accept,
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        'Sec-Fetch-Dest': fetchDest,
        'Sec-Fetch-Mode': document ? 'navigate' : 'no-cors',
        'Sec-Fetch-Site': document ? 'none' : 'same-origin',
        'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    };
    if (document) headers['Sec-Fetch-User'] = '?1';
    else headers.Referer = base.toString();
    return headers;
}

class DevToolsClient {
    constructor(webSocketUrl) {
        this.nextId = 1;
        this.pending = new Map();
        this.defaultExecutionContextId = null;
        this.rejectPending = error => {
            for (const pending of this.pending.values()) pending.reject(error);
            this.pending.clear();
        };
        this.socket = new WebSocket(webSocketUrl);
        this.socket.addEventListener('message', event => {
            const message = JSON.parse(String(event.data));
            if (message.method === 'Runtime.executionContextCreated') {
                const context = message.params?.context;
                if (context?.auxData?.isDefault) this.defaultExecutionContextId = context.id;
            } else if (message.method === 'Runtime.executionContextDestroyed') {
                if (message.params?.executionContextId === this.defaultExecutionContextId) {
                    this.defaultExecutionContextId = null;
                }
            } else if (message.method === 'Runtime.executionContextsCleared') {
                this.defaultExecutionContextId = null;
            }
            if (message.id && this.pending.has(message.id)) {
                const pending = this.pending.get(message.id);
                this.pending.delete(message.id);
                if (message.error) pending.reject(new Error(message.error.message));
                else pending.resolve(message.result || {});
            }
        });
        this.socket.addEventListener('close', () => {
            this.defaultExecutionContextId = null;
            this.rejectPending(new Error('Browser CDP socket closed'));
        });
        this.socket.addEventListener('error', event => {
            const error = event instanceof Error ? event : new Error(event?.message || 'Browser CDP socket error');
            this.rejectPending(error);
        });
        this.openPromise = new Promise((resolve, reject) => {
            this.socket.addEventListener('open', resolve, { once: true });
            this.socket.addEventListener(
                'error',
                event => {
                    reject(event instanceof Error ? event : new Error(event?.message || 'Browser CDP socket error'));
                },
                { once: true }
            );
            this.socket.addEventListener('close', () => reject(new Error('Browser CDP socket closed')), { once: true });
        });
    }

    async send(method, params = {}) {
        await this.openPromise;
        if (this.socket.readyState !== WebSocket.OPEN) throw new Error('Browser CDP socket is not open');
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                const pending = this.pending.get(id);
                if (!pending) return;
                this.pending.delete(id);
                pending.reject(new Error(`CDP command timed out: ${method}`));
            }, BROWSER_COMMAND_TIMEOUT_MS);
            this.pending.set(id, {
                resolve: value => {
                    clearTimeout(timeout);
                    resolve(value);
                },
                reject: error => {
                    clearTimeout(timeout);
                    reject(error);
                },
            });
            try {
                this.socket.send(JSON.stringify({ id, method, params }));
            } catch (error) {
                const pending = this.pending.get(id);
                if (pending) {
                    this.pending.delete(id);
                    pending.reject(error);
                }
            }
        });
    }

    async evaluate(expression) {
        const result = await this.send('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true,
            userGesture: true,
        });
        if (result.exceptionDetails) {
            throw new Error(
                result.exceptionDetails.description || result.exceptionDetails.text || 'Browser evaluation failed'
            );
        }
        return result.result?.value;
    }

    async callFunction(functionDeclaration, argumentValues = []) {
        const params = {
            functionDeclaration,
            arguments: argumentValues.map(value => ({ value })),
            awaitPromise: true,
            returnByValue: true,
            userGesture: true,
        };
        let objectId;
        if (this.defaultExecutionContextId) {
            params.executionContextId = this.defaultExecutionContextId;
        } else {
            const globalObject = await this.send('Runtime.evaluate', {
                expression: 'globalThis',
                returnByValue: false,
            });
            objectId = globalObject.result?.objectId;
            if (!objectId) throw new Error('Browser global object did not become available');
            params.objectId = objectId;
        }

        const result = await this.send('Runtime.callFunctionOn', params);
        if (objectId) {
            try {
                await this.send('Runtime.releaseObject', { objectId });
            } catch {
                // The page may have navigated and released the handle already.
            }
        }
        if (result.exceptionDetails) {
            throw new Error(
                result.exceptionDetails.description || result.exceptionDetails.text || 'Browser function failed'
            );
        }
        return result.result?.value;
    }

    close() {
        this.rejectPending(new Error('Browser CDP client closed'));
        try {
            this.socket.close();
        } catch {
            // The browser may already have exited after the challenge completed.
        }
    }
}

async function resolveChromePath() {
    for (const candidate of CHROME_PATH_CANDIDATES) {
        try {
            await fs.access(candidate);
            return candidate;
        } catch {
            // Try the next runner-specific installation path.
        }
    }
    throw createProductionError(
        'cloudflare',
        `Chrome executable not found for the Cloudflare challenge fallback; tried ${CHROME_PATH_CANDIDATES.join(', ')}`
    );
}

async function resolveXvfbPath() {
    if (process.platform !== 'linux' || process.env.DISPLAY) return null;

    for (const candidate of XVFB_PATH_CANDIDATES) {
        try {
            await fs.access(candidate);
            return candidate;
        } catch {
            // Xvfb is optional outside the GitHub-hosted Linux runner.
        }
    }
    return null;
}

async function findAvailablePort() {
    const server = createServer();
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    await new Promise(resolve => server.close(resolve));
    if (!port) throw createProductionError('cloudflare', 'could not allocate a local port for the challenge browser');
    return port;
}

async function waitForChromePageTarget(remotePort, base, getProcessError) {
    const deadline = Date.now() + CHALLENGE_BROWSER_TIMEOUT_MS;
    let lastError;
    while (Date.now() < deadline) {
        const processError = getProcessError();
        if (processError) throw processError;
        try {
            const response = await fetch(`http://127.0.0.1:${remotePort}/json/list`);
            if (response.ok) {
                const targets = await response.json();
                const pageTarget = targets.find(
                    target =>
                        target.type === 'page' &&
                        target.webSocketDebuggerUrl &&
                        target.url &&
                        target.url !== 'about:blank' &&
                        !target.url.startsWith('chrome-extension://')
                );
                if (pageTarget) return pageTarget;
            }
        } catch (error) {
            lastError = error;
        }
        await sleep(250);
    }
    const detail = lastError ? `: ${lastError.message}` : '';
    throw createProductionError(
        'cloudflare',
        `the Cloudflare challenge browser did not expose a page target for ${base.toString()}${detail}`
    );
}

function revisionSelector(target) {
    return target === 'portfolio' ? 'meta[name="codeoverdose:revision"]' : 'meta[name="gym-release-revision"]';
}

const BROWSER_FETCH_FUNCTION = `async function(requestedUrl) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
        const response = await fetch(requestedUrl, {
            cache: 'no-store',
            credentials: 'same-origin',
            headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
            signal: controller.signal,
        });
        const bytes = new Uint8Array(await response.arrayBuffer());
        let binary = '';
        for (let index = 0; index < bytes.length; index += 32768) {
            binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
        }
        return {
            url: response.url,
            status: response.status,
            ok: response.ok,
            headers: Object.fromEntries(response.headers.entries()),
            body: btoa(binary),
        };
    } finally {
        clearTimeout(timeout);
    }
}`;

const BROWSER_REVISION_FUNCTION = `function(selector) {
    return {
        href: location.href,
        title: document.title,
        readyState: document.readyState,
        revision: document.querySelector(selector)?.content || null,
    };
}`;

class ChallengeBrowserSession {
    constructor({ chrome, client, profileDirectory, target, expectedRevision }) {
        this.chrome = chrome;
        this.client = client;
        this.profileDirectory = profileDirectory;
        this.target = target;
        this.expectedRevision = expectedRevision;
    }

    async waitForRevision() {
        const deadline = Date.now() + CHALLENGE_BROWSER_TIMEOUT_MS;
        const selector = revisionSelector(this.target);
        let lastState;
        let lastError;
        while (Date.now() < deadline) {
            try {
                lastState = await this.client.callFunction(BROWSER_REVISION_FUNCTION, [selector]);
                if (lastState?.revision === this.expectedRevision) return;
            } catch (error) {
                lastError = error;
            }
            await sleep(500);
        }
        const detail = lastError?.message || (lastState ? JSON.stringify(lastState) : 'no browser state');
        throw createProductionError(
            'cloudflare',
            `the Cloudflare challenge browser did not reach deployed ${this.target} revision ${this.expectedRevision} (${detail})`
        );
    }

    async fetchAsset(base, relativePath) {
        const url = new URL(relativePath, base);
        const payload = await this.client.callFunction(BROWSER_FETCH_FUNCTION, [url.toString()]);
        if (!payload || typeof payload.body !== 'string') {
            throw createProductionError(
                'cloudflare',
                `the challenge browser returned no response body for ${relativePath}`
            );
        }

        let responseUrl;
        try {
            responseUrl = new URL(payload.url || url.toString());
        } catch {
            throw createProductionError(
                'cloudflare',
                `the challenge browser returned an invalid final URL for ${relativePath}`
            );
        }
        if (responseUrl.search || responseUrl.hash) {
            throw createProductionError(
                'cloudflare',
                `the challenge browser redirected ${relativePath} to a URL with a query or fragment: ${responseUrl}`
            );
        }

        const headers = selectedHeaders(payload.headers || {});
        if (!payload.ok) throw createResponseError(relativePath, payload.status, headers);

        return {
            relativePath,
            url: responseUrl.toString(),
            buffer: Buffer.from(payload.body, 'base64'),
            headers,
        };
    }

    async close() {
        this.client.close();
        if (!this.chrome.killed) this.chrome.kill();
        try {
            await fs.rm(this.profileDirectory, { recursive: true, force: true });
        } catch {
            // The temporary profile is best-effort cleanup only.
        }
    }
}

async function openChallengeBrowser(base, target, expectedRevision) {
    const chromePath = await resolveChromePath();
    const xvfbPath = await resolveXvfbPath();
    const profileDirectory = await fs.mkdtemp(
        path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'gym-production-smoke-')
    );
    const remotePort = await findAvailablePort();
    const useHeadfulChrome = process.platform === 'linux' && Boolean(process.env.DISPLAY || xvfbPath);
    const chromeArguments = [
        ...(useHeadfulChrome ? [] : ['--headless=new']),
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
        '--no-default-browser-check',
        '--remote-allow-origins=*',
        '--remote-debugging-address=127.0.0.1',
        `--remote-debugging-port=${remotePort}`,
        `--user-data-dir=${profileDirectory}`,
        '--window-size=1440,900',
        base.toString(),
    ];
    const launchCommand = xvfbPath || chromePath;
    const launchArguments = xvfbPath
        ? ['--auto-servernum', '--server-args=-screen 0 1440x900x24', chromePath, ...chromeArguments]
        : chromeArguments;
    let chrome;
    let client;
    let processError;

    try {
        chrome = spawn(
            launchCommand,
            launchArguments,
            { stdio: ['ignore', 'ignore', 'pipe'] }
        );
        chrome.stderr?.resume();
        chrome.once('error', error => {
            processError = error;
        });
        chrome.once('exit', (code, signal) => {
            if (code !== null && code !== 0 && !processError) {
                processError = new Error(`challenge browser exited with code ${code}${signal ? ` (${signal})` : ''}`);
            }
        });

        const pageTarget = await waitForChromePageTarget(remotePort, base, () => processError);
        client = new DevToolsClient(pageTarget.webSocketDebuggerUrl);
        await client.send('Runtime.enable');
        await client.send('Page.enable');
        await client.send('Network.enable');
        await client.send('Network.setCacheDisabled', { cacheDisabled: true });

        const session = new ChallengeBrowserSession({
            chrome,
            client,
            profileDirectory,
            target,
            expectedRevision,
        });
        await session.waitForRevision();
        return session;
    } catch (error) {
        client?.close();
        if (chrome && !chrome.killed) chrome.kill();
        try {
            await fs.rm(profileDirectory, { recursive: true, force: true });
        } catch {
            // The temporary profile is best-effort cleanup only.
        }
        if (error.layer) throw error;
        throw createProductionError('cloudflare', `the Cloudflare challenge browser could not start: ${error.message}`);
    }
}

function createResponseError(relativePath, status, headers) {
    const layer = status === 403 || status >= 500 ? 'cloudflare' : 'pages';
    const error = createProductionError(
        layer,
        `${relativePath} returned HTTP ${status} (cf-cache-status=${headers['cf-cache-status'] || 'unknown'}, cf-mitigated=${headers['cf-mitigated'] || 'unknown'}, cf-ray=${headers['cf-ray'] || 'unknown'}, server=${headers.server || 'unknown'})`
    );
    error.cloudflareChallenge = headers['cf-mitigated'] === 'challenge';
    return error;
}

async function fetchAsset(base, relativePath) {
    const url = new URL(relativePath, base);
    if (url.search || url.hash) fail('config', `generated production URL contains a query or fragment: ${url}`);

    let response;
    try {
        response = await fetch(url, {
            headers: browserHeaders(base, relativePath),
        });
    } catch (error) {
        fail('cloudflare', `request failed for ${relativePath}: ${error.message}`);
    }

    if (!response.ok) {
        const headers = selectedHeaders(response);
        throw createResponseError(relativePath, response.status, headers);
    }

    return {
        relativePath,
        url: url.toString(),
        buffer: Buffer.from(await response.arrayBuffer()),
        headers: selectedHeaders(response),
    };
}

async function readProduction(base, expectedAssets, challengeBrowser = null) {
    const assets = {};
    for (const relativePath of expectedAssets) {
        assets[relativePath] = challengeBrowser
            ? await challengeBrowser.fetchAsset(base, relativePath)
            : await fetchAsset(base, relativePath);
    }
    return assets;
}

async function readProductionWithChallengeFallback(
    base,
    expectedAssets,
    target,
    expectedRevision,
    challengeBrowser = null
) {
    if (challengeBrowser) {
        return {
            assets: await readProduction(base, expectedAssets, challengeBrowser),
            transport: 'cloudflare-challenge-browser',
            challengeBrowser,
        };
    }

    if (!FORCE_BROWSER_TRANSPORT) {
        try {
            return {
                assets: await readProduction(base, expectedAssets),
                transport: 'node-fetch',
                challengeBrowser: null,
            };
        } catch (error) {
            if (!error.cloudflareChallenge) throw error;
        }
    }

    const browser = await openChallengeBrowser(base, target, expectedRevision);
    try {
        return {
            assets: await readProduction(base, expectedAssets, browser),
            transport: 'cloudflare-challenge-browser',
            challengeBrowser: browser,
        };
    } catch (browserError) {
        await browser.close();
        throw browserError;
    }
}

function validateRelease(release, assets, checkedOutIndexHtml) {
    if (release.schemaVersion !== 1 || !/^v\d+\.\d+\.\d+$/.test(release.revision)) {
        fail('manifest', 'production release.json has an invalid schema or revision');
    }

    let remoteRelease;
    let manifest;
    try {
        remoteRelease = JSON.parse(normalizeText(assets['release.json'].buffer));
        manifest = JSON.parse(normalizeText(assets['manifest.json'].buffer));
    } catch (error) {
        fail('manifest', `production metadata is not valid JSON: ${error.message}`);
    }

    if (
        remoteRelease.schemaVersion !== 1 ||
        remoteRelease.version !== release.version ||
        remoteRelease.revision !== release.revision ||
        remoteRelease.cacheName !== release.cacheName ||
        JSON.stringify(remoteRelease.assets) !== JSON.stringify(release.assets)
    ) {
        fail('cloudflare', `release.json does not match the Pages deployment revision ${release.revision}`);
    }

    const indexHtml = normalizeText(assets['index.html'].buffer);
    const rootHtml = normalizeText(assets[''].buffer);
    const serviceWorker = normalizeText(assets['sw.js'].buffer);
    const expectedRevision = `v${manifest.version}`;

    if (remoteRelease.version !== manifest.version || remoteRelease.revision !== expectedRevision) {
        fail('manifest', `release.json ${release.revision} disagrees with manifest ${manifest.version}`);
    }
    if (manifest.release_revision !== expectedRevision) {
        fail('manifest', `manifest release_revision ${manifest.release_revision} disagrees with ${expectedRevision}`);
    }
    if (indexHtml.match(META_PATTERN)?.[1] !== expectedRevision) {
        fail('pages', `index.html shell revision disagrees with ${expectedRevision}`);
    }
    if (rootHtml.match(META_PATTERN)?.[1] !== expectedRevision) {
        fail('cloudflare', `the canonical /gym/ entry revision disagrees with ${expectedRevision}`);
    }
    if (normalizeShellHtml(rootHtml) !== normalizeShellHtml(indexHtml)) {
        fail(
            'cloudflare',
            'the canonical /gym/ entry shell differs from /gym/index.html after Cloudflare markup normalization'
        );
    }
    if (serviceWorker.match(REVISION_PATTERN)?.[1] !== expectedRevision) {
        fail('service-worker', `sw.js revision disagrees with ${expectedRevision}`);
    }
    if (remoteRelease.cacheName !== `gym-tracker-${expectedRevision}`) {
        fail('service-worker', `release cacheName disagrees with ${expectedRevision}`);
    }

    const declaredAssets = Object.keys(remoteRelease.assets).sort();
    const fetchedAssets = Object.keys(assets)
        .filter(asset => asset !== '' && asset !== 'release.json' && asset !== 'sw.js')
        .sort();
    for (const relativePath of declaredAssets) {
        const asset = assets[relativePath];
        if (!asset) fail('asset', `declared asset was not fetched: ${relativePath}`);
        const expectedHash = remoteRelease.assets[relativePath];
        const actualHash = sha256(asset.buffer, relativePath);
        const edgeTransformedShellMatches = relativePath === 'index.html';
        const normalizedExpectedShell = edgeTransformedShellMatches ? normalizeShellHtml(checkedOutIndexHtml) : null;
        const normalizedActualShell = edgeTransformedShellMatches
            ? normalizeShellHtml(normalizeText(asset.buffer))
            : null;
        const normalizedShellMatches = edgeTransformedShellMatches && normalizedExpectedShell === normalizedActualShell;
        if (actualHash !== expectedHash && !normalizedShellMatches) {
            const layer = relativePath === 'index.html' ? 'cloudflare' : 'asset';
            const detail = normalizedExpectedShell
                ? ` (${shellDifferenceSummary(normalizedExpectedShell, normalizedActualShell)})`
                : '';
            fail(
                layer,
                `${relativePath} hash disagrees with release.json (expected ${expectedHash}, got ${actualHash})${detail}`
            );
        }
    }
    if (JSON.stringify(declaredAssets) !== JSON.stringify(fetchedAssets)) {
        fail('asset', 'production asset set disagrees with release.json');
    }

    const progressHash = sha256(assets['js/progress.js'].buffer, 'js/progress.js');
    if (progressHash !== remoteRelease.assets['js/progress.js']) {
        fail('asset', 'Progress module hash disagrees with release.json');
    }

    return { revision: expectedRevision, version: manifest.version, progressHash };
}

function portfolioTargetRoot() {
    return path.resolve(ROOT, '..', 'target-portfolio');
}

async function readPortfolioTarget() {
    const targetRoot = portfolioTargetRoot();
    try {
        const siteRevision = JSON.parse(await fs.readFile(path.join(targetRoot, 'site-revision.json'), 'utf8'));
        const checkedOutIndexHtml = normalizeText(await fs.readFile(path.join(targetRoot, 'index.html')));
        if (siteRevision.schema !== 1 || siteRevision.entrypoint !== 'index.html') {
            fail('manifest', 'checked-out portfolio site-revision.json has an invalid shape');
        }
        if (!/^[a-f0-9]{12}-[a-f0-9]{12}$/.test(siteRevision.revision || '')) {
            fail('manifest', `checked-out portfolio revision is invalid: ${siteRevision.revision}`);
        }
        const cssPath = siteRevision.assets?.css?.path;
        const jsPath = siteRevision.assets?.js?.path;
        if (!/^styles\.[a-f0-9]{12}\.css$/.test(cssPath || '') || !/^script\.[a-f0-9]{12}\.js$/.test(jsPath || '')) {
            fail('manifest', 'checked-out portfolio assets are not content-addressed');
        }
        const assetPaths = [...new Set([cssPath, jsPath, ...PORTFOLIO_MEDIA_PATHS])];
        const localHashes = {};
        for (const relativePath of assetPaths) {
            const bytes = await fs.readFile(path.join(targetRoot, relativePath));
            localHashes[relativePath] = sha256(bytes, relativePath);
        }
        if (siteRevision.assets.css.sha256 !== localHashes[cssPath]) {
            fail('manifest', `checked-out portfolio CSS hash disagrees with ${cssPath}`);
        }
        if (siteRevision.assets.js.sha256 !== localHashes[jsPath]) {
            fail('manifest', `checked-out portfolio JS hash disagrees with ${jsPath}`);
        }
        return { siteRevision, checkedOutIndexHtml, localHashes };
    } catch (error) {
        if (error.layer) throw error;
        fail('pages', `could not read the checked-out portfolio target: ${error.message}`);
    }
}

function getPortfolioExpectedAssets(siteRevision) {
    return [
        '',
        'index.html',
        'site-revision.json',
        siteRevision.assets.css.path,
        siteRevision.assets.js.path,
        ...PORTFOLIO_MEDIA_PATHS,
    ].sort();
}

function validatePortfolio(siteRevision, assets, checkedOutIndexHtml, localHashes) {
    let remoteRevision;
    try {
        remoteRevision = JSON.parse(normalizeText(assets['site-revision.json'].buffer));
    } catch (error) {
        fail('manifest', `production site-revision.json is not valid JSON: ${error.message}`);
    }
    if (JSON.stringify(remoteRevision) !== JSON.stringify(siteRevision)) {
        fail('cloudflare', `site-revision.json does not match deployed portfolio revision ${siteRevision.revision}`);
    }

    const rootHtml = normalizeText(assets[''].buffer);
    const indexHtml = normalizeText(assets['index.html'].buffer);
    const requiredMarkers = [
        'https://codeoverdose.es/',
        'Taskify',
        'Firestore',
        'id="project-6"',
        'hreflang="es"',
        '<dialog',
    ];
    for (const marker of requiredMarkers) {
        if (!rootHtml.includes(marker)) fail('cloudflare', `canonical portfolio root is missing ${marker}`);
        if (!indexHtml.includes(marker)) fail('pages', `portfolio index.html is missing ${marker}`);
    }
    if (rootHtml.match(PORTFOLIO_META_PATTERN)?.[1] !== siteRevision.revision) {
        fail('cloudflare', `canonical portfolio root revision disagrees with ${siteRevision.revision}`);
    }
    if (indexHtml.match(PORTFOLIO_META_PATTERN)?.[1] !== siteRevision.revision) {
        fail('pages', `portfolio index.html revision disagrees with ${siteRevision.revision}`);
    }
    if (normalizeShellHtml(rootHtml) !== normalizeShellHtml(indexHtml)) {
        fail('cloudflare', 'canonical portfolio root differs from /index.html after Cloudflare markup normalization');
    }

    const cssPath = siteRevision.assets.css.path;
    const jsPath = siteRevision.assets.js.path;
    if (!rootHtml.includes(`href="${cssPath}"`) || !indexHtml.includes(`href="${cssPath}"`)) {
        fail('cloudflare', `portfolio HTML does not reference ${cssPath}`);
    }
    if (!rootHtml.includes(`src="${jsPath}"`) || !indexHtml.includes(`src="${jsPath}"`)) {
        fail('cloudflare', `portfolio HTML does not reference ${jsPath}`);
    }
    if (rootHtml.includes('href="styles.css"') || indexHtml.includes('href="styles.css"')) {
        fail('cloudflare', 'portfolio HTML still references mutable styles.css');
    }
    if (rootHtml.includes('src="script.js"') || indexHtml.includes('src="script.js"')) {
        fail('cloudflare', 'portfolio HTML still references mutable script.js');
    }
    for (const relativePath of [cssPath, jsPath, ...PORTFOLIO_MEDIA_PATHS]) {
        const actualHash = sha256(assets[relativePath].buffer, relativePath);
        const expectedHash = localHashes[relativePath];
        if (actualHash !== expectedHash) {
            fail('cloudflare', `${relativePath} bytes do not match the checked-out portfolio revision`);
        }
    }
    if (normalizeShellHtml(indexHtml) !== normalizeShellHtml(checkedOutIndexHtml)) {
        fail('pages', 'deployed /index.html differs from the checked-out portfolio shell');
    }

    return { revision: siteRevision.revision, assetCount: Object.keys(localHashes).length };
}

function assertStableResponses(first, second) {
    for (const relativePath of Object.keys(first)) {
        const firstFingerprint =
            relativePath === '' || relativePath === 'index.html'
                ? normalizeShellHtml(normalizeText(first[relativePath].buffer))
                : sha256(first[relativePath].buffer, relativePath);
        const secondFingerprint =
            relativePath === '' || relativePath === 'index.html'
                ? normalizeShellHtml(normalizeText(second[relativePath].buffer))
                : sha256(second[relativePath].buffer, relativePath);
        if (firstFingerprint !== secondFingerprint) {
            fail('cloudflare', `repeated no-query response changed for ${relativePath || '/'}`);
        }
    }
}

async function runPortfolio() {
    const target = await readPortfolioTarget();
    const base = normalizeBaseUrl(PORTFOLIO_PUBLIC_BASE_URL);
    const expectedAssets = getPortfolioExpectedAssets(target.siteRevision);
    let lastError;
    let challengeBrowser = null;

    try {
        for (let attempt = 1; attempt <= RETRY_COUNT; attempt += 1) {
            try {
                const production = await readProductionWithChallengeFallback(
                    base,
                    expectedAssets,
                    'portfolio',
                    target.siteRevision.revision,
                    challengeBrowser
                );
                challengeBrowser = production.challengeBrowser;
                const assets = production.assets;
                const validation = validatePortfolio(
                    target.siteRevision,
                    assets,
                    target.checkedOutIndexHtml,
                    target.localHashes
                );
                const repeatedProduction = await readProductionWithChallengeFallback(
                    base,
                    expectedAssets,
                    'portfolio',
                    target.siteRevision.revision,
                    challengeBrowser
                );
                challengeBrowser = repeatedProduction.challengeBrowser;
                const repeatedAssets = repeatedProduction.assets;
                assertStableResponses(assets, repeatedAssets);
                const evidence = buildEvidence(
                    target.siteRevision,
                    assets,
                    validation,
                    PORTFOLIO_PUBLIC_BASE_URL,
                    repeatedProduction.transport === 'cloudflare-challenge-browser' ||
                        production.transport === 'cloudflare-challenge-browser'
                        ? 'cloudflare-challenge-browser'
                        : 'node-fetch'
                );
                const evidencePath = process.env.PRODUCTION_SMOKE_EVIDENCE_PATH;
                if (evidencePath) {
                    await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
                }
                console.log(
                    `[production-smoke] passed portfolio ${validation.revision}; verified ${expectedAssets.length} repeated no-query canonical assets`
                );
                return;
            } catch (error) {
                lastError = error;
                if (challengeBrowser && error.cloudflareChallenge) {
                    await challengeBrowser.close();
                    challengeBrowser = null;
                }
                if (attempt === RETRY_COUNT) break;
                console.warn(`[production-smoke] attempt ${attempt}/${RETRY_COUNT} did not converge: ${error.message}`);
                await sleep(RETRY_DELAY_MS);
            }
        }
    } finally {
        await challengeBrowser?.close();
    }

    throw lastError;
}

function buildEvidence(
    release,
    assets,
    validation,
    publicBaseUrl = GYM_PUBLIC_BASE_URL,
    verificationTransport = 'node-fetch'
) {
    return {
        status: 'passed',
        publicBaseUrl,
        verificationTransport,
        revision: validation.revision,
        version: validation.version,
        progressHash: validation.progressHash,
        releaseMetadata: release,
        responses: Object.fromEntries(
            Object.entries(assets).map(([relativePath, asset]) => [
                relativePath,
                {
                    url: asset.url,
                    headers: asset.headers,
                    sha256: sha256(asset.buffer, relativePath),
                },
            ])
        ),
    };
}

async function runGym() {
    const base = normalizeBaseUrl(GYM_PUBLIC_BASE_URL);
    const release = await readLocalRelease();
    const expectedAssets = getExpectedAssets(release);
    let lastError;
    let challengeBrowser = null;

    try {
        for (let attempt = 1; attempt <= RETRY_COUNT; attempt += 1) {
            try {
                const production = await readProductionWithChallengeFallback(
                    base,
                    expectedAssets,
                    'gym',
                    release.revision,
                    challengeBrowser
                );
                challengeBrowser = production.challengeBrowser;
                const assets = production.assets;
                const checkedOutIndexHtml = normalizeText(await fs.readFile(path.join(ROOT, 'index.html')));
                const validation = validateRelease(release, assets, checkedOutIndexHtml);
                const evidence = buildEvidence(release, assets, validation, GYM_PUBLIC_BASE_URL, production.transport);
                const evidencePath = process.env.PRODUCTION_SMOKE_EVIDENCE_PATH;
                if (evidencePath) {
                    await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
                }
                console.log(
                    `[production-smoke] passed ${validation.revision}; verified ${expectedAssets.length} no-query canonical assets`
                );
                return;
            } catch (error) {
                lastError = error;
                if (challengeBrowser && error.cloudflareChallenge) {
                    await challengeBrowser.close();
                    challengeBrowser = null;
                }
                if (attempt === RETRY_COUNT) break;
                console.warn(`[production-smoke] attempt ${attempt}/${RETRY_COUNT} did not converge: ${error.message}`);
                await sleep(RETRY_DELAY_MS);
            }
        }
    } finally {
        await challengeBrowser?.close();
    }

    throw lastError;
}

async function run() {
    if (SMOKE_TARGET === 'portfolio') return runPortfolio();
    if (SMOKE_TARGET !== 'gym') fail('config', 'PRODUCTION_SMOKE_TARGET must be gym or portfolio');
    return runGym();
}

run().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
