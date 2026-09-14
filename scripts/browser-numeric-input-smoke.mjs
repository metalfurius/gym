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
const EVIDENCE_DIRECTORY = path.join(ROOT, 'Validation Evidence');
const CHROME_PATH_CANDIDATES = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Users\\Fran\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe',
].filter(Boolean);
const CHROME_DEBUG_PORT = Number(process.env.CHROME_NUMERIC_DEBUG_PORT || 9272);
const FIREFOX_DEBUG_PORT = Number(process.env.FIREFOX_NUMERIC_DEBUG_PORT || 9336);
const REQUESTED_BROWSER = (process.env.NUMERIC_SMOKE_BROWSER || 'chromium').toLowerCase();
const SUPPORTED_BROWSERS = new Set(['all', 'chromium', 'firefox']);

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const smokeFixture = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Gym numeric input smoke</title>
  <link rel="stylesheet" href="./css/user-weight.css">
  <style>
    :root { --input-bg: #fff; --error-color: #b91c1c; --spacing-md: 1rem; }
    body { font: 16px system-ui, sans-serif; max-width: 42rem; margin: 2rem auto; padding: 0 1rem; }
    main { display: grid; gap: 1rem; }
    .set-row { display: grid; gap: .5rem; }
    input, select, button { font: inherit; padding: .5rem; }
    #status { min-height: 1.5rem; }
  </style>
</head>
<body>
  <main>
    <h1>Gym numeric input smoke</h1>
    <form id="session-form">
      <div class="user-weight-input">
        <label for="user-weight">Body weight</label>
        <input id="user-weight" name="user-weight" type="text" inputmode="decimal" pattern="[0-9]*[.,]?[0-9]*">
      </div>
      <div class="set-row">
        <label for="weight">Set weight</label>
        <input id="weight" name="weight" type="text" inputmode="decimal" pattern="[0-9]*[.,]?[0-9]*">
        <label for="reps">Repetitions</label>
        <input id="reps" name="reps" type="text" inputmode="numeric" pattern="[0-9]*">
        <label for="load-type">Load type</label>
        <select id="load-type" name="load-type">
          <option value="external">External</option>
          <option value="bodyweight">Bodyweight</option>
        </select>
      </div>
      <button id="save" type="submit">Save</button>
      <p id="status" role="status" aria-live="polite"></p>
    </form>
  </main>
  <script type="module">
    import {
      normalizeDecimalEditValue,
      normalizeIntegerEditValue
    } from './js/utils/numeric-input.js';
    import {
      replaceInputValuePreservingSelection,
      setInputValidationState
    } from './js/utils/input-validation.js';
    import {
      LIMITS,
      getValidationMessage,
      validateReps,
      validateUserWeight,
      validateWeight
    } from './js/utils/validation.js';

    const form = document.getElementById('session-form');
    const userWeight = document.getElementById('user-weight');
    const weight = document.getElementById('weight');
    const reps = document.getElementById('reps');
    const loadType = document.getElementById('load-type');
    const status = document.getElementById('status');

    function signedLoad() {
      return loadType.value === 'bodyweight';
    }

    function weightLimits() {
      return { min: signedLoad() ? -LIMITS.WEIGHT.max : LIMITS.WEIGHT.min, max: LIMITS.WEIGHT.max };
    }

    function updateUserWeight() {
      const editResult = normalizeDecimalEditValue(userWeight.value);
      if (editResult.isValid) {
        replaceInputValuePreservingSelection(userWeight, editResult.value);
        setInputValidationState(userWeight, { isValid: true });
        return;
      }

      const result = validateUserWeight(userWeight.value);
      setInputValidationState(userWeight, {
        isValid: false,
        message: getValidationMessage(result, 'userWeight', LIMITS.USER_WEIGHT)
      });
    }

    function commitUserWeight() {
      const result = validateUserWeight(userWeight.value);
      if (result.isValid) {
        replaceInputValuePreservingSelection(userWeight, result.value === null ? '' : String(result.value));
        setInputValidationState(userWeight, { isValid: true });
        return;
      }

      setInputValidationState(userWeight, {
        isValid: false,
        message: getValidationMessage(result, 'userWeight', LIMITS.USER_WEIGHT)
      });
    }

    function updateWeight() {
      const editResult = normalizeDecimalEditValue(weight.value, { allowSign: signedLoad() });
      if (editResult.isValid) {
        replaceInputValuePreservingSelection(weight, editResult.value);
        setInputValidationState(weight, { isValid: true });
        return;
      }

      const result = validateWeight(weight.value, { allowSigned: signedLoad(), ...weightLimits() });
      setInputValidationState(weight, {
        isValid: false,
        message: getValidationMessage(result, 'weight', weightLimits())
      });
    }

    function commitWeight() {
      const result = validateWeight(weight.value, { allowSigned: signedLoad(), ...weightLimits() });
      if (result.isValid) {
        replaceInputValuePreservingSelection(weight, result.value === null ? '' : String(result.value));
        setInputValidationState(weight, { isValid: true });
        return;
      }

      setInputValidationState(weight, {
        isValid: false,
        message: getValidationMessage(result, 'weight', weightLimits())
      });
    }

    function updateReps() {
      const editResult = normalizeIntegerEditValue(reps.value);
      if (editResult.isValid) {
        replaceInputValuePreservingSelection(reps, editResult.value);
        setInputValidationState(reps, { isValid: true });
        return;
      }

      const result = validateReps(reps.value);
      setInputValidationState(reps, {
        isValid: false,
        message: getValidationMessage(result, 'reps', LIMITS.REPS)
      });
    }

    function commitReps() {
      const result = validateReps(reps.value);
      if (result.isValid) {
        replaceInputValuePreservingSelection(reps, result.value === null ? '' : String(result.value));
        setInputValidationState(reps, { isValid: true });
        return;
      }

      setInputValidationState(reps, {
        isValid: false,
        message: getValidationMessage(result, 'reps', LIMITS.REPS)
      });
    }

    userWeight.addEventListener('input', updateUserWeight);
    userWeight.addEventListener('blur', commitUserWeight);
    weight.addEventListener('input', updateWeight);
    weight.addEventListener('blur', commitWeight);
    reps.addEventListener('input', updateReps);
    reps.addEventListener('blur', commitReps);
    loadType.addEventListener('change', () => {
      weight.pattern = signedLoad() ? '[+-]?[0-9]*[.,]?[0-9]*' : '[0-9]*[.,]?[0-9]*';
      updateWeight();
    });

    form.addEventListener('submit', event => {
      event.preventDefault();
      commitUserWeight();
      commitWeight();
      commitReps();
      status.textContent = form.checkValidity() ? 'saved' : 'blocked';
    });

    window.__numericInputSmokeReady = true;
    window.runNumericInputSmoke = () => {
      const dispatch = (input, value, eventName = 'input') => {
        input.value = value;
        input.dispatchEvent(new Event(eventName, { bubbles: true }));
      };
      const inputState = input => ({
        value: input.value,
        ariaInvalid: input.getAttribute('aria-invalid'),
        describedBy: input.getAttribute('aria-describedby')
      });

      const incremental = ['6', '62', '62.', '62.5'].map(value => {
        dispatch(weight, value);
        return weight.value;
      });
      dispatch(weight, '62,');
      const commaWeight = weight.value;
      dispatch(weight, '62.55', 'input');
      dispatch(weight, weight.value, 'blur');
      const roundedWeight = weight.value;

      dispatch(loadType, 'bodyweight', 'change');
      dispatch(weight, '-12,5');
      const signedWeight = weight.value;
      dispatch(weight, weight.value, 'blur');
      const committedSignedWeight = weight.value;

      dispatch(userWeight, '75,4');
      const commaUserWeight = userWeight.value;
      dispatch(userWeight, userWeight.value, 'blur');
      const committedUserWeight = userWeight.value;

      const invalidReps = ['8.5', '8,5', '1e2', '+8', '-1'].map(value => {
        dispatch(reps, value);
        return { value: reps.value, ariaInvalid: reps.getAttribute('aria-invalid') };
      });
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      const blockedSubmit = { status: status.textContent, valid: form.checkValidity() };

      dispatch(reps, '8');
      dispatch(reps, reps.value, 'blur');
      const correctedReps = inputState(reps);

      dispatch(reps, '8.5');
      const invalidError = document.getElementById('reps-error');

      return {
        incremental,
        commaWeight,
        roundedWeight,
        signedWeight,
        committedSignedWeight,
        commaUserWeight,
        committedUserWeight,
        invalidReps,
        blockedSubmit,
        correctedReps,
        invalidError: {
          role: invalidError?.getAttribute('role'),
          live: invalidError?.getAttribute('aria-live'),
          hidden: invalidError?.hidden,
          text: invalidError?.textContent
        },
        controls: {
          weightType: weight.type,
          weightInputMode: weight.inputMode,
          repsType: reps.type,
          repsInputMode: reps.inputMode,
          repsPattern: reps.pattern,
          weightLabel: document.querySelector('label[for="weight"]')?.textContent,
          repsLabel: document.querySelector('label[for="reps"]')?.textContent
        }
      };
    };
  </script>
</body>
</html>`;

function contentType(filePath) {
    return (
        {
            '.css': 'text/css; charset=utf-8',
            '.html': 'text/html; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
            '.json': 'application/json; charset=utf-8',
            '.png': 'image/png',
        }[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
    );
}

async function createSmokeServer() {
    const server = createServer(async (request, response) => {
        try {
            const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
            if (requestUrl.pathname === '/numeric-input-smoke.html' || requestUrl.pathname === '/') {
                response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' });
                response.end(smokeFixture);
                return;
            }

            const relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '');
            const filePath = path.resolve(ROOT, relativePath);
            if (!filePath.startsWith(`${ROOT}${path.sep}`)) {
                response.writeHead(403);
                response.end('Forbidden');
                return;
            }

            const body = await fs.readFile(filePath);
            response.writeHead(200, {
                'Cache-Control': 'no-store',
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
    return { server, url: `http://127.0.0.1:${address.port}/numeric-input-smoke.html` };
}

