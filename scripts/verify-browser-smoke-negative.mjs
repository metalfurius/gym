#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { browserEvidenceDirectory } from './browser-fixture-runner.mjs';
import { spawnOwnedBrowser } from './owned-browser-process.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function run() {
    const kind = process.argv[2];
    assert.ok(['chromium', 'firefox'].includes(kind), 'Choose chromium or firefox');
    const directory = path.join(browserEvidenceDirectory('negative-check'), 'negative');
    await fs.mkdir(directory, { recursive: true });
    let owner;
    let timer;
    let failure;
    const result = { status: 'running', browser: kind, startedAt: new Date().toISOString() };
    try {
        // The child uses the real fixture and assertions. Deliberately malformed browser
        // output must fail that runner before this checker can report success.
        owner = spawnOwnedBrowser(process.execPath, [path.join(ROOT, 'scripts/browser-numeric-input-smoke.mjs')], {
            env: { ...process.env, NUMERIC_SMOKE_BROWSER: kind,
                BROWSER_SMOKE_NEGATIVE_CASE: 'invalid-reps', BROWSER_SMOKE_EVIDENCE_DIR: directory },
            // On POSIX the child owns its browser in another process group. Let
            // its bounded signal cleanup finish before terminating this wrapper.
            terminationTimeoutMs: 15_000,
        });
        let stderr = '';
        owner.process.stderr.on('data', bytes => { stderr = (stderr + String(bytes)).slice(-30_000); });
        const exitCode = await new Promise((resolve, reject) => {
            owner.process.once('error', reject);
            owner.process.once('close', (code, signal) => signal
                ? reject(new Error(`Negative runner ended with ${signal}`)) : resolve(code));
            timer = setTimeout(() => reject(new Error('Negative runner exceeded its 90-second deadline')), 90_000);
        });
        result.exitCode = exitCode;
        result.stderr = stderr;
        assert.equal(exitCode, 1, 'The negative browser runner must return exit 1');
        assert.match(stderr, /valid repetition correction did not clear validation/);
        const evidence = JSON.parse(await fs.readFile(path.join(directory, kind, 'evidence.json'), 'utf8'));
        assert.equal(evidence.status, 'failed');
        assert.equal(evidence.negativeCase, 'invalid-reps');
        assert.equal(evidence.state.correctedReps.value, '8.5');
        assert.ok(evidence.browserVersion.product);
        assert.ok(!evidence.cleanupError, 'Negative browser cleanup failed');
        const png = await fs.readFile(path.join(directory, kind, 'failure.png'));
        assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
        const trace = JSON.parse(await fs.readFile(path.join(directory, kind, 'trace.json'), 'utf8'));
        assert.ok(trace.length > 0, 'Negative browser trace is empty');
        result.status = 'passed';
    } catch (error) {
        result.status = 'failed';
        result.error = error.stack || error.message;
        failure = error;
    } finally {
        clearTimeout(timer);
        try { await owner?.close(); }
        catch (error) { result.status = 'failed'; result.cleanupError = error.message; failure ||= error; }
        finally {
            result.completedAt = new Date().toISOString();
            await fs.writeFile(path.join(directory, `negative-check-${kind}.json`), `${JSON.stringify(result, null, 2)}\n`);
        }
    }
    if (failure) throw failure;
    console.log(`[negative-check] ${kind}: real runner returned 1 with failed evidence, screenshot and trace`);
}

run().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
