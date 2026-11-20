/** @jest-environment node */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { deliverProductionCache } from '../../scripts/production-cache-delivery.mjs';

const TARGET_SHA = 'a'.repeat(40);
const CONTROL_SHA = 'b'.repeat(40);
const directories = [];

async function fixture(target = 'gym') {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cache-delivery-test-'));
    directories.push(directory);
    const targetRoot = path.join(directory, 'target');
    const controlRoot = path.join(directory, 'control');
    await fs.mkdir(targetRoot);
    const metadata = { revision: target === 'gym' ? 'v2.8.3' : 'a'.repeat(12) + '-' + 'b'.repeat(12) };
    await fs.writeFile(path.join(targetRoot, target === 'gym' ? 'release.json' : 'site-revision.json'), JSON.stringify(metadata));
    const snapshot = { targetSha: TARGET_SHA, deploymentId: 10, state: 'success' };
    const guard = { waitUntilReady: jest.fn(async () => snapshot), assertCurrent: jest.fn(async () => snapshot) };
    const purge = jest.fn(async options => {
        await options.beforePurge();
        return { purgeIds: ['confirmed-purge'], release: options.expectedRevision };
    });
    const smoke = jest.fn(async options => {
        await options.beforeSweep();
        await options.beforeSweep();
        return { status: 'passed', revision: options.expectedRevision, sweeps: [{ status: 'passed' }, { status: 'passed' }] };
    });
    return { metadata, guard, purge, smoke, options: {
        target, targetRoot, controlRoot, targetSha: TARGET_SHA, controlSha: CONTROL_SHA,
        getHead: jest.fn(async root => root === controlRoot ? CONTROL_SHA : TARGET_SHA),
        evidencePath: path.join(directory, 'evidence.json'), guard, purge, smoke,
    } };
}

afterEach(async () => {
    for (const directory of directories.splice(0)) await fs.rm(directory, { recursive: true, force: true });
});

describe('immutable cache delivery coordinator', () => {
    it.each(['gym', 'portfolio'])('binds %s metadata, purge, smoke, deployment and artifact to exact SHAs', async target => {
        const { options, metadata, purge, smoke } = await fixture(target);
        const evidence = await deliverProductionCache(options);
        expect(evidence).toMatchObject({ status: 'passed', targetSha: TARGET_SHA, controlSha: CONTROL_SHA, expectedRevision: metadata.revision });
        expect(evidence.checks.map(check => check.stage)).toEqual(['ready', 'before-purge-batch', 'before-canonical-sweep', 'before-canonical-sweep', 'before-success']);
        expect(purge.mock.calls[0][0]).toMatchObject({ target, expectedRevision: metadata.revision, metadata });
        expect(smoke.mock.calls[0][0]).toMatchObject({ target, targetRoot: options.targetRoot, expectedRevision: metadata.revision, evidencePath: null });
    });

    it('fails before any purge or smoke when deployment readiness fails', async () => {
        const { options, guard, purge, smoke } = await fixture();
        guard.waitUntilReady.mockRejectedValue(new Error('matching Pages deployment failed'));
        await expect(deliverProductionCache(options)).rejects.toThrow('deployment failed');
        expect(purge).not.toHaveBeenCalled();
        expect(smoke).not.toHaveBeenCalled();
        expect(JSON.parse(await fs.readFile(options.evidencePath, 'utf8')).status).toBe('failed');
    });

    it('refuses a superseded deployment immediately before purge', async () => {
        const { options, guard, smoke } = await fixture();
        guard.assertCurrent.mockRejectedValue(new Error('superseded before purge'));
        await expect(deliverProductionCache(options)).rejects.toThrow('superseded');
        expect(smoke).not.toHaveBeenCalled();
    });

    it('rejects success if a newer release arrived during the canonical sweeps', async () => {
        const { options, guard } = await fixture();
        guard.assertCurrent.mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce({})
            .mockRejectedValueOnce(new Error('superseded before success'));
        await expect(deliverProductionCache(options)).rejects.toThrow('before success');
        const evidence = JSON.parse(await fs.readFile(options.evidencePath, 'utf8'));
        expect(evidence.status).toBe('failed');
        expect(evidence.canonical.status).toBe('delivery-rejected');
    });

    it('refuses a mismatched target checkout and a mismatched explicit revision', async () => {
        const { options, purge, guard } = await fixture();
        await expect(deliverProductionCache({ ...options, getHead: async () => CONTROL_SHA })).rejects.toThrow('target checkout');
        await expect(deliverProductionCache({ ...options, expectedRevision: 'v2.8.2' })).rejects.toThrow('immutable target manifest');
        expect(guard.waitUntilReady).not.toHaveBeenCalled();
        expect(purge).not.toHaveBeenCalled();
    });
});