class CdpClient {
    constructor(url) {
        this.nextId = 1;
        this.pending = new Map();
        this.events = [];
        this.socket = new WebSocket(url);
        this.socket.on('message', data => {
            const message = JSON.parse(String(data));
            if (process.env.FIREFOX_NUMERIC_DEBUG) {
                console.error(`[numeric-smoke:firefox] BiDi ${JSON.stringify(message).slice(0, 1600)}`);
            }
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
            this.socket.once('open', resolve);
            this.socket.once('error', reject);
        });
    }

    async send(method, params = {}) {
        await this.openPromise;
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`CDP command timed out: ${method}`));
            }, 10_000);
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
            this.socket.send(JSON.stringify({ id, method, params }));
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

    close() {
        this.socket.close();
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
    throw new Error(`Chrome executable not found; tried ${CHROME_PATH_CANDIDATES.join(', ')}`);
}

async function waitForEndpoint(url, timeout = 30_000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(url);
            if (response.ok) return response;
        } catch {
            // Browser is still starting.
        }
        await sleep(100);
    }
    throw new Error(`Browser endpoint did not start: ${url}`);
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
        await sleep(100);
    }
    throw new Error(`Timed out waiting for browser condition${lastError ? `: ${lastError.message}` : ''}`);
}

async function openChrome(url, profileDirectory) {
    const chromePath = await resolveChromePath();
    const chrome = spawn(
        chromePath,
        [
            '--headless=new',
            '--disable-gpu',
            '--disable-gpu-compositing',
            '--disable-gpu-rasterization',
            '--disable-software-rasterizer',
            '--disable-accelerated-2d-canvas',
            '--disable-features=VizDisplayCompositor',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-extensions',
            '--no-first-run',
            '--no-default-browser-check',
            '--remote-allow-origins=*',
            '--remote-debugging-address=127.0.0.1',
            `--remote-debugging-port=${CHROME_DEBUG_PORT}`,
            `--user-data-dir=${profileDirectory}`,
            '--window-size=1280,900',
            url,
        ],
        { stdio: ['ignore', 'ignore', 'pipe'] }
    );
    chrome.stderr.on('data', data => process.stderr.write(`[numeric-smoke:chromium] ${String(data)}`));

    await waitForEndpoint(`http://127.0.0.1:${CHROME_DEBUG_PORT}/json/version`);
    const deadline = Date.now() + 30_000;
    let target;
    while (Date.now() < deadline) {
        const targets = await fetch(`http://127.0.0.1:${CHROME_DEBUG_PORT}/json/list`).then(response =>
            response.json()
        );
        target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl && item.url.startsWith(url));
        if (!target) {
            target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl);
        }
        if (target) break;
        await sleep(100);
    }
    if (!target) throw new Error('Chromium page target did not start');

    const client = new CdpClient(target.webSocketDebuggerUrl);
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    if (!target.url.startsWith(url)) {
        await client.send('Page.navigate', { url });
    }
    return { chrome, client };
}

