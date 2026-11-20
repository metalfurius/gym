import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { openSmokeBrowser, removeSmokeProfile, waitForSmoke } from './browser-smoke-driver.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function browserEvidenceDirectory(name) {
    return path.resolve(process.env.BROWSER_SMOKE_EVIDENCE_DIR || path.join(ROOT, 'tmp', 'browser-gates',
        `${name}-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`));
}

export async function runBrowserFixture({ name, kind, url, readiness, expression, assertState, evidenceDirectory }) {
    const output = path.join(evidenceDirectory, kind);
    await fs.mkdir(output, { recursive: true });
    const evidence = { status: 'running', name, browser: kind, syntheticDataOnly: true, startedAt: new Date().toISOString(),
        nodeVersion: process.version, platform: process.platform, negativeCase: process.env.BROWSER_SMOKE_NEGATIVE_CASE || null,
        checkoutSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim() };
    await fs.writeFile(path.join(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    const trace = [];
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(new Error('Browser fixture exceeded its 60-second deadline')), 60_000);
    deadline.unref();
    let profile;
    let browser;
    let failure;
    try {
        profile = await fs.mkdtemp(path.join(os.tmpdir(), `gym-smoke-${name}-${kind}-`));
        browser = await openSmokeBrowser(kind, url, profile,
            event => trace.push({ receivedAt: new Date().toISOString(), ...event }), controller.signal);
        evidence.browserVersion = browser.version;
        evidence.ownedDebugPort = browser.port;
        await waitForSmoke(browser.client, readiness, controller.signal);
        if (process.env.BROWSER_SMOKE_NEGATIVE_CASE) {
            if (process.env.BROWSER_SMOKE_NEGATIVE_CASE !== 'invalid-reps') throw new Error('Unknown browser negative case');
            if (name !== 'numeric-input') throw new Error('The invalid-reps negative case requires the numeric fixture');
            await browser.client.evaluate(`(() => {
                const original = window.runNumericInputSmoke;
                window.runNumericInputSmoke = () => {
                    const state = original();
                    state.correctedReps = { value: '8.5', ariaInvalid: null };
                    document.getElementById('status').textContent = 'Deliberate malformed-reps negative case';
                    return state;
                };
            })()`);
        }
        evidence.state = await browser.client.evaluate(expression);
        await assertState({ browser: kind, state: evidence.state });
        const screenshot = await browser.client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        await fs.writeFile(path.join(output, 'passed.png'), Buffer.from(screenshot.data, 'base64'));
    } catch (error) {
        failure = error;
        evidence.error = error.stack || error.message;
        if (error.browserDiagnostics) evidence.browserProcess = error.browserDiagnostics;
        if (error.browserCleanupError) evidence.cleanupError = error.browserCleanupError;
        if (browser) {
            try {
                evidence.failurePage = await browser.client.evaluate('({ url: location.href, title: document.title, text: document.body.innerText })');
                const screenshot = await browser.client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
                await fs.writeFile(path.join(output, 'failure.png'), Buffer.from(screenshot.data, 'base64'));
            } catch (captureError) { evidence.captureError = captureError.message; }
        }
    } finally {
        try {
            if (browser) await browser.owner.close();
            else if (profile) await removeSmokeProfile(profile);
        } catch (error) { failure ||= error; evidence.cleanupError = error.message; }
        clearTimeout(deadline);
        if (controller.signal.aborted) { failure ||= controller.signal.reason; evidence.deadlineError = controller.signal.reason.message; }
        evidence.status = failure ? 'failed' : 'passed';
        evidence.completedAt = new Date().toISOString();
        await fs.writeFile(path.join(output, 'trace.json'), `${JSON.stringify(trace, null, 2)}\n`);
        await fs.writeFile(path.join(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    }
    if (failure) throw failure;
    console.log(`[${name}] ${kind} passed ${browser.version.product}; artifacts ${output}`);
    return evidence;
}
