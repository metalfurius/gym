import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.env.OUTBOX_SMOKE_EVIDENCE_DIR || path.join(root, 'tmp', 'outbox-cleanup-negative', String(Date.now())));
const child = spawn(process.execPath, [path.join(root, 'scripts/browser-outbox-smoke.mjs')], {
    cwd: root, env: { ...process.env, OUTBOX_SMOKE_EVIDENCE_DIR: output, OUTBOX_SMOKE_NEGATIVE_CASE: 'cleanup-owner' },
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
let stdout = ''; let stderr = '';
child.stdout.on('data', bytes => { stdout += bytes; }); child.stderr.on('data', bytes => { stderr += bytes; });
const exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, 'stdout.txt'), stdout); await fs.writeFile(path.join(output, 'stderr.txt'), stderr);
const evidence = JSON.parse(await fs.readFile(path.join(output, 'result.json'), 'utf8'));
const trace = JSON.parse(await fs.readFile(path.join(output, 'trace.json'), 'utf8'));
assert.equal(exitCode, 1); assert.equal(evidence.status, 'failed'); assert.equal(evidence.primaryError, undefined);
assert(evidence.cleanupErrors.some(error => error.stage === 'cleanup-owner' && error.message.includes('Deliberately injected')));
assert(trace.some(event => event.method === 'OutboxSmoke.stage' && event.params.runId === evidence.runId && event.params.stage === 'cleanup-server' && event.params.status === 'done'));
const verification = { status: 'passed', mode: 'real Chromium child; injected owner-close exception after actual owner cleanup', childExitCode: exitCode,
    evidenceStatus: evidence.status, traceExists: true, cleanupErrors: evidence.cleanupErrors.map(error => error.stage) };
await fs.writeFile(path.join(output, 'negative-verification.json'), `${JSON.stringify(verification, null, 2)}\n`);
console.log(JSON.stringify(verification));