async function runChromium(url) {
    const profileDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'gym-numeric-chromium-'));
    let browser;
    try {
        browser = await openChrome(url, profileDirectory);
        await waitFor(browser.client, function numericFixtureReady() {
            return window.__numericInputSmokeReady === true;
        });
        const state = await browser.client.evaluate('window.runNumericInputSmoke()');
        const screenshot = await browser.client.send('Page.captureScreenshot', {
            format: 'png',
            captureBeyondViewport: true,
        });
        const screenshotPath = path.join(EVIDENCE_DIRECTORY, '2026-09-12-gym-numeric-inputs-chromium.png');
        await fs.mkdir(EVIDENCE_DIRECTORY, { recursive: true });
        await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
        return {
            browser: 'Chromium',
            state,
            screenshot: path.relative(ROOT, screenshotPath),
            consoleEvents: browser.client.events.filter(event => event.method === 'Runtime.consoleAPICalled').length,
            exceptionEvents: browser.client.events.filter(event => event.method === 'Runtime.exceptionThrown').length,
        };
    } finally {
        browser?.client.close();
        browser?.chrome.kill();
        await fs.rm(profileDirectory, { recursive: true, force: true }).catch(() => {});
    }
}

function remoteValue(value) {
    if (!value || value.type === 'null') return null;
    if (value.type === 'array') return value.value.map(remoteValue);
    if (value.type === 'object') {
        return Object.fromEntries((value.value || []).map(([key, entry]) => [key, remoteValue(entry)]));
    }
    return value.value;
}

