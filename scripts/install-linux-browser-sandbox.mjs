#!/usr/bin/env node
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { sha256File } from './install-smoke-browser.mjs';

const execute = promisify(execFile);
const lock = JSON.parse(await fs.readFile(new URL('./browser-runtime-lock.json', import.meta.url), 'utf8'));
const rootDirectory = '/usr/lib/gym-smoke-sandbox';

export async function verifyLinuxSandboxSource(receipt, chromePath, runtime = lock.chromium) {
    const asset = runtime.linux;
    if (receipt.status !== 'passed' || receipt.browser !== 'chromium' || receipt.version !== runtime.version
        || receipt.archiveSha256 !== asset.sha256 || receipt.executable !== chromePath
        || receipt.linuxSandboxSource?.sha256 !== asset.sandboxSha256) {
        throw new Error('Linux sandbox source receipt does not match the pinned browser');
    }
    const helper = path.join(path.dirname(chromePath), 'chrome_sandbox');
    if (receipt.linuxSandboxSource.path !== helper || await fs.realpath(helper) !== path.resolve(helper)) {
        throw new Error('Linux sandbox source path was redirected');
    }
    const metadata = await fs.lstat(helper);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1
        || await sha256File(helper) !== asset.sandboxSha256) {
        throw new Error('Linux sandbox source helper failed checksum or file validation');
    }
    return { path: helper, sha256: asset.sandboxSha256, archiveSha256: asset.sha256 };
}

async function rootMetadata(directory, exactMode) {
    const info = await fs.lstat(directory);
    const mode = info.mode & 0o7777;
    if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== 0 || info.gid !== 0
        || (mode & 0o022) !== 0 || (exactMode !== undefined && mode !== exactMode)) {
        throw new Error(`Unsafe root-owned sandbox directory: ${directory} (uid=${info.uid}, gid=${info.gid}, mode=${mode.toString(8)})`);
    }
    return { path: directory, uid: info.uid, gid: info.gid, mode: mode.toString(8) };
}

export async function installLinuxBrowserSandbox() {
    if (process.platform !== 'linux' || process.env.GITHUB_ACTIONS !== 'true' || process.env.CI !== 'true') {
        throw new Error('Privileged sandbox installation is restricted to the Linux CI job');
    }
    if (!process.env.GITHUB_ENV || !process.env.BROWSER_SMOKE_INSTALL_RECEIPT || !process.env.CHROME_PATH) {
        throw new Error('Linux sandbox setup requires the browser receipt and Actions environment paths');
    }
    const receipt = JSON.parse(await fs.readFile(process.env.BROWSER_SMOKE_INSTALL_RECEIPT, 'utf8'));
    const source = await verifyLinuxSandboxSource(receipt, process.env.CHROME_PATH);
    const ancestors = [await rootMetadata('/'), await rootMetadata('/usr'), await rootMetadata('/usr/lib')];
    const sudo = args => execute('/usr/bin/sudo', ['-n', ...args], { timeout: 15_000, maxBuffer: 1_000_000 });
    try { await fs.lstat(rootDirectory); }
    catch (error) {
        if (error.code !== 'ENOENT') throw error;
        await sudo(['/usr/bin/install', '-d', '-o', 'root', '-g', 'root', '-m', '0755', '--', rootDirectory]);
    }
    const root = await rootMetadata(rootDirectory, 0o755);
    const destination = path.join(rootDirectory, `chrome-sandbox-${source.sha256}`);
    let existing;
    try { existing = await fs.lstat(destination); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (existing) {
        if (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1 || existing.uid !== 0 || existing.gid !== 0
            || ![0o755, 0o4755].includes(existing.mode & 0o7777) || await sha256File(destination) !== source.sha256) {
            throw new Error('Existing root sandbox copy failed ownership, mode or checksum validation');
        }
    } else {
        // Copy without setuid first. The root-owned non-writable destination is
        // hashed before granting setuid; never chmod the world-writable host helper.
        await sudo(['/usr/bin/install', '-o', 'root', '-g', 'root', '-m', '0755', '--', source.path, destination]);
    }
    const staged = await fs.lstat(destination);
    if (!staged.isFile() || staged.isSymbolicLink() || staged.nlink !== 1 || staged.uid !== 0 || staged.gid !== 0
        || ![0o755, 0o4755].includes(staged.mode & 0o7777) || await sha256File(destination) !== source.sha256) {
        throw new Error('Copied sandbox helper failed ownership, mode or checksum before setuid');
    }
    await sudo(['/usr/bin/chmod', '4755', '--', destination]);
    const installed = await fs.lstat(destination);
    const installedSha256 = await sha256File(destination);
    if (!installed.isFile() || installed.isSymbolicLink() || installed.nlink !== 1 || installed.uid !== 0 || installed.gid !== 0
        || (installed.mode & 0o7777) !== 0o4755 || installedSha256 !== source.sha256) {
        throw new Error('Installed sandbox helper failed final ownership, mode or checksum validation');
    }
    await rootMetadata(rootDirectory, 0o755);
    await fs.appendFile(process.env.GITHUB_ENV, `CHROME_DEVEL_SANDBOX=${destination}\n`);
    return { source, destination, installedSha256, uid: installed.uid, gid: installed.gid, mode: '4755', root, ancestors };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    let evidence = { status: 'running', startedAt: new Date().toISOString() };
    try {
        evidence = { ...evidence, ...await installLinuxBrowserSandbox(), status: 'passed' };
    } catch (error) {
        evidence.status = 'failed'; evidence.error = error.stack || error.message; process.exitCode = 1;
    }
    evidence.completedAt = new Date().toISOString();
    await fs.writeFile(process.env.BROWSER_SMOKE_SANDBOX_RECEIPT, `${JSON.stringify(evidence, null, 2)}\n`);
    if (evidence.status === 'failed') console.error(evidence.error);
    else console.log(JSON.stringify(evidence));
}
