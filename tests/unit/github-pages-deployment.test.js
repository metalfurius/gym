/** @jest-environment node */
import { describe, expect, it, jest } from '@jest/globals';
import { createDeploymentGuard } from '../../scripts/github-pages-deployment.mjs';

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const deployment = (id = 10, sha = SHA) => ({ id, sha, environment: 'github-pages' });

function fixture({ snapshots = [[deployment()]], states = ['success'], heads = [SHA], target = 'gym' } = {}) {
    let clock = Date.UTC(2026, 10, 20);
    let poll = -1;
    const requests = [];
    const request = jest.fn(async requestPath => {
        requests.push(requestPath);
        if (requestPath.endsWith('/git/ref/heads/main')) {
            poll += 1;
            return { object: { sha: heads[Math.min(poll, heads.length - 1)] } };
        }
        if (requestPath.includes('/deployments?')) return snapshots[Math.min(poll, snapshots.length - 1)];
        if (requestPath.includes('/statuses?')) return [{ id: 100, state: states[Math.min(poll, states.length - 1)] }];
        throw new Error(`unexpected request ${requestPath}`);
    });
    const sleepFn = jest.fn(async milliseconds => { clock += milliseconds; });
    return {
        guard: createDeploymentGuard({ target, targetSha: SHA, request, now: () => clock }),
        sleepFn, requests,
    };
}

describe('exact GitHub Pages deployment readiness', () => {
    it('waits through absent/pending/in-progress deployments and accepts only matching success', async () => {
        const { guard, sleepFn, requests } = fixture({
            snapshots: [[], [deployment()], [deployment()], [deployment()]],
            states: ['pending', 'pending', 'in_progress', 'success'],
        });
        const result = await guard.waitUntilReady({ timeoutMs: 100, pollIntervalMs: 10, sleepFn });
        expect(result).toMatchObject({ deploymentId: 10, targetSha: SHA, state: 'success', environment: 'github-pages' });
        expect(sleepFn).toHaveBeenCalledTimes(3);
        expect(requests).toContain('/repos/metalfurius/gym/deployments/10/statuses?per_page=1');
    });

    it.each(['failure', 'error', 'inactive'])('fails immediately on matching deployment state %s', async state => {
        const { guard, sleepFn } = fixture({ states: [state] });
        await expect(guard.waitUntilReady({ sleepFn })).rejects.toThrow(`state ${state}`);
        expect(sleepFn).not.toHaveBeenCalled();
    });

    it('never accepts successful status of another SHA and times out with a diagnostic', async () => {
        const { guard, sleepFn, requests } = fixture({ snapshots: [[deployment(9, OTHER_SHA)]] });
        await expect(guard.waitUntilReady({ timeoutMs: 20, pollIntervalMs: 10, sleepFn })).rejects.toThrow('waiting-for-deployment');
        expect(requests.some(value => value.includes('/statuses'))).toBe(false);
    });

    it('times out pending readiness instead of treating the wait as success', async () => {
        const { guard, sleepFn } = fixture({ states: ['in_progress'] });
        await expect(guard.waitUntilReady({ timeoutMs: 20, pollIntervalMs: 10, sleepFn })).rejects.toThrow('last state in_progress');
    });

    it('rejects a newer deployment even when the intended deployment succeeded', async () => {
        const { guard } = fixture({ snapshots: [[deployment(), deployment(11, OTHER_SHA)]] });
        await expect(guard.waitUntilReady()).rejects.toThrow('superseded by deployment 11');
    });

    it('rejects old queued runs as soon as main advances, before a newer Pages deployment exists', async () => {
        const { guard } = fixture({ heads: [OTHER_SHA] });
        await expect(guard.waitUntilReady()).rejects.toThrow('superseded by main');
    });

    it('rechecks freshness after readiness and rejects status regression', async () => {
        const { guard } = fixture({ states: ['success', 'in_progress'] });
        await guard.waitUntilReady();
        await expect(guard.assertCurrent()).rejects.toThrow('no longer successful');
    });

    it('rejects a different deployment ID after readiness even for the same SHA', async () => {
        const { guard } = fixture({ snapshots: [[deployment()], [deployment(11)]] });
        await guard.waitUntilReady();
        await expect(guard.assertCurrent()).rejects.toThrow('superseded');
    });

    it('uses the fixed portfolio repository with identical readiness rules', async () => {
        const { guard, requests } = fixture({ target: 'portfolio' });
        await expect(guard.waitUntilReady()).resolves.toMatchObject({ repository: 'metalfurius/metalfurius.github.io' });
        expect(requests.every(value => value.startsWith('/repos/metalfurius/metalfurius.github.io/'))).toBe(true);
    });

    it('rejects moving refs and arbitrary target repositories', () => {
        expect(() => createDeploymentGuard({ target: 'gym', targetSha: 'main' })).toThrow('immutable');
        expect(() => createDeploymentGuard({ target: 'other', targetSha: SHA })).toThrow('target must be');
    });
});
