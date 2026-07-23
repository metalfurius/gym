import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { cloudflareRequest, execute } from '../../scripts/cloudflare-cache-control.mjs';

const ACCOUNT_ID = 'a'.repeat(32);
const ZONE_ID = 'b'.repeat(32);
const RULESET_ID = 'c'.repeat(32);
const RULE_ID = 'd'.repeat(32);
const release = {
    schemaVersion: 1,
    version: '2.7.5',
    revision: 'v2.7.5',
    cacheName: 'gym-tracker-v2.7.5',
    assets: {
        'js/progress.js': 'progress-hash',
    },
};

function success(result) {
    return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, result }),
    };
}

function failure(status, code = 1000) {
    return {
        ok: false,
        status,
        json: async () => ({ success: false, errors: [{ code, message: 'test failure' }] }),
    };
}

function targetRule(overrides = {}) {
    return {
        id: RULE_ID,
        ref: 'gym-pwa-fixed-cache-policy-v1',
        description: 'Bypass Cloudflare caching for Gym release delivery',
        expression: '(http.host eq "codeoverdose.es" and starts_with(http.request.uri.path, "/gym/"))',
        action: 'set_cache_settings',
        action_parameters: { cache: false },
        enabled: true,
        ...overrides,
    };
}

function makeFetch({ entrypoint }) {
    const requests = [];
    let createdRule = null;
    const fetchMock = jest.fn(async (url, options = {}) => {
        const parsedUrl = new URL(url);
        const method = options.method || 'GET';
        requests.push({ url: parsedUrl, method, options });

        if (parsedUrl.pathname === '/client/v4/zones') {
            return success([{ name: 'codeoverdose.es', id: ZONE_ID, account: { id: ACCOUNT_ID } }]);
        }
        if (parsedUrl.pathname === `/client/v4/accounts/${ACCOUNT_ID}/tokens/verify`) {
            return success({ id: 'e'.repeat(32), status: 'active' });
        }
        if (
            parsedUrl.pathname === `/client/v4/zones/${ZONE_ID}/rulesets/phases/http_request_cache_settings/entrypoint`
        ) {
            if (entrypoint === 'missing' && !createdRule) return failure(404);
            return success({ id: RULESET_ID, rules: createdRule ? [createdRule] : [targetRule()] });
        }
        if (parsedUrl.pathname === `/client/v4/zones/${ZONE_ID}/rulesets` && method === 'POST') {
            createdRule = { ...JSON.parse(options.body).rules[0], id: RULE_ID };
            return success({ id: RULESET_ID, rules: [createdRule] });
        }
        if (parsedUrl.pathname === `/client/v4/zones/${ZONE_ID}/rulesets/${RULESET_ID}/rules` && method === 'POST') {
            createdRule = { ...JSON.parse(options.body), id: RULE_ID };
            delete createdRule.position;
            return success({ id: RULESET_ID, rules: [createdRule] });
        }
        if (parsedUrl.pathname === `/client/v4/zones/${ZONE_ID}/purge_cache` && method === 'POST') {
            return success({ id: 'purge-operation' });
        }
        throw new Error(`unexpected request ${method} ${parsedUrl.pathname}`);
    });
    return { fetchMock, requests };
}

describe('Cloudflare cache control', () => {
    const originalFetch = globalThis.fetch;
    const originalAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;

    beforeEach(() => {
        delete process.env.CLOUDFLARE_ACCOUNT_ID;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        if (originalAccountId === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
        else process.env.CLOUDFLARE_ACCOUNT_ID = originalAccountId;
    });

    it('verifies the account-token endpoint, reconciles the fixed policy, and purges only canonical URLs', async () => {
        const { fetchMock, requests } = makeFetch({ entrypoint: 'missing' });
        globalThis.fetch = fetchMock;

        const result = await execute({
            token: 'test-account-token',
            release,
            request: (token, requestPath, options) => cloudflareRequest(token, requestPath, options),
        });

        expect(result.accountId).toBe(ACCOUNT_ID);
        expect(result.policy.operation).toBe('created');
        expect(result.urlCount).toBe(6);
        expect(requests.map(request => request.url.pathname)).toContain(
            `/client/v4/accounts/${ACCOUNT_ID}/tokens/verify`
        );
        expect(requests.map(request => request.url.pathname)).not.toContain('/client/v4/user/tokens/verify');

        const purgeRequest = requests.find(request => request.url.pathname.endsWith('/purge_cache'));
        const purgeBody = JSON.parse(purgeRequest.options.body);
        expect(purgeBody.files).toHaveLength(6);
        expect(purgeBody.files.every(url => url.startsWith('https://codeoverdose.es/gym/'))).toBe(true);
        expect(purgeBody.files.some(url => url.includes('?'))).toBe(false);
        expect(
            requests.find(request => request.url.pathname.includes('/tokens/verify')).options.headers.Authorization
        ).toBe('Bearer test-account-token');
    });

    it('does not rewrite an already-correct policy before purging', async () => {
        const { fetchMock, requests } = makeFetch({ entrypoint: 'present' });
        globalThis.fetch = fetchMock;

        const result = await execute({
            token: 'test-account-token',
            release,
            request: (token, requestPath, options) => cloudflareRequest(token, requestPath, options),
        });

        expect(result.policy.operation).toBe('verified');
        expect(
            requests.some(
                request => request.method === 'POST' && request.url.pathname === `/client/v4/zones/${ZONE_ID}/rulesets`
            )
        ).toBe(false);
        expect(
            requests.some(
                request => request.method === 'POST' && request.url.pathname.endsWith(`/rulesets/${RULESET_ID}/rules`)
            )
        ).toBe(false);
    });
});
