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
    ...(process.platform === 'win32'
        ? [
              'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
              'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          ]
        : [
              '/usr/bin/google-chrome',
              '/usr/bin/google-chrome-stable',
              '/usr/bin/chromium',
              '/usr/bin/chromium-browser',
          ]),
].filter(Boolean);
const CHROME_DEBUG_PORT = Number(process.env.CHROME_SESSION_COUNTING_DEBUG_PORT || 9273);

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const smokeFixture = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Gym session counting smoke</title>
  <style>
    :root { color-scheme: light; font: 16px system-ui, sans-serif; }
    body { margin: 2rem auto; max-width: 42rem; padding: 0 1rem; }
    main { display: grid; gap: 1rem; }
    .card { border: 1px solid #cbd5e1; border-radius: .75rem; padding: 1rem; }
    #calendar-cell { display: inline-grid; place-items: center; min-width: 4rem; min-height: 4rem; border: 1px solid #94a3b8; border-radius: .5rem; }
  </style>
</head>
<body>
  <main>
    <h1>Session counting smoke</h1>
    <section class="card" aria-label="Daily Hub">
      <p>Monthly sessions: <output id="month-count">pending</output></p>
      <p>Weekly progress: <output id="weekly-progress">pending</output></p>
    </section>
    <section class="card" aria-label="Calendar">
      <div id="calendar-cell" aria-label="Activity date">17</div>
    </section>
    <p id="status" role="status" aria-live="polite">Loading</p>
  </main>
  <script type="module">
    import {
      buildWeeklyConsistencyTimeline,
      computeDailyHubState
    } from './js/utils/quick-log.js';
    import { setLanguage } from './js/i18n.js';

    setLanguage('en', { persist: false, apply: false });

    const now = new Date(2026, 8, 17, 20, 0, 0);
    const sessions = [
      { id: 'session-morning', fecha: new Date(2026, 8, 17, 7, 0, 0) },
      { id: 'session-evening', fecha: new Date(2026, 8, 17, 19, 0, 0) },
      // Simulate a duplicate queue delivery of the evening session.
      { id: 'session-evening', fecha: new Date(2026, 8, 17, 19, 0, 0) }
    ];

    const state = computeDailyHubState({
      sessions,
      now,
      weeklyTargetSessions: 2,
      isOnline: true,
      pendingCount: 0
    });
    const timeline = buildWeeklyConsistencyTimeline({
      sessions,
      now,
      weeklyTargetSessions: 2
    });
    const currentWeek = timeline.timeline.find((entry) => entry.isCurrentWeek);

    document.getElementById('month-count').textContent = String(state.logsMonthCount);
    document.getElementById('weekly-progress').textContent = state.weeklyProgressLabel;
    document.getElementById('calendar-cell').title = 'September 17: ' + currentWeek.sessionCount + ' sessions';
    document.getElementById('status').textContent = 'Ready';

    window.__sessionCountingSmokeReady = true;
    window.runSessionCountingSmoke = () => {
      if (state.logsMonthCount !== 2) throw new Error('Expected 2 monthly sessions, got ' + state.logsMonthCount);
      if (state.weeklyProgressLabel !== '2/2') throw new Error('Expected 2/2 weekly progress, got ' + state.weeklyProgressLabel);
      if (currentWeek.sessionCount !== 2) throw new Error('Expected 2 weekly sessions, got ' + currentWeek.sessionCount);
      if (currentWeek.activeDays !== 1) throw new Error('Expected 1 active day, got ' + currentWeek.activeDays);
      if (!currentWeek.met) throw new Error('Expected the two-session target to be met');

      return {
        monthlySessions: state.logsMonthCount,
        weeklyProgress: state.weeklyProgressLabel,
        weeklySessionCount: currentWeek.sessionCount,
        activeDays: currentWeek.activeDays,
        calendarTitle: document.getElementById('calendar-cell').title,
        renderedStatus: document.getElementById('status').textContent
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
        }[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
    );
}

async function createSmokeServer() {
    const server = createServer(async (request, response) => {
        try {
            const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
            if (requestUrl.pathname === '/session-counting-smoke.html' || requestUrl.pathname === '/') {
                response.writeHead(200, {
                    'Cache-Control': 'no-store',
                    'Content-Type': 'text/html; charset=utf-8',
                });
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
            });
            response.end(body);
        } catch (error) {
            response.writeHead(error.code === 'ENOENT' ? 404 : 500);
            response.end(error.code === 'ENOENT' ? 'Not Found' : 'Internal Server Error');
        }
    });

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    return { server, url: `http://127.0.0.1:${address.port}/session-counting-smoke.html` };
}

