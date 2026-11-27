/** @jest-environment node */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { configureWindowsBrowserPermissions, inspectBrowserPermissionBoundary } from '../../scripts/browser-windows-permissions.mjs';
import { installLinuxBrowserSandbox, verifyLinuxSandboxSource } from '../../scripts/install-linux-browser-sandbox.mjs';

const roots = [];
const originalActions = process.env.GITHUB_ACTIONS;

async function fixture() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gym-browser-permissions-test-'));
    roots.push(root);
    const cacheDirectory = path.join(root, 'cache');
    const installDirectory = path.join(cacheDirectory, 'chromium-158.0.8127.36-win32-000000000000');
    const application = path.join(installDirectory, 'chrome-win64');
    await fs.mkdir(application, { recursive: true });
    const executable = path.join(application, 'chrome.exe');
    const library = path.join(application, 'chrome.dll');
    const privateFile = path.join(application, 'unlisted-private.txt');
    await fs.writeFile(executable, 'public binary fixture');
    await fs.writeFile(library, 'public library fixture');
    await fs.writeFile(privateFile, 'must remain private');
    return { root, cacheDirectory, installDirectory, application, executable, library, privateFile,
        archiveEntries: ['chrome-win64/', 'chrome-win64/chrome.exe', 'chrome-win64/chrome.dll'] };
}

afterEach(async () => {
    if (originalActions === undefined) delete process.env.GITHUB_ACTIONS;
    else process.env.GITHUB_ACTIONS = originalActions;
    for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

describe('Windows public-browser permission boundary', () => {
    it('selects only archive-listed public targets and explicitly protects ancestors and unlisted files', async () => {
        const item = await fixture();
        const boundary = await inspectBrowserPermissionBoundary(item);
        expect(boundary.targets).toHaveLength(3);
        expect(boundary.targets).toEqual(expect.arrayContaining([item.application, item.library, item.executable]));
        expect(boundary.untouched).toEqual([item.cacheDirectory, item.installDirectory, item.privateFile]);
        expect(await fs.readFile(item.privateFile, 'utf8')).toBe('must remain private');
    });

    it('rejects a public name hard-linked to another file before any permission command', async () => {
        const item = await fixture();
        await fs.unlink(item.library);
        await fs.link(item.privateFile, item.library);
        const run = jest.fn();
        await expect(configureWindowsBrowserPermissions(item, run)).rejects.toThrow('hard links');
        expect(run).not.toHaveBeenCalled();
        expect(await fs.readFile(item.privateFile, 'utf8')).toBe('must remain private');
    });

    it('rejects a redirected application directory without touching its destination', async () => {
        const item = await fixture();
        const actual = path.join(item.root, 'private-destination');
        await fs.rename(item.application, actual);
        await fs.symlink(actual, item.application, process.platform === 'win32' ? 'junction' : 'dir');
        await expect(inspectBrowserPermissionBoundary(item)).rejects.toThrow('links');
        expect(await fs.readFile(path.join(actual, 'unlisted-private.txt'), 'utf8')).toBe('must remain private');
    });

    it('rejects a same-named installation outside the declared cache', async () => {
        const item = await fixture();
        await expect(inspectBrowserPermissionBoundary({ ...item, cacheDirectory: item.root })).rejects.toThrow('outside');
    });

    it('fails closed on a native ACL error and removes only its private input manifest', async () => {
        const item = await fixture();
        const run = jest.fn(async () => { throw Object.assign(new Error('native denied'), { stderr: 'permission denied' }); });
        await expect(configureWindowsBrowserPermissions(item, run)).rejects.toThrow('permission denied');
        expect((await fs.readdir(item.installDirectory)).filter(name => name.startsWith('browser-acl-'))).toEqual([]);
        expect(await fs.readFile(item.privateFile, 'utf8')).toBe('must remain private');
    });
});

async function linuxFixture() {
    const item = await fixture();
    const helper = path.join(item.root, 'chrome_sandbox');
    const executable = path.join(item.root, 'chrome');
    await fs.writeFile(helper, 'pinned public helper fixture');
    await fs.writeFile(executable, 'public chromium fixture');
    const sha256 = crypto.createHash('sha256').update(await fs.readFile(helper)).digest('hex');
    const runtime = { version: 'fixture', linux: { sha256: 'a'.repeat(64), sandboxSha256: sha256 } };
    const receipt = { status: 'passed', browser: 'chromium', version: 'fixture', archiveSha256: runtime.linux.sha256,
        executable, linuxSandboxSource: { path: helper, sha256 } };
    return { ...item, helper, executable, runtime, receipt, sha256 };
}

describe('Linux verified sandbox source', () => {
    it('checks the real source bytes against the pinned member and archive receipt', async () => {
        const item = await linuxFixture();
        expect(await verifyLinuxSandboxSource(item.receipt, item.executable, item.runtime)).toEqual({
            path: item.helper, sha256: item.sha256, archiveSha256: item.runtime.linux.sha256,
        });
        await fs.writeFile(item.helper, 'tampered helper');
        await expect(verifyLinuxSandboxSource(item.receipt, item.executable, item.runtime)).rejects.toThrow('checksum');
    });

    it('rejects a mismatched archive receipt before privileged installation', async () => {
        const item = await linuxFixture();
        await expect(verifyLinuxSandboxSource({ ...item.receipt, archiveSha256: 'b'.repeat(64) }, item.executable, item.runtime))
            .rejects.toThrow('pinned browser');
    });

    it('rejects a hard-linked helper even when its content hash matches', async () => {
        const item = await linuxFixture();
        await fs.link(item.helper, path.join(item.root, 'another-link'));
        await expect(verifyLinuxSandboxSource(item.receipt, item.executable, item.runtime)).rejects.toThrow('file validation');
    });

    it('refuses privileged setup outside the explicit Linux Actions context', async () => {
        process.env.GITHUB_ACTIONS = 'false';
        await expect(installLinuxBrowserSandbox()).rejects.toThrow('restricted to the Linux CI job');
    });
});