class BidiClient {
    constructor(url) {
        this.nextId = 1;
        this.pending = new Map();
        this.events = [];
        this.socket = new WebSocket(url);
        this.socket.on('message', data => {
            const message = JSON.parse(String(data));
            if (process.env.FIREFOX_NUMERIC_DEBUG) {
                console.error(`[numeric-smoke:firefox] BiDi ${JSON.stringify(message).slice(0, 1600)}`);
            }
            if (message.id && this.pending.has(message.id)) {
                const pending = this.pending.get(message.id);
                this.pending.delete(message.id);
                if (message.error) pending.reject(new Error(message.error.message || message.error));
                else pending.resolve(message.result || {});
            } else if (message.method) {
                this.events.push(message);
            }
        });
        this.openPromise = new Promise((resolve, reject) => {
            this.socket.once('open', resolve);
            this.socket.once('error', reject);
        });
    }

    async send(method, params = {}) {
        await this.openPromise;
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`BiDi command timed out: ${method}`));
            }, 10_000);
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
            this.socket.send(JSON.stringify({ id, method, params }));
        });
    }

    async evaluate(context, expression) {
        const result = await this.send('script.evaluate', {
            expression,
            target: { context },
            awaitPromise: true,
            userActivation: true,
        });
        return remoteValue(result.result);
    }

    close() {
        this.socket.close();
    }
}

async function openFirefox(url, profileDirectory) {
    const firefoxPath = await resolveFirefoxPath();
    const firefox = spawn(
        firefoxPath,
        [
            '-headless',
            '--safe-mode',
            '--disable-gpu',
            '--no-remote',
            '--new-instance',
            `--remote-debugging-port=${FIREFOX_DEBUG_PORT}`,
            '-profile',
            profileDirectory,
            '--new-window',
            url,
        ],
        {
            stdio: ['ignore', 'ignore', 'pipe'],
            env: {
                ...process.env,
                MOZ_ACCELERATED: '0',
                MOZ_WEBRENDER: '0',
                MOZ_DISABLE_RDD_SANDBOX: '1',
            },
        }
    );
    let stderr = '';
    let bidiUrl;
    firefox.stderr.on('data', data => {
        stderr += String(data);
        const endpoint = stderr.match(/WebDriver BiDi listening on (ws:\/\/\S+)/)?.[1];
        if (endpoint) bidiUrl ||= `${endpoint}/session`;
    });

    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline && !bidiUrl) await sleep(100);
    if (!bidiUrl) {
        firefox.kill();
        throw new Error(`Firefox BiDi endpoint did not start: ${stderr}`);
    }

    let client;
    try {
        client = new BidiClient(bidiUrl);
        await client.send('session.new', { capabilities: { alwaysMatch: {} } });
        let context;
        for (let attempt = 0; attempt < 50 && !context; attempt += 1) {
            const tree = await client.send('browsingContext.getTree');
            context = tree.contexts?.[0]?.context || tree.contexts?.[0]?.id;
            if (!context) await sleep(100);
        }
        if (!context) {
            const created = await client.send('browsingContext.create', { type: 'tab' });
            context = created.context || created.id;
        }
        if (!context) throw new Error('Firefox did not expose a browsing context');
        try {
            await client.send('session.subscribe', {
                events: ['log.entryAdded', 'browsingContext.domContentLoaded', 'browsingContext.load'],
                contexts: [context],
            });
        } catch {
            // Older Firefox builds may expose a smaller event set.
        }
        await client.send('browsingContext.navigate', { context, url, wait: 'complete' });
        return { firefox, client, context };
    } catch (error) {
        client?.close();
        firefox.kill();
        throw error;
    }
}

