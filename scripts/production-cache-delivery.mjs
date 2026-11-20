#!/usr/bin/env node

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { execute } from './cloudflare-cache-control.mjs';
import { createDeploymentGuard, DELIVERY_TARGETS, validateSha } from './github-pages-deployment.mjs';
import { runSmoke } from './production-release-smoke.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const execFileAsync = promisify(execFile);

async function readHead(directory) {
    return (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: directory })).stdout.trim();
}

export async function deliverProductionCache({
    target = process.env.CLOUDFLARE_CACHE_TARGET || 'gym',
    targetSha = process.env.DEPLOYMENT_TARGET_SHA,
    controlSha = process.env.DEPLOYMENT_CONTROL_SHA,
    expectedRevision = process.env.CLOUDFLARE_EXPECTED_REVISION || '',
    controlRoot = ROOT,
    targetRoot = null,
    evidencePath = process.env.PRODUCTION_SMOKE_EVIDENCE_PATH,
    getHead = readHead,
    guard = null,
    purge = execute,
    smoke = runSmoke,
    now = Date.now,
} = {}) {
    if (evidencePath) await fs.rm(evidencePath, { force: true });
    const evidence = { status: 'failed', target, targetSha, controlSha, checks: [] };
    try {
        const config = DELIVERY_TARGETS[target];
        if (!config) throw new Error('delivery target must be gym or portfolio');
        validateSha(targetSha);
        validateSha(controlSha, 'control-plane SHA');
        targetRoot ||= path.resolve(controlRoot, '..', config.directory);
        if ((await getHead(controlRoot)) !== controlSha) throw new Error('control-plane checkout does not match its immutable SHA');
        if ((await getHead(targetRoot)) !== targetSha) throw new Error('target checkout does not match the intended deployment SHA');
        const metadata = JSON.parse(await fs.readFile(path.join(targetRoot, config.metadataFile), 'utf8'));
        const revisionPattern = target === 'gym' ? /^v\d+\.\d+\.\d+$/ : /^[a-f0-9]{12}-[a-f0-9]{12}$/;
        if (typeof metadata.revision !== 'string' || !revisionPattern.test(metadata.revision)) {
            throw new Error('target manifest has no immutable application revision');
        }
        if (expectedRevision && expectedRevision !== metadata.revision) throw new Error('expected revision does not match the immutable target manifest');
        expectedRevision = metadata.revision;
        Object.assign(evidence, {
            expectedRevision,
            repository: config.repository,
            startedAt: new Date(now()).toISOString(),
            workflowRunUrl: process.env.GITHUB_RUN_ID
                ? `https://github.com/metalfurius/gym/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
        });
        guard ||= createDeploymentGuard({ target, targetSha, now });
        const recordCheck = async stage => {
            const deployment = await guard.assertCurrent();
            evidence.checks.push({ stage, ...deployment });
        };
        evidence.checks.push({ stage: 'ready', ...(await guard.waitUntilReady()) });
        evidence.purge = await purge({
            target,
            expectedRevision,
            metadata,
            beforePurge: () => recordCheck('before-purge-batch'),
        });
        evidence.canonical = await smoke({
            target,
            targetRoot,
            expectedRevision,
            evidencePath: null,
            beforeSweep: () => recordCheck('before-canonical-sweep'),
        });
        await recordCheck('before-success');
        evidence.status = 'passed';
        evidence.completedAt = new Date(now()).toISOString();
        if (evidencePath) await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
        return evidence;
    } catch (error) {
        evidence.status = 'failed';
        // A canonical-only pass cannot be mistaken for successful delivery after a stale-run rejection.
        if (evidence.canonical) evidence.canonical.status = 'delivery-rejected';
        evidence.error = error.message;
        if (error.sweeps) evidence.sweeps = error.sweeps;
        evidence.completedAt = new Date(now()).toISOString();
        if (evidencePath) await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
        throw error;
    }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    deliverProductionCache().then(evidence => {
        console.log(`[pages-delivery] passed ${evidence.target} ${evidence.targetSha} (${evidence.expectedRevision})`);
    }).catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
