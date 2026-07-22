#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_BASE = 'https://api.cloudflare.com/client/v4';
const TOKEN_ENV = 'CLOUDFLARE_CACHE_API_TOKEN';
const ZONE_NAME = process.env.CLOUDFLARE_ZONE_NAME || 'codeoverdose.es';
const PUBLIC_BASE_URL = process.env.GYM_PUBLIC_BASE_URL || 'https://codeoverdose.es/gym/';
const PURGE_BATCH_SIZE = 25;

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

function normalizeBaseUrl(value) {
    const base = new URL(value);
    if (base.search || base.hash) fail('GYM_PUBLIC_BASE_URL must not contain a query or fragment');
    base.pathname = `${base.pathname.replace(/\/+$/, '')}/`;
    return base;
}

function getCanonicalUrls(release) {
    if (!release || typeof release !== 'object' || !release.assets || typeof release.assets !== 'object') {
        fail('release.json does not contain a usable asset manifest');
    }

    const base = normalizeBaseUrl(PUBLIC_BASE_URL);
    const paths = new Set(['', 'index.html', 'manifest.json', 'release.json', 'sw.js', ...Object.keys(release.assets)]);

    return [...paths].sort().map(asset => new URL(asset, base).toString());
}

async function readRelease() {
    try {
        return JSON.parse(await fs.readFile(path.join(ROOT, 'release.json'), 'utf8'));
    } catch (error) {
        fail(`could not read release.json: ${error.message}`);
    }
}

async function cloudflareRequest(token, requestPath, options = {}) {
    const response = await fetch(`${API_BASE}${requestPath}`, {
        ...options,
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...(options.headers || {}),
        },
    });

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
        fail(
            `${options.method || 'GET'} ${requestPath} failed with HTTP ${response.status} (Cloudflare error codes: ${codes})`
        );
    }

    return payload.result;
}

async function verifyToken(token) {
    const tokenResult = await cloudflareRequest(token, '/user/tokens/verify');
    if (tokenResult?.status !== 'active') {
        fail('Cloudflare API token is not active');
    }
}

async function resolveZoneId(token) {
    const query = new URLSearchParams({ name: ZONE_NAME, status: 'active' });
    const zones = await cloudflareRequest(token, `/zones?${query}`);
    if (!Array.isArray(zones) || zones.length !== 1 || zones[0]?.name !== ZONE_NAME || !zones[0]?.id) {
        fail(`expected exactly one active Cloudflare zone named ${ZONE_NAME}`);
    }
    return zones[0].id;
}

async function purgeUrls(token, zoneId, urls) {
    const purgeIds = [];
    for (let index = 0; index < urls.length; index += PURGE_BATCH_SIZE) {
        const files = urls.slice(index, index + PURGE_BATCH_SIZE);
        const result = await cloudflareRequest(token, `/zones/${zoneId}/purge_cache`, {
            method: 'POST',
            body: JSON.stringify({ files }),
        });
        if (!result?.id) fail('Cloudflare accepted a purge batch without returning an operation id');
        purgeIds.push(result.id);
    }
    return purgeIds;
}

async function main() {
    if (!process.argv.includes('--validate-and-purge')) {
        fail('run with --validate-and-purge to make the intended cache action explicit');
    }

    const token = getToken();
    const release = await readRelease();
    const urls = getCanonicalUrls(release);
    await verifyToken(token);
    const zoneId = await resolveZoneId(token);
    const purgeIds = await purgeUrls(token, zoneId, urls);
    const releaseDigest = crypto.createHash('sha256').update(JSON.stringify(release)).digest('hex').slice(0, 12);

    console.log(
        `[cloudflare-cache] active token verified; purged ${urls.length} canonical URLs in ${purgeIds.length} batches for ${ZONE_NAME} (release ${release.revision}, manifest ${releaseDigest})`
    );
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
