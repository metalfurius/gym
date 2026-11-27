#!/usr/bin/env node
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { configureWindowsBrowserPermissions } from './browser-windows-permissions.mjs';

const run = promisify(execFile);
const lock = JSON.parse(await fsp.readFile(new URL('./browser-runtime-lock.json', import.meta.url), 'utf8'));

async function removeExtraction(directory, base) {
    const resolved = path.resolve(directory);
    if (!resolved.startsWith(`${base}${path.sep}`) || !path.basename(resolved).startsWith('extract-')) {
        throw new Error('Unexpected browser extraction cleanup path');
    }
    await fsp.rm(resolved, { recursive: true, force: true });
}

export async function sha256File(file) {
    const hash = crypto.createHash('sha256');
    await pipeline(fs.createReadStream(file), new Transform({ transform(chunk, _encoding, done) { hash.update(chunk); done(); } }));
    return hash.digest('hex');
}

export function validateArchiveEntries(output) {
    for (const entry of output.split(/\r?\n/).filter(Boolean)) {
        const normalized = entry.replace(/\\/g, '/');
        if (normalized.startsWith('/') || /^[a-z]:/i.test(normalized) || normalized.includes('\0')
            || normalized.split('/').includes('..')) throw new Error('Browser archive contains an escaping path');
    }
}

export async function installSmokeBrowser(browser, {
    cacheDirectory = process.env.BROWSER_SMOKE_CACHE_DIR || path.join(os.tmpdir(), 'gym-smoke-browser-runtimes'),
    downloadDirectory = process.env.BROWSER_SMOKE_DOWNLOAD_DIR,
    platform = process.platform, architecture = process.arch, fetchImpl = fetch,
} = {}) {
    const runtime = lock[browser];
    const asset = runtime?.[platform];
    if (!['chromium', 'firefox'].includes(browser) || !asset || architecture !== 'x64') {
        throw new Error('Pinned smoke browsers support chromium/firefox on Windows/Linux x64');
    }
    const base = path.resolve(cacheDirectory);
    const downloads = path.resolve(downloadDirectory || path.join(base, 'downloads'));
    await fsp.mkdir(downloads, { recursive: true }); await fsp.mkdir(base, { recursive: true });
    const archive = path.join(downloads, `${browser}-${runtime.version}-${platform}${path.extname(new URL(asset.url).pathname)}`);
    try {
        await fsp.access(archive);
    } catch {
        const partial = `${archive}.part-${process.pid}`;
        try {
            const response = await fetchImpl(asset.url, { redirect: 'error', signal: AbortSignal.timeout(180_000) });
            if (!response.ok) throw new Error(`Browser download failed with HTTP ${response.status}`);
            await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(partial, { flags: 'wx' }));
            if (await sha256File(partial) !== asset.sha256) throw new Error('Browser archive SHA-256 mismatch');
            await fsp.rename(partial, archive);
        } finally {
            await fsp.rm(partial, { force: true });
        }
    }
    if (await sha256File(archive) !== asset.sha256) throw new Error('Browser archive SHA-256 mismatch');
    const directory = path.join(base, `${browser}-${runtime.version}-${platform}-${asset.sha256.slice(0, 12)}`);
    const executable = path.join(directory, asset.executable);
    const result = async () => {
        const value = { browser, version: runtime.version, executable, archiveSha256: asset.sha256 };
        if (browser === 'chromium' && platform === 'win32') {
            const entries = (await run('tar', ['-tf', archive], { timeout: 60_000, windowsHide: true, maxBuffer: 8_000_000 })).stdout;
            validateArchiveEntries(entries);
            value.windowsSandboxAccess = await configureWindowsBrowserPermissions({
                cacheDirectory: base, installDirectory: directory, executable, archiveEntries: entries.split(/\r?\n/).filter(Boolean),
            });
        }
        if (browser === 'chromium' && platform === 'linux') {
            const helper = path.join(directory, 'chrome-linux64', 'chrome_sandbox');
            const metadata = await fsp.lstat(helper);
            if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1
                || await sha256File(helper) !== asset.sandboxSha256) {
                throw new Error('Linux sandbox helper differs from the pinned archive member');
            }
            value.linuxSandboxSource = { path: helper, sha256: asset.sandboxSha256 };
        }
        return value;
    };
    const markerPath = path.join(directory, 'verified-browser.json');
    try {
        const marker = JSON.parse(await fsp.readFile(markerPath, 'utf8'));
        if (marker.archiveSha256 !== asset.sha256 || marker.executableSha256 !== await sha256File(executable)) {
            throw new Error('Installed browser cache failed checksum validation; use a fresh cache directory');
        }
        return await result();
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
    const temporary = await fsp.mkdtemp(path.join(base, 'extract-'));
    try {
        const command = platform === 'win32' || asset.format === 'tar.xz' ? 'tar' : 'unzip';
        const listing = command === 'tar' ? ['-tf', archive] : ['-Z1', archive];
        validateArchiveEntries((await run(command, listing, { timeout: 60_000, windowsHide: true, maxBuffer: 8_000_000 })).stdout);
        const extracting = command === 'tar' ? ['-xf', archive, '-C', temporary] : ['-q', archive, '-d', temporary];
        await run(command, extracting, { timeout: 60_000, windowsHide: true, maxBuffer: 8_000_000 });
        const binary = path.join(temporary, asset.executable);
        await fsp.access(binary);
        await fsp.writeFile(path.join(temporary, 'verified-browser.json'), JSON.stringify({
            archiveSha256: asset.sha256, executableSha256: await sha256File(binary), url: asset.url,
        }));
        await fsp.rename(temporary, directory);
    } finally {
        await removeExtraction(temporary, base);
    }
    return result();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    const receipt = async value => {
        if (!process.env.BROWSER_SMOKE_INSTALL_RECEIPT) return;
        const file = path.resolve(process.env.BROWSER_SMOKE_INSTALL_RECEIPT);
        await fsp.mkdir(path.dirname(file), { recursive: true });
        await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
    };
    installSmokeBrowser(process.argv[2]).then(async result => {
        const prefix = result.browser === 'firefox' ? 'FIREFOX' : 'CHROME';
        if (process.env.GITHUB_ENV) {
            if (/\r|\n/.test(result.executable)) throw new Error('Invalid browser environment path');
            await fsp.appendFile(process.env.GITHUB_ENV, `${prefix}_PATH=${result.executable}\n${prefix}_EXPECTED_VERSION=${result.version}\n`);
        }
        await receipt({ status: 'passed', ...result, completedAt: new Date().toISOString() });
        console.log(JSON.stringify(result));
    }).catch(async error => {
        await receipt({ status: 'failed', browser: process.argv[2], error: error.stack || error.message, completedAt: new Date().toISOString() });
        console.error(error.stack || error.message);
        process.exitCode = 1;
    });
}
