/** @jest-environment node */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { installSmokeBrowser, sha256File, validateArchiveEntries } from '../../scripts/install-smoke-browser.mjs';
import { decodeBidiValue, removeSmokeProfile, resolveSmokeBrowser } from '../../scripts/browser-smoke-driver.mjs';
import { runBrowserFixture } from '../../scripts/browser-fixture-runner.mjs';

const directories = [];
const originalChromePath = process.env.CHROME_PATH;

async function temporary() {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gym-browser-runtime-test-'));
    directories.push(directory);
    return directory;
}

afterEach(async () => {
    if (originalChromePath === undefined) delete process.env.CHROME_PATH;
    else process.env.CHROME_PATH = originalChromePath;
    for (const directory of directories.splice(0)) await fs.rm(directory, { recursive: true, force: true });
});

describe('pinned smoke browser installation', () => {
    it('hashes all streamed bytes, including binary data', async () => {
        const file = path.join(await temporary(), 'archive');
        const bytes = crypto.randomBytes(200_000);
        await fs.writeFile(file, bytes);
        expect(await sha256File(file)).toBe(crypto.createHash('sha256').update(bytes).digest('hex'));
    });

    it('rejects a corrupted real download before extraction and removes the partial file', async () => {
        const directory = await temporary();
        const fetchImpl = jest.fn(async () => new Response('corrupted browser archive'));
        await expect(installSmokeBrowser('chromium', { cacheDirectory: directory, downloadDirectory: path.join(directory, 'downloads'), platform: 'linux', architecture: 'x64', fetchImpl }))
            .rejects.toThrow('Browser archive SHA-256 mismatch');
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(fetchImpl.mock.calls[0][0]).toMatch(/^https:\/\/storage\.googleapis\.com\/chrome-for-testing-public\//);
        expect(await fs.readdir(path.join(directory, 'downloads'))).toEqual([]);
        expect((await fs.readdir(directory)).filter(name => name.startsWith('extract-'))).toEqual([]);
    });

    it('fails closed on a tampered cached archive without redownloading or extracting it', async () => {
        const directory = await temporary();
        const downloads = path.join(directory, 'downloads');
        await fs.mkdir(downloads);
        await fs.writeFile(path.join(downloads, 'chromium-158.0.8127.36-linux.zip'), 'tampered');
        const fetchImpl = jest.fn();
        await expect(installSmokeBrowser('chromium', { cacheDirectory: directory, downloadDirectory: downloads, platform: 'linux', architecture: 'x64', fetchImpl }))
            .rejects.toThrow('Browser archive SHA-256 mismatch');
        expect(fetchImpl).not.toHaveBeenCalled();
        expect(await fs.readdir(directory)).toEqual(['downloads']);
    });

    it.each(['../escape', 'core/../../escape', '/absolute', 'C:\\outside\\browser.exe', 'core\\..\\escape'])('rejects archive entry %s', entry => {
        expect(() => validateArchiveEntries(`core/\ncore/firefox.exe\n${entry}\n`)).toThrow('escaping path');
    });

    it('allows ordinary official archive entries', () => {
        expect(() => validateArchiveEntries('chrome-linux64/\nchrome-linux64/chrome\nfirefox/browser/omni.ja\n')).not.toThrow();
    });

    it('rejects an unsupported architecture before accessing the network', async () => {
        const fetchImpl = jest.fn();
        await expect(installSmokeBrowser('firefox', { architecture: 'arm64', fetchImpl })).rejects.toThrow('Windows/Linux x64');
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});

describe('isolated browser protocol utilities', () => {
    it('preserves real startup stderr, exit status and trace after owned launcher cleanup', async () => {
        const directory = await temporary();
        process.env.CHROME_PATH = process.execPath;
        const assertState = jest.fn();
        // Node is a real, isolated failing launcher for Chrome's command line;
        // there is no mocked protocol or browser process to invent diagnostics.
        await expect(runBrowserFixture({ name: 'startup-diagnostics', kind: 'chromium',
            url: 'http://127.0.0.1:9/', evidenceDirectory: directory,
            readiness: 'true', expression: 'true', assertState })).rejects.toThrow('Owned chromium stderr');
        const evidence = JSON.parse(await fs.readFile(path.join(directory, 'chromium/evidence.json'), 'utf8'));
        const trace = JSON.parse(await fs.readFile(path.join(directory, 'chromium/trace.json'), 'utf8'));
        expect(evidence.status).toBe('failed');
        expect(evidence.browserProcess.stderr).toContain('bad option');
        expect(evidence.browserProcess.exitCode).not.toBe(0);
        expect(evidence.browserProcess.executable).toBe(process.execPath);
        expect(evidence.cleanupError).toBeUndefined();
        expect(trace.some(event => event.method === 'BrowserProcess.failure'
            && event.params.stderr.includes('bad option'))).toBe(true);
        expect(assertState).not.toHaveBeenCalled();
    });

    it('decodes nested actual BiDi remote-value structures without losing false, zero or null', () => {
        expect(decodeBidiValue({ type: 'object', value: [
            ['ready', { type: 'boolean', value: false }], ['count', { type: 'number', value: 0 }],
            ['states', { type: 'array', value: [{ type: 'null' }, { type: 'string', value: '8,5' }] }],
        ] })).toEqual({ ready: false, count: 0, states: [null, '8,5'] });
    });

    it('does not silently fall back when the explicitly selected browser is absent', async () => {
        process.env.CHROME_PATH = path.join(await temporary(), 'missing-chrome.exe');
        await expect(resolveSmokeBrowser('chromium')).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('refuses to remove a temporary directory it does not own', async () => {
        const directory = await temporary();
        await fs.writeFile(path.join(directory, 'sentinel'), 'keep');
        await expect(removeSmokeProfile(directory)).rejects.toThrow('Unexpected smoke profile');
        expect(await fs.readFile(path.join(directory, 'sentinel'), 'utf8')).toBe('keep');
    });
});
