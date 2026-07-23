#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_BASE = 'https://api.cloudflare.com/client/v4';
const TOKEN_ENV = 'CLOUDFLARE_CACHE_API_TOKEN';
const ACCOUNT_ID_ENV = 'CLOUDFLARE_ACCOUNT_ID';
const ZONE_NAME = 'codeoverdose.es';
const PUBLIC_BASE_URL = 'https://codeoverdose.es/gym/';
const CACHE_RULE_PHASE = 'http_request_cache_settings';
const CACHE_RULE_REF = 'gym-pwa-fixed-cache-policy-v1';
const PURGE_BATCH_SIZE = 25;
const CLOUDFLARE_ID_PATTERN = /^[a-f0-9]{32}$/i;
const TARGET_CACHE_RULE = {
    ref: CACHE_RULE_REF,
    description: 'Bypass Cloudflare caching for Gym release delivery',
    expression: '(http.host eq "codeoverdose.es" and starts_with(http.request.uri.path, "/gym/"))',
    action: 'set_cache_settings',
    action_parameters: {
        cache: false,
    },
    enabled: true,
};

function fail(message) {
    throw new Error(`[cloudflare-cache] ${message}`);
}

function getToken() {
    const token = process.env[TOKEN_ENV];
    if (!token || /\s/.test(token)) {
        fail(`${TOKEN_ENV} is missing or malformed; refusing to continue`);
    }
    return token;
}

function validateCloudflareId(value, label) {
    if (!CLOUDFLARE_ID_PATTERN.test(value || '')) {
        fail(`${label} must be a 32-character Cloudflare identifier`);
    }
    return value;
}

function normalizeBaseUrl(value = PUBLIC_BASE_URL) {
    const base = new URL(value);
    if (base.search || base.hash) fail('the fixed Gym public URL must not contain a query or fragment');
    if (base.origin !== 'https://codeoverdose.es' || base.pathname !== '/gym/') {
        fail('the cache control surface is fixed to https://codeoverdose.es/gym/');
    }
    return base;
}

function getCanonicalUrls(release) {
    if (!release || typeof release !== 'object' || !release.assets || typeof release.assets !== 'object') {
        fail('release.json does not contain a usable asset manifest');
    }

    const base = normalizeBaseUrl();
    const paths = new Set(['', 'index.html', 'manifest.json', 'release.json', 'sw.js', ...Object.keys(release.assets)]);
    return [...paths].sort().map(asset => {
        if (asset && (/^[a-z][a-z\d+.-]*:/i.test(asset) || asset.startsWith('//') || asset.startsWith('/'))) {
            fail(`release asset is not a relative Gym path: ${asset}`);
        }
        const url = new URL(asset, base);
        if (url.origin !== base.origin || url.search || url.hash || !url.pathname.startsWith(base.pathname)) {
            fail(`release asset escapes the fixed Gym purge scope: ${asset}`);
        }
        return url.toString();
    });
}

async function readRelease() {
    try {
        return JSON.parse(await fs.readFile(path.join(ROOT, 'release.json'), 'utf8'));
    } catch (error) {
        fail(`could not read release.json: ${error.message}`);
    }
}

export async function cloudflareRequest(token, requestPath, options = {}) {
    let response;
    try {
        response = await fetch(`${API_BASE}${requestPath}`, {
            ...options,
            headers: {
                Accept: 'application/json',
                ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                ...(options.headers || {}),
                Authorization: `Bearer ${token}`,
            },
        });
    } catch (error) {
        fail(`${options.method || 'GET'} ${requestPath} request failed: ${error.message}`);
    }

    let payload = null;
    try {
        payload = await response.json();
    } catch {
        // Treat a non-JSON response as a failed capability check below.
    }

    if (!response.ok || !payload?.success) {
        const codes = Array.isArray(payload?.errors)
            ? payload.errors
                  .map(error => error?.code)
                  .filter(Boolean)
                  .join(',')
            : 'unknown';
        const error = new Error(
            `[cloudflare-cache] ${options.method || 'GET'} ${requestPath} failed with HTTP ${response.status} (Cloudflare error codes: ${codes})`
        );
        error.status = response.status;
        error.codes = codes;
        throw error;
    }

    return payload.result;
}

async function resolveZone(token, request = cloudflareRequest) {
    const query = new URLSearchParams({ name: ZONE_NAME, status: 'active' });
    const zones = await request(token, `/zones?${query}`);
    if (!Array.isArray(zones) || zones.length !== 1 || zones[0]?.name !== ZONE_NAME || !zones[0]?.id) {
        fail(`expected exactly one active Cloudflare zone named ${ZONE_NAME}`);
    }

    const zone = zones[0];
    return {
        id: validateCloudflareId(zone.id, 'zone id'),
        accountId: zone.account?.id ? validateCloudflareId(zone.account.id, 'zone account id') : null,
    };
}

function resolveAccountId(zoneAccountId) {
    const configuredAccountId = process.env[ACCOUNT_ID_ENV];
    if (configuredAccountId) validateCloudflareId(configuredAccountId, ACCOUNT_ID_ENV);
    if (configuredAccountId && zoneAccountId && configuredAccountId !== zoneAccountId) {
        fail(`${ACCOUNT_ID_ENV} does not match the account that owns ${ZONE_NAME}`);
    }
    return configuredAccountId || zoneAccountId || fail(`could not resolve the non-secret account id for ${ZONE_NAME}`);
}