async function resolveFirefoxPath() {
    const candidates = [
        process.env.FIREFOX_PATH,
        ...(process.platform === 'win32'
            ? [
                'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
                'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe',
            ]
            : ['/usr/bin/firefox', '/usr/bin/firefox-esr', '/Applications/Firefox.app/Contents/MacOS/firefox']),
    ].filter(Boolean);

    const playwrightRoots = [
        process.platform === 'win32' && process.env.LOCALAPPDATA
            ? path.join(process.env.LOCALAPPDATA, 'ms-playwright')
            : null,
        path.join(os.homedir(), '.cache', 'ms-playwright'),
    ].filter(Boolean);
    for (const root of playwrightRoots) {
        try {
            const entries = await fs.readdir(root, { withFileTypes: true });
            for (const entry of entries
                .filter(candidate => candidate.isDirectory() && /^firefox-/.test(candidate.name))
                .sort((left, right) => right.name.localeCompare(left.name, undefined, { numeric: true }))) {
                candidates.push(
                    path.join(root, entry.name, 'firefox', process.platform === 'win32' ? 'firefox.exe' : 'firefox')
                );
            }
        } catch {
            // The Playwright cache is optional; continue with system locations.
        }
    }

    const pathEntries = (process.env.PATH || process.env.Path || '').split(path.delimiter).filter(Boolean);
    for (const entry of pathEntries) {
        candidates.push(path.join(entry, process.platform === 'win32' ? 'firefox.exe' : 'firefox'));
        if (process.platform !== 'win32') candidates.push(path.join(entry, 'firefox-esr'));
    }

    for (const candidate of candidates) {
        try {
            await fs.access(candidate);
            return candidate;
        } catch {
            // Try the next platform or runner-provided installation path.
        }
    }
    throw new Error(
        `Firefox executable not found; set FIREFOX_PATH or install Firefox (tried ${candidates.join(', ')})`
    );
}

async function runFirefox(url) {
    const profileDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'gym-numeric-firefox-'));
    let browser;
    try {
        browser = await openFirefox(url, profileDirectory);
        const stateReady = await browser.client.evaluate(browser.context, 'window.__numericInputSmokeReady === true');
        if (!stateReady) throw new Error('Firefox numeric fixture did not become ready');
        const state = await browser.client.evaluate(browser.context, 'window.runNumericInputSmoke()');
        const screenshot = await browser.client.send('browsingContext.captureScreenshot', {
            context: browser.context,
            origin: 'viewport',
        });
        const screenshotPath = path.join(EVIDENCE_DIRECTORY, '2026-09-12-gym-numeric-inputs-firefox.png');
        await fs.mkdir(EVIDENCE_DIRECTORY, { recursive: true });
        await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
        return {
            browser: 'Firefox',
            state,
            screenshot: path.relative(ROOT, screenshotPath),
            consoleEvents: browser.client.events.filter(event => event.method === 'log.entryAdded').length,
            exceptionEvents: 0,
        };
    } finally {
        browser?.client.close();
        browser?.firefox.kill();
        await fs.rm(profileDirectory, { recursive: true, force: true }).catch(() => {});
    }
}

