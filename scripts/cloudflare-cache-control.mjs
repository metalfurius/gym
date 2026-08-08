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
const TARGET_ENV = 'CLOUDFLARE_CACHE_TARGET';
const EXPECTED_REVISION_ENV = 'CLOUDFLARE_EXPECTED_REVISION';
const ZONE_NAME = 'codeoverdose.es';
const CACHE_RULE_PHASE = 'http_request_cache_settings';
const PURGE_BATCH_SIZE = 25;
const CLOUDFLARE_ID_PATTERN = /^[a-f0-9]{32}$/i;
const PORTFOLIO_MEDIA_PATHS = [
    'assets/1.png',
    'assets/2.png',
    'assets/2048.webp',
    'assets/cc.webp',
    'assets/gym-icon.png',
    'assets/luckbound_concept.jpg',
    'assets/logo.png',
];

const TARGET_CONFIGS = {
    gym: {
        targetDirectory: 'target-gym',
        baseUrl: 'https://codeoverdose.es/gym/',
        metadataFile: 'release.json',
        fixedPaths: ['', 'index.html', 'manifest.json', 'release.json', 'sw.js'],
        cacheRule: {
            ref: 'gym-pwa-fixed-cache-policy-v1',
            description: 'Bypass Cloudflare caching for Gym release delivery',
            expression: '(http.host eq "codeoverdose.es" and starts_with(http.request.uri.path, "/gym/"))',
            action: 'set_cache_settings',
            action_parameters: { cache: false },
            enabled: true,
        },
    },
    portfolio: {
        targetDirectory: 'target-portfolio',
        baseUrl: 'https://codeoverdose.es/',
        metadataFile: 'site-revision.json',
        fixedPaths: ['', 'index.html', 'site-revision.json', 'styles.css', 'script.js', ...PORTFOLIO_MEDIA_PATHS],
        cacheRule: {
            ref: 'portfolio-canonical-cache-policy-v1',
            description: 'Bypass Cloudflare caching for CodeOverdose portfolio delivery',
            expression:
                '(http.host eq "codeoverdose.es" and (http.request.uri.path eq "/" or http.request.uri.path eq "/index.html" or http.request.uri.path eq "/site-revision.json" or starts_with(http.request.uri.path, "/styles.") or starts_with(http.request.uri.path, "/script.") or starts_with(http.request.uri.path, "/assets/")))',
            action: 'set_cache_settings',
            action_parameters: { cache: false },
            enabled: true,
        },
    },
};

function fail(message) {
    throw new Error(`[cloudflare-cache] ${message}`);
}

function getTarget(value = process.env[TARGET_ENV] || 'gym') {
    if (!Object.hasOwn(TARGET_CONFIGS, value)) {
        fail(`${TARGET_ENV} must be one of: ${Object.keys(TARGET_CONFIGS).join(', ')}`);
    }
    return value;
}

function getExpectedRevision(value = process.env[EXPECTED_REVISION_ENV] || '') {
    if (value && /\s/.test(value)) fail(`${EXPECTED_REVISION_ENV} must not contain whitespace`);
    return value;
}

