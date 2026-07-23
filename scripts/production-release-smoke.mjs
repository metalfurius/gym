#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_BASE_URL = process.env.GYM_PUBLIC_BASE_URL || 'https://codeoverdose.es/gym/';
const RETRY_COUNT = Number(process.env.PRODUCTION_SMOKE_RETRY_COUNT || 12);
const RETRY_DELAY_MS = Number(process.env.PRODUCTION_SMOKE_RETRY_DELAY_MS || 5_000);
const CORE_ASSETS = ['', 'index.html', 'manifest.json', 'release.json', 'sw.js', 'js/progress.js'];
const REVISION_PATTERN = /const RELEASE_REVISION = ['"]([^'"]+)['"]/;
const META_PATTERN = /<meta\s+name=["']gym-release-revision["']\s+content=["']([^"']+)["']/i;

function fail(layer, message) {
    const error = new Error(`[production-smoke:${layer}] ${message}`);
    error.layer = layer;
    throw error;
}

function normalizeText(buffer) {
    return Buffer.from(buffer).toString('utf8').replace(/\r\n?/g, '\n');
}

function sha256(buffer, relativePath) {
    const normalized = /\.(?:css|cjs|html|js|json|mjs|svg|txt)$/i.test(relativePath)
        ? Buffer.from(normalizeText(buffer), 'utf8')
        : Buffer.from(buffer);
    return crypto.createHash('sha256').update(normalized).digest('hex');
}

function normalizeBaseUrl(value) {
    const base = new URL(value);
    if (base.search || base.hash) fail('config', 'GYM_PUBLIC_BASE_URL must not contain a query or fragment');
    base.pathname = `${base.pathname.replace(/\/+$/, '')}/`;
    return base;
}

async function readLocalRelease() {
    try {
        return JSON.parse(await fs.readFile(path.join(ROOT, 'release.json'), 'utf8'));
    } catch (error) {
        fail('pages', `could not read the checked-out release.json: ${error.message}`);
    }
}

function getExpectedAssets(release) {
    if (!release || typeof release !== 'object' || !release.assets || typeof release.assets !== 'object') {
        fail('manifest', 'checked-out release.json has no asset manifest');
    }
    return [...new Set([...CORE_ASSETS, ...Object.keys(release.assets)])].sort();
}

function selectedHeaders(response) {
    return Object.fromEntries(
        ['cache-control', 'cdn-cache-control', 'cf-cache-status', 'etag', 'age', 'server', 'via', 'x-cache'].map(
            name => [name, response.headers.get(name)]
        )
    );
}

async function fetchAsset(base, relativePath) {
    const url = new URL(relativePath, base);
    if (url.search || url.hash) fail('config', `generated production URL contains a query or fragment: ${url}`);

    let response;
    try {
        response = await fetch(url, {
            headers: {
                'Cache-Control': 'no-cache',
                Pragma: 'no-cache',
            },
        });
    } catch (error) {
        fail('cloudflare', `request failed for ${relativePath}: ${error.message}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!response.ok) {
        fail('pages', `${relativePath} returned HTTP ${response.status}`);
    }

    return { relativePath, url: url.toString(), buffer, headers: selectedHeaders(response) };
}

async function readProduction(base, expectedAssets) {
    const assets = {};
    for (const relativePath of expectedAssets) {
        assets[relativePath] = await fetchAsset(base, relativePath);
    }
    return assets;
}

function validateRelease(release, assets) {
    if (release.schemaVersion !== 1 || !/^v\d+\.\d+\.\d+$/.test(release.revision)) {
        fail('manifest', 'production release.json has an invalid schema or revision');
    }

    let remoteRelease;
    let manifest;
    try {
        remoteRelease = JSON.parse(normalizeText(assets['release.json'].buffer));
        manifest = JSON.parse(normalizeText(assets['manifest.json'].buffer));
    } catch (error) {
        fail('manifest', `production metadata is not valid JSON: ${error.message}`);
    }

    if (
        remoteRelease.schemaVersion !== 1 ||
        remoteRelease.version !== release.version ||
        remoteRelease.revision !== release.revision ||
        remoteRelease.cacheName !== release.cacheName ||
        JSON.stringify(remoteRelease.assets) !== JSON.stringify(release.assets)
    ) {
        fail('cloudflare', `release.json does not match the Pages deployment revision ${release.revision}`);
    }

    const indexHtml = normalizeText(assets['index.html'].buffer);
    const rootHtml = normalizeText(assets[''].buffer);
    const serviceWorker = normalizeText(assets['sw.js'].buffer);
    const expectedRevision = `v${manifest.version}`;

    if (remoteRelease.version !== manifest.version || remoteRelease.revision !== expectedRevision) {
        fail('manifest', `release.json ${release.revision} disagrees with manifest ${manifest.version}`);
    }
    if (manifest.release_revision !== expectedRevision) {
        fail('manifest', `manifest release_revision ${manifest.release_revision} disagrees with ${expectedRevision}`);
    }
    if (indexHtml.match(META_PATTERN)?.[1] !== expectedRevision) {
        fail('pages', `index.html shell revision disagrees with ${expectedRevision}`);
    }
    if (rootHtml !== indexHtml) {
        fail('cloudflare', 'the canonical /gym/ entry shell differs from /gym/index.html');
    }
    if (serviceWorker.match(REVISION_PATTERN)?.[1] !== expectedRevision) {
        fail('service-worker', `sw.js revision disagrees with ${expectedRevision}`);
    }
    if (remoteRelease.cacheName !== `gym-tracker-${expectedRevision}`) {
        fail('service-worker', `release cacheName disagrees with ${expectedRevision}`);
    }

    const declaredAssets = Object.keys(remoteRelease.assets).sort();
    const fetchedAssets = Object.keys(assets)
        .filter(asset => asset !== '' && asset !== 'release.json' && asset !== 'sw.js')
        .sort();
    for (const relativePath of declaredAssets) {
        const asset = assets[relativePath];
        if (!asset) fail('asset', `declared asset was not fetched: ${relativePath}`);
        const expectedHash = remoteRelease.assets[relativePath];
        const actualHash = sha256(asset.buffer, relativePath);
        if (actualHash !== expectedHash) {
            fail(
                'asset',
                `${relativePath} hash disagrees with release.json (expected ${expectedHash}, got ${actualHash})`
            );
        }
    }
    if (JSON.stringify(declaredAssets) !== JSON.stringify(fetchedAssets)) {
        fail('asset', 'production asset set disagrees with release.json');
    }

    const progressHash = sha256(assets['js/progress.js'].buffer, 'js/progress.js');
    if (progressHash !== remoteRelease.assets['js/progress.js']) {
        fail('asset', 'Progress module hash disagrees with release.json');
    }

    return { revision: expectedRevision, version: manifest.version, progressHash };
}

function buildEvidence(release, assets, validation) {
    return {
        status: 'passed',
        publicBaseUrl: PUBLIC_BASE_URL,
        revision: validation.revision,
        version: validation.version,
        progressHash: validation.progressHash,
        releaseMetadata: release,
        responses: Object.fromEntries(
            Object.entries(assets).map(([relativePath, asset]) => [
                relativePath,
                {
                    url: asset.url,
                    headers: asset.headers,
                    sha256: sha256(asset.buffer, relativePath),
                },
            ])
        ),
    };
}

async function run() {
    const base = normalizeBaseUrl(PUBLIC_BASE_URL);
    const release = await readLocalRelease();
    const expectedAssets = getExpectedAssets(release);
    let lastError;

    for (let attempt = 1; attempt <= RETRY_COUNT; attempt += 1) {
        try {
            const assets = await readProduction(base, expectedAssets);
            const validation = validateRelease(release, assets);
            const evidence = buildEvidence(release, assets, validation);
            const evidencePath = process.env.PRODUCTION_SMOKE_EVIDENCE_PATH;
            if (evidencePath) {
                await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
            }
            console.log(
                `[production-smoke] passed ${validation.revision}; verified ${expectedAssets.length} no-query canonical assets`
            );
            return;
        } catch (error) {
            lastError = error;
            if (attempt === RETRY_COUNT) break;
            console.warn(`[production-smoke] attempt ${attempt}/${RETRY_COUNT} did not converge: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        }
    }

    throw lastError;
}

run().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