function assertSmokeState(result) {
    const state = result.state;
    const expectedIncremental = ['6', '62', '62.', '62.5'];
    if (JSON.stringify(state.incremental) !== JSON.stringify(expectedIncremental)) {
        throw new Error(`${result.browser}: incremental weight editing changed unexpectedly`);
    }
    if (state.commaWeight !== '62.' || state.roundedWeight !== '62.6') {
        throw new Error(`${result.browser}: decimal comma/precision contract failed`);
    }
    if (state.signedWeight !== '-12.5' || state.committedSignedWeight !== '-12.5') {
        throw new Error(`${result.browser}: signed bodyweight contract failed`);
    }
    if (state.commaUserWeight !== '75.4' || state.committedUserWeight !== '75.4') {
        throw new Error(`${result.browser}: user bodyweight decimal contract failed`);
    }
    const expectedInvalidReps = ['8.5', '8,5', '1e2', '+8', '-1'];
    if (
        !Array.isArray(state.invalidReps) ||
        state.invalidReps.length !== expectedInvalidReps.length ||
        state.invalidReps.some(
            (entry, index) => entry.value !== expectedInvalidReps[index] || entry.ariaInvalid !== 'true'
        )
    ) {
        throw new Error(`${result.browser}: malformed repetitions were not retained and marked invalid`);
    }
    if (state.blockedSubmit.status !== 'blocked' || state.blockedSubmit.valid !== false) {
        throw new Error(`${result.browser}: invalid repetitions did not block submit`);
    }
    if (state.correctedReps.value !== '8' || state.correctedReps.ariaInvalid !== null) {
        throw new Error(`${result.browser}: valid repetition correction did not clear validation`);
    }
    if (
        state.invalidError.role !== 'alert' ||
        state.invalidError.live !== 'polite' ||
        state.invalidError.hidden !== false ||
        !state.invalidError.text
    ) {
        throw new Error(`${result.browser}: accessible error message contract failed`);
    }
    if (
        state.controls.weightType !== 'text' ||
        state.controls.weightInputMode !== 'decimal' ||
        state.controls.repsType !== 'text' ||
        state.controls.repsInputMode !== 'numeric' ||
        state.controls.repsPattern !== '[0-9]*' ||
        !state.controls.weightLabel ||
        !state.controls.repsLabel
    ) {
        throw new Error(`${result.browser}: numeric input accessibility attributes failed`);
    }
}

async function run() {
    if (!SUPPORTED_BROWSERS.has(REQUESTED_BROWSER)) {
        throw new Error(`Unsupported NUMERIC_SMOKE_BROWSER=${REQUESTED_BROWSER}; use chromium, firefox, or all`);
    }
    const smokeServer = await createSmokeServer();
    const evidence = {
        generatedAt: new Date().toISOString(),
        syntheticDataOnly: true,
        fixture: 'shared numeric-input and input-validation modules',
        results: [],
    };

    try {
        const failures = [];
        if (REQUESTED_BROWSER === 'all' || REQUESTED_BROWSER === 'chromium') {
            try {
                const chromium = await runChromium(smokeServer.url);
                assertSmokeState(chromium);
                evidence.results.push({ ...chromium, status: 'passed' });
                console.log('[browser-numeric-input-smoke] Chromium passed');
            } catch (error) {
                failures.push(error);
                evidence.results.push({ browser: 'Chromium', status: 'failed', error: error.message });
                console.error(`[browser-numeric-input-smoke] Chromium unavailable: ${error.message}`);
            }
        }

        if (REQUESTED_BROWSER === 'all' || REQUESTED_BROWSER === 'firefox') {
            try {
                const firefox = await runFirefox(smokeServer.url);
                assertSmokeState(firefox);
                evidence.results.push({ ...firefox, status: 'passed' });
                console.log('[browser-numeric-input-smoke] Firefox passed');
            } catch (error) {
                failures.push(error);
                evidence.results.push({ browser: 'Firefox', status: 'failed', error: error.message });
                console.error(`[browser-numeric-input-smoke] Firefox unavailable: ${error.message}`);
            }
        }

        await fs.mkdir(EVIDENCE_DIRECTORY, { recursive: true });
        await fs.writeFile(
            path.join(EVIDENCE_DIRECTORY, '2026-09-12-gym-numeric-inputs.json'),
            `${JSON.stringify(evidence, null, 2)}\n`,
            'utf8'
        );
        if (failures.length > 0) {
            throw new Error(failures.map(error => error.message).join('; '));
        }
    } finally {
        await new Promise(resolve => smokeServer.server.close(resolve));
    }
}

run().catch(error => {
    console.error(`[browser-numeric-input-smoke] ${error.stack || error.message}`);
    process.exitCode = 1;
});
