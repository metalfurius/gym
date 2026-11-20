/** @jest-environment node */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { runSmoke } from '../../scripts/production-release-smoke.mjs';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const MEDIA = ['1.png', '2.png', '2048.webp', 'cc.webp', 'gym-icon.png', 'luckbound_concept.jpg', 'logo.png'];

async function fixture(target = 'gym') {
    const targetRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'canonical-smoke-test-'));
    let files;
    let revision;
    if (target === 'gym') {
        files = {
            'index.html': '<meta name="gym-release-revision" content="v2.8.3"><main>Workout</main>',
            'manifest.json': JSON.stringify({ version: '2.8.3', release_revision: 'v2.8.3' }),
            'js/progress.js': 'export const progress = 1;',
        };
        revision = { schemaVersion: 1, version: '2.8.3', revision: 'v2.8.3', cacheName: 'gym-tracker-v2.8.3',
            assets: Object.fromEntries(Object.entries(files).map(([name, value]) => [name, hash(value)])) };
        files['release.json'] = JSON.stringify(revision);
        files['sw.js'] = 'const RELEASE_REVISION = "v2.8.3"; /* exact worker bytes */';
    } else {
        const css = 'body { color: white; }';
        const js = 'console.log("portfolio");';
        const cssPath = `styles.${hash(css).slice(0, 12)}.css`;
        const jsPath = `script.${hash(js).slice(0, 12)}.js`;
        revision = { schema: 1, revision: `${hash(css).slice(0, 12)}-${hash(js).slice(0, 12)}`, entrypoint: 'index.html',
            assets: { css: { path: cssPath, sha256: hash(css) }, js: { path: jsPath, sha256: hash(js) } } };
        files = {
            'index.html': `<meta name="codeoverdose:revision" content="${revision.revision}"><link href="${cssPath}"><script src="${jsPath}"></script>https://codeoverdose.es/ Taskify Firestore id="project-6" hreflang="es" <dialog></dialog>`,
            'site-revision.json': JSON.stringify(revision), [cssPath]: css, [jsPath]: js,
            ...Object.fromEntries(MEDIA.map(name => [`assets/${name}`, `media ${name}`])),
        };
    }
    for (const [name, value] of Object.entries(files)) {
        await fs.mkdir(path.dirname(path.join(targetRoot, name)), { recursive: true });
        await fs.writeFile(path.join(targetRoot, name), value);
    }
    let clock = Date.UTC(2026, 10, 20);
    let calls = 0;
    const mutations = [];
    const readSweep = jest.fn(async (base, paths) => {
        const assets = Object.fromEntries(paths.map(name => [name, {
            url: new URL(name, base).toString(), status: 200, fetchedAt: new Date(clock++).toISOString(),
            headers: { 'cf-cache-status': 'BYPASS', age: '0' }, buffer: Buffer.from(files[name || 'index.html']),
        }]));
        mutations[calls++]?.(assets);
        return { assets, transport: 'node-fetch', challengeBrowser: null };
    });
    const options = {
        target, targetRoot, expectedRevision: revision.revision, readSweep,
        evidencePath: path.join(targetRoot, 'evidence.json'), retryCount: 2, intervalMs: 100,
        sleepFn: jest.fn(async milliseconds => { clock += milliseconds; }), now: () => clock,
    };
    return { targetRoot, files, revision, mutations, readSweep, options };
}

