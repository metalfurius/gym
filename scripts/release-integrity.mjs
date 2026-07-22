#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE_PATH = path.join(ROOT, 'release.json');
const REVISION_PATTERN = /const RELEASE_REVISION = ['"]([^'"]+)['"]/;
const CACHE_NAME_PATTERN = /const CACHE_NAME = `([^`$]+)\$\{RELEASE_REVISION\}`/;
const META_PATTERN = /<meta\s+name=["']gym-release-revision["']\s+content=["']([^"']+)["']/i;
const CACHE_URLS_PATTERN = /const urlsToCache = \[(?<body>[\s\S]*?)\];/;
const LOCAL_REFERENCE_PATTERN = /(?:href|src)=["']([^"']+)["']/gi;

function fail(message) {
    throw new Error(`[release-integrity] ${message}`);
}

function normalizeAssetPath(value) {
    const withoutQuery = value.split(/[?#]/, 1)[0];
    const normalized = withoutQuery.replace(/^\.\//, '').replace(/^\//, '');
    return normalized || 'index.html';
}

function isLocalReference(value) {
    return value && !value.startsWith('#') && !value.startsWith('mailto:') && !/^[a-z][a-z\d+.-]*:/i.test(value);
}

function extractServiceWorkerAssets(serviceWorker) {
    const match = serviceWorker.match(CACHE_URLS_PATTERN);
    if (!match) fail('sw.js does not declare urlsToCache');

    const values = [...match.groups.body.matchAll(/['"]([^'"]+)['"]/g)].map((entry) => entry[1]);
    return new Set(values.filter(isLocalReference).map(normalizeAssetPath));
}

function extractIndexReferences(indexHtml) {
    const references = [];
    for (const match of indexHtml.matchAll(LOCAL_REFERENCE_PATTERN)) {
        if (isLocalReference(match[1])) references.push(normalizeAssetPath(match[1]));
    }
    return new Set(references);
}

async function readText(relativePath) {
    return fs.readFile(path.join(ROOT, relativePath), 'utf8');
}

async function sha256(relativePath) {
    const data = await fs.readFile(path.join(ROOT, relativePath));
    return crypto.createHash('sha256').update(data).digest('hex');
}

function getRevisionFromVersion(version) {
    return `v${version}`;
}

function getPatchVersion(version) {
    const parts = version.split('.').map(Number);
    return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}

async function loadSource() {
    const manifest = JSON.parse(await readText('manifest.json'));
    const indexHtml = await readText('index.html');
    const serviceWorker = await readText('sw.js');
    const cacheAssets = extractServiceWorkerAssets(serviceWorker);
    return { manifest, indexHtml, serviceWorker, cacheAssets };
}

function validateMetadataShape(release, manifest, indexHtml, serviceWorker) {
    if (release.schemaVersion !== 1) fail('release.json schemaVersion must be 1');
    if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) fail(`manifest version is invalid: ${manifest.version}`);

    const expectedRevision = getRevisionFromVersion(manifest.version);
    const serviceWorkerRevision = serviceWorker.match(REVISION_PATTERN)?.[1];
    const indexRevision = indexHtml.match(META_PATTERN)?.[1];
    const cacheNamePrefix = serviceWorker.match(CACHE_NAME_PATTERN)?.[1];

    if (manifest.release_revision !== expectedRevision) {
        fail(`manifest release_revision ${manifest.release_revision} does not match ${expectedRevision}`);
    }
    if (release.version !== manifest.version || release.revision !== expectedRevision) {
        fail('release.json version/revision disagree with manifest.json');
    }
    if (serviceWorkerRevision !== expectedRevision) {
        fail(`sw.js revision ${serviceWorkerRevision} does not match ${expectedRevision}`);
    }
    if (indexRevision !== expectedRevision) {
        fail(`index.html revision ${indexRevision} does not match ${expectedRevision}`);
    }
    if (cacheNamePrefix !== 'gym-tracker-') {
        fail('sw.js must derive its cache name from RELEASE_REVISION');
    }
    if (release.cacheName !== `gym-tracker-${expectedRevision}`) {
        fail(`release cacheName ${release.cacheName} does not match ${expectedRevision}`);
    }
    if (!release.assets || typeof release.assets !== 'object' || Array.isArray(release.assets)) {
        fail('release.json must contain an assets object');
    }

    return expectedRevision;
}

async function validate({ write = false } = {}) {
    const source = await loadSource();
    let release;
    if (write) {
        const revision = getRevisionFromVersion(source.manifest.version);
        release = {
            schemaVersion: 1,
            version: source.manifest.version,
            revision,
            cacheName: `gym-tracker-${revision}`,
            assets: {}
        };
    } else {
        release = JSON.parse(await readText('release.json'));
    }
    const revision = validateMetadataShape(release, source.manifest, source.indexHtml, source.serviceWorker);
    const expectedAssets = [...source.cacheAssets].filter((asset) => asset !== 'release.json').sort();
    const declaredAssets = Object.keys(release.assets).sort();

    for (const asset of source.cacheAssets) {
        if (asset.includes('?')) fail(`service-worker cache asset contains a query string: ${asset}`);
        if (asset !== 'release.json') {
            try {
                await fs.access(path.join(ROOT, asset));
            } catch {
                fail(`service-worker cache asset does not exist: ${asset}`);
            }
        }
    }

    for (const reference of extractIndexReferences(source.indexHtml)) {
        if (reference === 'manifest.json' || reference === 'release.json') continue;
        if (!source.cacheAssets.has(reference)) {
            fail(`index.html local asset is not in the service-worker cache set: ${reference}`);
        }
    }

    if (!write && JSON.stringify(declaredAssets) !== JSON.stringify(expectedAssets)) {
        fail(`release.json asset set disagrees with sw.js cache set (expected ${expectedAssets.length}, got ${declaredAssets.length})`);
    }

    const computedAssets = {};
    for (const asset of expectedAssets) {
        computedAssets[asset] = await sha256(asset);
        if (!write && release.assets[asset] !== computedAssets[asset]) {
            fail(`asset hash mismatch for ${asset}: release metadata is stale`);
        }
    }

    if (write) {
        const nextRelease = {
            schemaVersion: 1,
            version: source.manifest.version,
            revision,
            cacheName: `gym-tracker-${revision}`,
            assets: computedAssets
        };
        await fs.writeFile(RELEASE_PATH, `${JSON.stringify(nextRelease, null, 2)}\n`, 'utf8');
        return nextRelease;
    }

    return release;
}

async function runTwoBuildCheck() {
    const source = await loadSource();
    const versions = [source.manifest.version, getPatchVersion(source.manifest.version)];
    const snapshots = versions.map((version) => {
        const revision = getRevisionFromVersion(version);
        const manifest = { ...source.manifest, version, release_revision: revision };
        const indexHtml = source.indexHtml.replace(META_PATTERN, `<meta name="gym-release-revision" content="${revision}"`);
        const serviceWorker = source.serviceWorker.replace(REVISION_PATTERN, `const RELEASE_REVISION = '${revision}'`);
        const release = {
            schemaVersion: 1,
            version,
            revision,
            cacheName: `gym-tracker-${revision}`,
            assets: Object.fromEntries(
                [...source.cacheAssets]
                    .filter((asset) => asset !== 'release.json')
                    .sort()
                    .map((asset) => [asset, 'synthetic-hash'])
            )
        };
        validateMetadataShape(release, manifest, indexHtml, serviceWorker);
        return { revision, cacheName: release.cacheName, assets: Object.keys(release.assets).sort() };
    });

    if (snapshots[0].revision === snapshots[1].revision || snapshots[0].cacheName === snapshots[1].cacheName) {
        fail('two consecutive builds must produce different release revisions and cache names');
    }
    if (JSON.stringify(snapshots[0].assets) !== JSON.stringify(snapshots[1].assets)) {
        fail('two consecutive builds must use the same deterministic cache manifest');
    }

    return snapshots;
}

const args = new Set(process.argv.slice(2));

try {
    if (args.has('--two-build')) {
        const snapshots = await runTwoBuildCheck();
        console.log(`[release-integrity] two-build check passed: ${snapshots.map((item) => item.revision).join(' -> ')}`);
    }

    const release = await validate({ write: args.has('--write') });
    console.log(`[release-integrity] ${args.has('--write') ? 'wrote' : 'verified'} ${release.revision} with ${Object.keys(release.assets).length} cached assets`);
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
