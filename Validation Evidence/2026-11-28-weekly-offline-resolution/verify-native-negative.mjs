import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const recipeDirectory = 'Validation Evidence/2026-11-28-weekly-offline-resolution';
const directory = path.resolve(process.env.WEEKLY_RESOLUTION_EVIDENCE_DIR || recipeDirectory);
const output = path.resolve(directory, 'native-cleanup-negative');
const verificationOutput = path.resolve(directory, 'native-cleanup-negative-verifier');
await fs.mkdir(verificationOutput);
try { await fs.access(output); throw new Error('Negative output already exists'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const child = spawn(process.execPath, [path.resolve(recipeDirectory, 'native-weekly-resolution.mjs'), '--negative-cleanup'], {
    cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], signal: AbortSignal.timeout(100_000),
});
let stdout = '', stderr = '';
child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
const exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
await fs.writeFile(path.join(verificationOutput, 'stdout.txt'), stdout); await fs.writeFile(path.join(verificationOutput, 'stderr.txt'), stderr);
const childSummary = JSON.parse(stdout.trim());
assert.equal(path.resolve(childSummary.output), output); assert.equal(childSummary.status, 'failed');
const result = JSON.parse(await fs.readFile(path.join(output, 'result.json'), 'utf8'));
const trace = JSON.parse(await fs.readFile(path.join(output, 'trace.json'), 'utf8'));
assert.equal(exitCode, 1); assert.equal(result.status, 'failed'); assert.equal(result.error, undefined);
assert.equal(result.runnerSha256Lf, crypto.createHash('sha256').update((await fs.readFile(path.join(recipeDirectory, 'native-weekly-resolution.mjs'), 'utf8')).replace(/\r\n?/g, '\n')).digest('hex'));
assert.deepEqual(result.cleanupErrors, [{ step: 'browser', message: 'Injected owner-close failure after actual cleanup' }]);
assert.equal(result.afterReplay.oldOutcome, 'resolved'); assert.equal(result.afterReplay.newOutcome, 'accepted');
assert.ok(trace.some(item => item.params?.runId === result.runId && item.params.stage === 'assertions-passed'));
assert.ok(trace.some(item => item.params?.runId === result.runId && item.params.stage === 'server' && item.params.status === 'done'));
const verification = { status: 'passed', runId: result.runId, childExitCode: exitCode, childEvidenceStatus: result.status,
    primaryError: null, cleanupErrors: result.cleanupErrors, traceExists: true,
    scope: 'Actual native child assertions completed; deliberate owner-close exception follows real owner cleanup; final child status is failed' };
await fs.writeFile(path.join(verificationOutput, 'negative-verification.json'), `${JSON.stringify(verification, null, 2)}\n`);
console.log(JSON.stringify(verification));