describe('canonical production sweep orchestration', () => {
    const directories = [];
    beforeEach(() => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(async () => {
        jest.restoreAllMocks();
        for (const directory of directories.splice(0)) await fs.rm(directory, { recursive: true, force: true });
    });
    async function setup(target) {
        const result = await fixture(target);
        directories.push(result.targetRoot);
        return result;
    }

    it.each(['gym', 'portfolio'])('validates two complete %s sweeps and records status/cache/hash/time/interval evidence', async target => {
        const { options, readSweep, files } = await setup(target);
        const result = await runSmoke(options);
        expect(readSweep).toHaveBeenCalledTimes(2);
        expect(result).toMatchObject({ status: 'passed', revision: options.expectedRevision, requiredConsecutiveSweeps: 2, sweepIntervalMs: 100 });
        expect(result.sweeps).toHaveLength(2);
        expect(result.sweeps[1].intervalSincePreviousMs).toBe(100);
        for (const sweep of result.sweeps) {
            expect(sweep.status).toBe('passed');
            expect(Object.keys(sweep.responses)).toHaveLength(Object.keys(files).length + 1);
            for (const response of Object.values(sweep.responses)) {
                expect(response).toMatchObject({ status: 200, revision: options.expectedRevision, headers: { 'cf-cache-status': 'BYPASS' } });
                expect(response.url).not.toMatch(/[?#]/);
                expect(response.sha256).toMatch(/^[a-f0-9]{64}$/);
                expect(Number.isFinite(Date.parse(response.fetchedAt))).toBe(true);
            }
        }
        expect(JSON.parse(await fs.readFile(options.evidencePath, 'utf8')).status).toBe('passed');
    });

    it('rejects one good sweep followed by an old manifest and never retains passed evidence', async () => {
        const { options, mutations } = await setup();
        await fs.writeFile(options.evidencePath, '{"status":"passed","old":true}');
        mutations[1] = assets => { assets['manifest.json'].buffer = Buffer.from('{"version":"2.8.2","release_revision":"v2.8.2"}'); };
        await expect(runSmoke(options)).rejects.toThrow('disagrees with manifest');
        await expect(fs.access(options.evidencePath)).rejects.toThrow();
    });

    it('resets consecutive success after a mixed sweep and retains the failed sweep when it later converges', async () => {
        const { options, mutations, readSweep } = await setup();
        options.retryCount = 4;
        mutations[1] = assets => { assets['js/progress.js'].buffer = Buffer.from('old progress'); };
        const evidence = await runSmoke(options);
        expect(readSweep).toHaveBeenCalledTimes(4);
        expect(evidence.sweeps.map(sweep => sweep.status)).toEqual(['passed', 'failed', 'passed', 'passed']);
        expect(evidence.sweeps[1].error).toContain('hash disagrees');
        expect(evidence.sweeps[1].responses['js/progress.js'].sha256).toBe(hash('old progress'));
        expect(evidence.sweeps[3].consecutiveSuccesses).toBe(2);
    });

    it('does not combine successes separated by a failed sweep', async () => {
        const { options, mutations } = await setup();
        options.retryCount = 3;
        mutations[1] = assets => { assets['release.json'].buffer = Buffer.from('{}'); };
        await expect(runSmoke(options)).rejects.toThrow('does not match');
        await expect(fs.access(options.evidencePath)).rejects.toThrow();
    });

    it('rejects a divergent release response even when both sweeps validate independently', async () => {
        const { options, mutations } = await setup();
        mutations[1] = assets => { assets['release.json'].buffer = Buffer.from(`${assets['release.json'].buffer.toString()}\n`); };
        await expect(runSmoke(options)).rejects.toThrow('repeated no-query response changed for release.json');
    });

    it.each([
        ['a worker with the same revision but different bytes', assets => { assets['sw.js'].buffer = Buffer.from('const RELEASE_REVISION = "v2.8.3"; /* wrong worker */'); }, 'sw.js hash'],
        ['a changed root shell', assets => { assets[''].buffer = Buffer.from('<meta name="gym-release-revision" content="v2.8.3"><main>Wrong</main>'); }, 'entry shell differs'],
        ['a query redirect', assets => { assets['manifest.json'].url += '?v=2.8.3'; }, 'redirected away'],
        ['a foreign-origin redirect', assets => { assets['index.html'].url = 'https://example.com/gym/index.html'; }, 'redirected away'],
        ['a failed HTTP response', assets => { assets['manifest.json'].status = 503; }, 'HTTP 503'],
    ])('rejects %s in the second sweep', async (_label, mutate, message) => {
        const { options, mutations } = await setup();
        mutations[1] = mutate;
        await expect(runSmoke(options)).rejects.toThrow(message);
    });

    it('separately validates the second portfolio metadata response', async () => {
        const { options, mutations } = await setup('portfolio');
        mutations[1] = assets => { assets['site-revision.json'].buffer = Buffer.from('{}'); };
        await expect(runSmoke(options)).rejects.toThrow('does not match deployed portfolio');
    });

    it('requires an exact expected revision before fetching any canonical URL', async () => {
        const { options, readSweep } = await setup();
        options.expectedRevision = 'v2.8.2';
        await expect(runSmoke(options)).rejects.toThrow('does not match expected');
        expect(readSweep).not.toHaveBeenCalled();
    });

    it('cannot configure a single-sweep pass or a zero observation interval', async () => {
        const { options } = await setup();
        await expect(runSmoke({ ...options, retryCount: 1 })).rejects.toThrow('at least two');
        await expect(runSmoke({ ...options, intervalMs: 0 })).rejects.toThrow('positive sweep interval');
    });
});