async function verifyAccountToken(token, accountId, request = cloudflareRequest) {
    const tokenResult = await request(token, `/accounts/${accountId}/tokens/verify`);
    if (tokenResult?.status !== 'active') {
        fail('Cloudflare account API token is not active');
    }
    return tokenResult;
}

async function getCacheRuleEntrypoint(token, zoneId, request = cloudflareRequest) {
    const requestPath = `/zones/${zoneId}/rulesets/phases/${CACHE_RULE_PHASE}/entrypoint`;
    try {
        return await request(token, requestPath);
    } catch (error) {
        if (error.status === 404) return null;
        throw error;
    }
}

function cacheRuleMatches(rule) {
    return (
        rule?.ref === TARGET_CACHE_RULE.ref &&
        rule.expression === TARGET_CACHE_RULE.expression &&
        rule.action === TARGET_CACHE_RULE.action &&
        rule.action_parameters?.cache === false &&
        rule.enabled !== false
    );
}

async function reconcileCachePolicy(token, zoneId, request = cloudflareRequest) {
    const entrypointPath = `/zones/${zoneId}/rulesets/phases/${CACHE_RULE_PHASE}/entrypoint`;
    let entrypoint = await getCacheRuleEntrypoint(token, zoneId, request);
    let operation = 'verified';

    if (!entrypoint) {
        await request(token, `/zones/${zoneId}/rulesets`, {
            method: 'POST',
            body: JSON.stringify({
                kind: 'zone',
                name: 'Gym release delivery cache policy',
                description: 'Fixed no-store Cloudflare policy for codeoverdose.es/gym/',
                phase: CACHE_RULE_PHASE,
                rules: [TARGET_CACHE_RULE],
            }),
        });
        operation = 'created';
    } else {
        const rules = Array.isArray(entrypoint.rules) ? entrypoint.rules : [];
        const existingRule = rules.find(rule => rule?.ref === CACHE_RULE_REF);

        if (!existingRule) {
            if (!entrypoint.id) fail('Cloudflare cache ruleset did not return an id');
            await request(token, `/zones/${zoneId}/rulesets/${entrypoint.id}/rules`, {
                method: 'POST',
                body: JSON.stringify({
                    ...TARGET_CACHE_RULE,
                    position: { before: rules[0]?.id || '' },
                }),
            });
            operation = 'added';
        } else if (!cacheRuleMatches(existingRule)) {
            if (!existingRule.id) fail('existing Gym cache rule did not return an id');
            await request(token, `/zones/${zoneId}/rulesets/${entrypoint.id}/rules/${existingRule.id}`, {
                method: 'PATCH',
                body: JSON.stringify(TARGET_CACHE_RULE),
            });
            operation = 'updated';
        }
    }

    entrypoint = await getCacheRuleEntrypoint(token, zoneId, request);
    const verifiedRule = entrypoint?.rules?.find(rule => rule?.ref === CACHE_RULE_REF);
    if (!cacheRuleMatches(verifiedRule)) {
        fail('Cloudflare did not expose the expected fixed /gym/ cache policy after reconciliation');
    }

    return { operation, rulesetId: entrypoint.id };
}

async function purgeUrls(token, zoneId, urls, request = cloudflareRequest) {
    const purgeIds = [];
    for (let index = 0; index < urls.length; index += PURGE_BATCH_SIZE) {
        const files = urls.slice(index, index + PURGE_BATCH_SIZE);
        const result = await request(token, `/zones/${zoneId}/purge_cache`, {
            method: 'POST',
            body: JSON.stringify({ files }),
        });
        if (!result?.id) fail('Cloudflare accepted a purge batch without returning an operation id');
        purgeIds.push(result.id);
    }
    return purgeIds;
}

export async function execute({ token = getToken(), release = null, request = cloudflareRequest } = {}) {
    if (!process.argv.includes('--validate-and-purge') && request === cloudflareRequest) {
        fail('run with --validate-and-purge to make the intended cache action explicit');
    }

    const releaseManifest = release || (await readRelease());
    const urls = getCanonicalUrls(releaseManifest);
    const zone = await resolveZone(token, request);
    const accountId = resolveAccountId(zone.accountId);
    await verifyAccountToken(token, accountId, request);
    const policy = await reconcileCachePolicy(token, zone.id, request);
    const purgeIds = await purgeUrls(token, zone.id, urls, request);
    const releaseDigest = crypto
        .createHash('sha256')
        .update(JSON.stringify(releaseManifest))
        .digest('hex')
        .slice(0, 12);

    return {
        accountId,
        zoneId: zone.id,
        policy,
        purgeIds,
        urlCount: urls.length,
        release: releaseManifest.revision,
        manifest: releaseDigest,
    };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    execute()
        .then(result => {
            console.log(
                `[cloudflare-cache] active account token verified; /gym/ cache policy ${result.policy.operation}; purged ${result.urlCount} canonical URLs in ${result.purgeIds.length} batches for ${ZONE_NAME} (release ${result.release}, manifest ${result.manifest})`
            );
        })
        .catch(error => {
            console.error(error.message);
            process.exitCode = 1;
        });
}
