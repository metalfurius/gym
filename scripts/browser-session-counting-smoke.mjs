#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { browserEvidenceDirectory, runBrowserFixture } from './browser-fixture-runner.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

async function run() {
    const smokeServer = await createSmokeServer();
    try {
        await runBrowserFixture({ name: 'session-counting', kind: 'chromium', url: smokeServer.url,
            evidenceDirectory: browserEvidenceDirectory('session-counting'),
            readiness: 'window.__sessionCountingSmokeReady === true', expression: 'window.runSessionCountingSmoke()',
            assertState: ({ state }) => {
                assert.equal(state.monthlySessions, 2); assert.equal(state.weeklyProgress, '2/2');
                assert.equal(state.weeklySessionCount, 2); assert.equal(state.activeDays, 1);
                assert.equal(state.renderedStatus, 'Ready'); assert.match(state.calendarTitle, /2 sessions/);
            } });
    } finally {
        smokeServer.server.closeAllConnections();
        await new Promise(resolve => smokeServer.server.close(resolve));
    }
}

run().catch(error => { console.error(`[session-counting] ${error.stack || error.message}`); process.exitCode = 1; });