function getTargetRoot(target) {
    return path.resolve(ROOT, '..', TARGET_CONFIGS[target].targetDirectory);
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

function validatePortfolioRevision(siteRevision, expectedRevision) {
    if (!siteRevision || typeof siteRevision !== 'object' || siteRevision.schema !== 1) {
        fail('site-revision.json does not contain the expected schema');
    }
    if (!/^[a-f0-9]{12}-[a-f0-9]{12}$/.test(siteRevision.revision || '')) {
        fail('site-revision.json has an invalid portfolio revision');
    }
    if (expectedRevision && siteRevision.revision !== expectedRevision) {
        fail(`portfolio revision ${siteRevision.revision} does not match expected ${expectedRevision}`);
    }

    const cssPath = siteRevision.assets?.css?.path;
    const jsPath = siteRevision.assets?.js?.path;
    const cssMatch = /^styles\.([a-f0-9]{12})\.css$/.exec(cssPath || '');
    const jsMatch = /^script\.([a-f0-9]{12})\.js$/.exec(jsPath || '');
    if (!cssMatch || !jsMatch) fail('portfolio revision does not declare content-addressed CSS and JS');
    if (!/^[a-f0-9]{64}$/.test(siteRevision.assets.css.sha256 || '')) {
        fail('portfolio CSS manifest hash is invalid');
    }
    if (!/^[a-f0-9]{64}$/.test(siteRevision.assets.js.sha256 || '')) {
        fail('portfolio JS manifest hash is invalid');
    }
    if (!siteRevision.assets.css.sha256.startsWith(cssMatch[1])) {
        fail('portfolio CSS filename does not match its manifest hash');
    }
    if (!siteRevision.assets.js.sha256.startsWith(jsMatch[1])) {
        fail('portfolio JS filename does not match its manifest hash');
    }
    return siteRevision;
}

function validateTargetMetadata(target, metadata, expectedRevision) {
    if (target === 'portfolio') return validatePortfolioRevision(metadata, expectedRevision);
    if (!metadata || typeof metadata !== 'object' || !metadata.assets || typeof metadata.assets !== 'object') {
        fail('release.json does not contain a usable asset manifest');
    }
    if (expectedRevision && metadata.revision !== expectedRevision) {
        fail(`Gym revision ${metadata.revision} does not match expected ${expectedRevision}`);
    }
    return metadata;
}

async function readTargetMetadata(target) {
    const config = TARGET_CONFIGS[target];
    try {
        return JSON.parse(await fs.readFile(path.join(getTargetRoot(target), config.metadataFile), 'utf8'));
    } catch (error) {
        fail(`could not read ${config.metadataFile} for ${target}: ${error.message}`);
    }
}

function toCanonicalUrls(target, metadata) {
    const config = TARGET_CONFIGS[target];
    const paths = new Set(config.fixedPaths);
    if (target === 'gym') {
        Object.keys(metadata.assets).forEach(asset => paths.add(asset));
    } else {
        paths.add(metadata.assets.css.path);
        paths.add(metadata.assets.js.path);
    }

    const base = new URL(config.baseUrl);
    return [...paths].sort().map(relativePath => {
        if (
            relativePath &&
            (/^[a-z][a-z\d+.-]*:/i.test(relativePath) || relativePath.startsWith('//') || relativePath.startsWith('/'))
        ) {
            fail(`${target} release asset is not a relative path: ${relativePath}`);
        }
        const url = new URL(relativePath, base);
        if (url.origin !== base.origin || url.search || url.hash || !url.pathname.startsWith(base.pathname)) {
            fail(`${target} release asset escapes the fixed purge scope: ${relativePath}`);
        }
        return url.toString();
    });
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
        let codes = 'unknown';
        if (Array.isArray(payload?.errors)) {
            codes = payload.errors
                .map(error => error?.code)
                .filter(Boolean)
                .join(',');
        }
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

function cacheRuleMatches(rule, expectedRule) {
    return (
        rule?.ref === expectedRule.ref &&
        rule.expression === expectedRule.expression &&
        rule.action === expectedRule.action &&
        rule.action_parameters?.cache === false &&
        rule.enabled !== false
    );
}

async function reconcileCachePolicy(target, token, zoneId, request = cloudflareRequest) {
    const targetRule = TARGET_CONFIGS[target].cacheRule;
    let entrypoint = await getCacheRuleEntrypoint(token, zoneId, request);
    let operation = 'verified';

    if (!entrypoint) {
        await request(token, `/zones/${zoneId}/rulesets`, {
            method: 'POST',
            body: JSON.stringify({
                kind: 'zone',
                name: `${target} fixed canonical delivery cache policy`,
                description: `Fixed no-store Cloudflare policy for ${target} canonical delivery`,
                phase: CACHE_RULE_PHASE,
                rules: [targetRule],
            }),
        });
        operation = 'created';
    } else {
        const rules = Array.isArray(entrypoint.rules) ? entrypoint.rules : [];
        const existingRule = rules.find(rule => rule?.ref === targetRule.ref);

        if (!existingRule) {
            if (!entrypoint.id) fail('Cloudflare cache ruleset did not return an id');
            await request(token, `/zones/${zoneId}/rulesets/${entrypoint.id}/rules`, {
                method: 'POST',
                body: JSON.stringify({
                    ...targetRule,
                    position: { before: rules[0]?.id || '' },
                }),
            });
            operation = 'added';
        } else if (!cacheRuleMatches(existingRule, targetRule)) {
            if (!existingRule.id) fail(`existing ${target} cache rule did not return an id`);
            await request(token, `/zones/${zoneId}/rulesets/${entrypoint.id}/rules/${existingRule.id}`, {
                method: 'PATCH',
                body: JSON.stringify(targetRule),
            });
            operation = 'updated';
        }
    }

    entrypoint = await getCacheRuleEntrypoint(token, zoneId, request);
    const verifiedRule = entrypoint?.rules?.find(rule => rule?.ref === targetRule.ref);
    if (!cacheRuleMatches(verifiedRule, targetRule)) {
        fail(`Cloudflare did not expose the expected fixed ${target} cache policy after reconciliation`);
    }

    return { operation, rulesetId: entrypoint.id, ref: targetRule.ref };
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

export async function execute({
    target = getTarget(),
    expectedRevision = getExpectedRevision(),
    metadata = null,
    release = null,
    token = null,
    request = cloudflareRequest,
} = {}) {
    target = getTarget(target);
    if (!process.argv.includes('--validate-and-purge') && request === cloudflareRequest) {
        fail('run with --validate-and-purge to make the intended cache action explicit');
    }

    const targetMetadata = validateTargetMetadata(
        target,
        metadata || release || (await readTargetMetadata(target)),
        expectedRevision
    );
    const urls = toCanonicalUrls(target, targetMetadata);
    const cacheToken = token || getToken();
    const zone = await resolveZone(cacheToken, request);
    const accountId = resolveAccountId(zone.accountId);
    await verifyAccountToken(cacheToken, accountId, request);
    const policy = await reconcileCachePolicy(target, cacheToken, zone.id, request);
    const purgeIds = await purgeUrls(cacheToken, zone.id, urls, request);
    const manifest = crypto.createHash('sha256').update(JSON.stringify(targetMetadata)).digest('hex').slice(0, 12);

    return {
        target,
        accountId,
        zoneId: zone.id,
        policy,
        purgeIds,
        urlCount: urls.length,
        release: target === 'portfolio' ? targetMetadata.revision : targetMetadata.revision,
        manifest,
        urls,
    };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    execute()
        .then(result => {
            console.log(
                `[cloudflare-cache] target ${result.target}; active account token verified; policy ${result.policy.operation}; purged ${result.urlCount} canonical URLs in ${result.purgeIds.length} batches for ${ZONE_NAME} (revision ${result.release}, manifest ${result.manifest})`
            );
        })
        .catch(error => {
            console.error(error.message);
            process.exitCode = 1;
        });
}
