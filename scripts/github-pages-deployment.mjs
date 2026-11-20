import process from 'node:process';

export const DELIVERY_TARGETS = {
    gym: { repository: 'metalfurius/gym', directory: 'target-gym', metadataFile: 'release.json' },
    portfolio: { repository: 'metalfurius/metalfurius.github.io', directory: 'target-portfolio', metadataFile: 'site-revision.json' },
};
const ENVIRONMENT = 'github-pages';
const TERMINAL_FAILURES = new Set(['error', 'failure', 'inactive']);
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function fail(message) {
    throw new Error(`[pages-delivery] ${message}`);
}

export function validateSha(sha, label = 'target SHA') {
    if (!/^[a-f0-9]{40}$/.test(sha || '')) fail(`${label} must be a full immutable 40-character commit SHA`);
    return sha;
}

export async function githubRequest(requestPath, token = process.env.GITHUB_TOKEN) {
    if (!token || /\s/.test(token)) fail('GITHUB_TOKEN is missing or malformed');
    const response = await fetch(`https://api.github.com${requestPath}`, {
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) fail(`GET ${requestPath} failed with HTTP ${response.status}`);
    return response.json();
}

export function createDeploymentGuard({ target, targetSha, request = githubRequest, now = Date.now } = {}) {
    const config = DELIVERY_TARGETS[target];
    if (!config) fail('target must be gym or portfolio');
    validateSha(targetSha);
    const prefix = `/repos/${config.repository}`;
    let readyDeploymentId = null;

    async function inspect({ requireSuccess = false } = {}) {
        const main = await request(`${prefix}/git/ref/heads/main`);
        if (main?.object?.sha !== targetSha) {
            fail(`target ${targetSha} was superseded by main ${main?.object?.sha || 'unknown'}; refusing delivery`);
        }
        const deployments = await request(`${prefix}/deployments?environment=${ENVIRONMENT}&per_page=100`);
        if (!Array.isArray(deployments)) fail('GitHub did not return a deployment list');
        const ordered = deployments
            .filter(deployment => deployment.environment === ENVIRONMENT)
            .sort((left, right) => right.id - left.id);
        for (const deployment of ordered) {
            if (!Number.isSafeInteger(deployment.id) || deployment.id <= 0) fail('GitHub returned an invalid deployment id');
        }
        const matching = ordered.find(deployment => deployment.sha === targetSha);
        if (!matching) {
            if (requireSuccess) fail(`no ${ENVIRONMENT} deployment exists for ${targetSha}`);
            return { state: 'waiting-for-deployment', checkedAt: new Date(now()).toISOString(), targetSha };
        }
        if (ordered[0].id !== matching.id || (readyDeploymentId !== null && readyDeploymentId !== matching.id)) {
            fail(`deployment ${matching.id} for ${targetSha} was superseded by deployment ${ordered[0].id}`);
        }
        const statuses = await request(`${prefix}/deployments/${matching.id}/statuses?per_page=1`);
        if (!Array.isArray(statuses)) fail(`GitHub did not return statuses for deployment ${matching.id}`);
        const status = statuses[0];
        const state = status?.state || 'pending';
        if (TERMINAL_FAILURES.has(state)) fail(`deployment ${matching.id} for ${targetSha} has state ${state}`);
        if (requireSuccess && state !== 'success') fail(`deployment ${matching.id} is no longer successful (${state})`);
        if (state === 'success') readyDeploymentId = matching.id;
        return {
            repository: config.repository,
            environment: ENVIRONMENT,
            deploymentId: matching.id,
            targetSha,
            state,
            statusId: status?.id || null,
            statusCreatedAt: status?.created_at || null,
            environmentUrl: status?.environment_url || null,
            logUrl: status?.log_url || null,
            checkedAt: new Date(now()).toISOString(),
        };
    }

    return {
        assertCurrent: () => inspect({ requireSuccess: true }),
        async waitUntilReady({ timeoutMs = 600_000, pollIntervalMs = 5_000, sleepFn = sleep } = {}) {
            if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isFinite(pollIntervalMs) || pollIntervalMs <= 0) {
                fail('deployment timeout and polling interval must be positive');
            }
            const deadline = now() + timeoutMs;
            let last;
            do {
                last = await inspect();
                if (last.state === 'success') return last;
                const remaining = deadline - now();
                if (remaining <= 0) break;
                await sleepFn(Math.min(pollIntervalMs, remaining));
            } while (now() <= deadline);
            fail(`timed out waiting for successful ${ENVIRONMENT} deployment of ${targetSha} (last state ${last?.state || 'unknown'})`);
        },
    };
}