class CdpClient {
    constructor(url) {
        this.nextId = 1;
        this.pending = new Map();
        this.socket = new WebSocket(url);
        this.openPromise = new Promise((resolve, reject) => {
            this.socket.once('open', resolve);
            this.socket.once('error', reject);
        });
        this.socket.on('message', data => {
            const message = JSON.parse(String(data));
            if (!message.id || !this.pending.has(message.id)) return;

            const pending = this.pending.get(message.id);
            this.pending.delete(message.id);
            if (message.error) pending.reject(new Error(message.error.message));
            else pending.resolve(message.result || {});
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
            // Try the next candidate.
        }
    }

    throw new Error(`Chrome executable not found; tried ${CHROME_PATH_CANDIDATES.join(', ')}`);
}

async function waitForEndpoint(url, timeout = 30_000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(url);
            if (response.ok) return;
        } catch {
            // Chrome is still starting.
        }
        await sleep(100);
    }

    throw new Error(`Browser endpoint did not start: ${url}`);
}

async function openChrome(url, profileDirectory) {
    const chromePath = await resolveChromePath();
    const chrome = spawn(
        chromePath,
        [
            '--headless=new',
            '--disable-gpu',
            '--use-angle=swiftshader',
            '--disable-dev-shm-usage',
            '--disable-gpu-compositing',
            '--disable-gpu-rasterization',
            '--disable-software-rasterizer',
            '--disable-accelerated-2d-canvas',
            '--disable-features=VizDisplayCompositor',
            '--no-sandbox',
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
    chrome.stderr.on('data', data => process.stderr.write(`[session-counting-smoke] Chrome: ${String(data)}`));

    await waitForEndpoint(`http://127.0.0.1:${CHROME_DEBUG_PORT}/json/version`);
    const deadline = Date.now() + 30_000;
    let target;
    while (Date.now() < deadline) {
        const targets = await fetch(`http://127.0.0.1:${CHROME_DEBUG_PORT}/json/list`).then(response =>
            response.json()
        );
        target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl && item.url.startsWith(url));
        if (target) break;
        await sleep(100);
    }

    if (!target) throw new Error('Chromium page target did not start');

    const client = new CdpClient(target.webSocketDebuggerUrl);
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    return { chrome, client };
}

async function waitForReady(client, timeout = 20_000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        try {
            if (await client.evaluate('window.__sessionCountingSmokeReady === true')) return;
        } catch {
            // Module scripts may still be loading.
        }
        await sleep(100);
    }

    throw new Error('Timed out waiting for session-counting smoke fixture');
}

async function runSmoke() {
    const { server, url } = await createSmokeServer();
    const profileDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'gym-session-counting-chromium-'));
    let browser;

    try {
        browser = await openChrome(url, profileDirectory);
        await waitForReady(browser.client);
        const state = await browser.client.evaluate('window.runSessionCountingSmoke()');
        const screenshot = await browser.client.send('Page.captureScreenshot', {
            format: 'png',
            captureBeyondViewport: true,
        });
        const screenshotPath = path.join(EVIDENCE_DIRECTORY, '2026-09-17-gym-session-counting-chromium.png');
        const evidencePath = path.join(EVIDENCE_DIRECTORY, '2026-09-17-gym-session-counting-chromium.json');
        await fs.mkdir(EVIDENCE_DIRECTORY, { recursive: true });
        await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));

        const evidence = {
            browser: 'Chromium',
            state,
            screenshot: path.relative(ROOT, screenshotPath),
        };
        await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
        console.log(JSON.stringify({ ...evidence, evidence: path.relative(ROOT, evidencePath) }, null, 2));
    } finally {
        browser?.client.close();
        browser?.chrome.kill();
        await fs.rm(profileDirectory, { recursive: true, force: true }).catch(() => {});
        await new Promise(resolve => server.close(resolve));
    }
}

runSmoke().catch(error => {
    console.error(`[session-counting-smoke] ${error.stack || error.message}`);
    process.exitCode = 1;
});
