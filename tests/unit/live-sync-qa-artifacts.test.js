/** @jest-environment node */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createQaArtifacts } from '../../scripts/live-sync-qa-artifacts.mjs';
import { runLiveSync, finalizeQa } from '../../scripts/live-sync-qa.mjs';
import { PRIMARY_UID, calendarFixture } from '../../scripts/live-sync-qa-protocol.mjs';

jest.setTimeout(45_000);
const checkoutRoot = fileURLToPath(new URL('../../', import.meta.url));
const sha = '949c791ccc789058abe28254710c86f45326c1d0';
const sentinel = { 'result.json': 'UNRELATED RESULT MUST SURVIVE', 'trace.json': 'UNRELATED TRACE MUST SURVIVE' };
const credentials = {
    primary: { uid: PRIMARY_UID, email: 'synthetic-local@example.invalid', password: 'LOCAL_SYNTHETIC_ONLY' },
};
const candidate = { sha, apiKey: 'synthetic-local-only', release: { revision: 'v2.8.6' } };
const roots = [],
    outputs = [],
    opened = [],
    links = [],
    spies = [];
function spy(object, method) {
    const value = jest.spyOn(object, method);
    spies.push(value);
    return value;
}
function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-qa-artifact-regression-'));
    roots.push({ root, real: fs.realpathSync.native(root) });
    return root;
}
function victim(directory) {
    fs.mkdirSync(directory, { mode: 0o700 });
    for (const [name, contents] of Object.entries(sentinel)) fs.writeFileSync(path.join(directory, name), contents);
}
function expectUntouched(directory) {
    for (const [name, contents] of Object.entries(sentinel)) {
        expect(fs.readFileSync(path.join(directory, name), 'utf8')).toBe(contents);
    }
}
function junction(target, alias) {
    fs.symlinkSync(target, alias, process.platform === 'win32' ? 'junction' : 'dir');
    links.push(alias);
}
function allocate(output) {
    const artifacts = createQaArtifacts({ output, checkoutRoot });
    opened.push(artifacts);
    return artifacts;
}
const options = output => ({ role: 'B', output, sha, runId: crypto.randomUUID(), ...calendarFixture() });
afterEach(() => {
    for (const value of spies.splice(0)) value.mockRestore();
    const errors = [];
    for (const artifacts of opened.splice(0)) {
        try {
            artifacts.close();
        } catch (error) {
            errors.push(error);
        }
    }
    // These are only links installed inside this test's owned fixtures. Remove
    // them explicitly before recursively removing an independently checked root.
    for (const alias of links.splice(0).reverse()) {
        try {
            if (fs.lstatSync(alias).isSymbolicLink()) fs.unlinkSync(alias);
        } catch (error) {
            if (error.code !== 'ENOENT') errors.push(error);
        }
    }
    for (const entry of [...roots.splice(0), ...outputs.splice(0)]) {
        try {
            const resolved = fs.realpathSync.native(entry.root);
            assert.equal(resolved, entry.real);
            assert.equal(path.dirname(resolved), fs.realpathSync.native(os.tmpdir()));
            assert(/^(gym-qa-artifact-regression-|gym-live-sync-qa-)/.test(path.basename(resolved)));
            assert(!fs.lstatSync(entry.root).isSymbolicLink());
            fs.rmSync(resolved, { recursive: true, force: true });
        } catch (error) {
            errors.push(error);
        }
    }
    if (errors.length) throw errors[0];
});

describe('private evidence allocation on the real filesystem', () => {
    it('reserves new distinct default roots and private files before returning, and closes every fd', () => {
        for (let index = 0; index < 2; index++) {
            const artifacts = allocate();
            outputs.push({ root: artifacts.output, real: fs.realpathSync.native(artifacts.output) });
            expect(fs.readFileSync(path.join(artifacts.output, 'result.json'), 'utf8')).toBe('');
            expect(fs.readFileSync(path.join(artifacts.output, 'trace.json'), 'utf8')).toBe('');
            artifacts.verify();
            if (process.platform !== 'win32') {
                expect(fs.statSync(artifacts.output).mode & 0o7777).toBe(0o700);
                for (const name of Object.keys(sentinel)) {
                    const stat = fs.statSync(path.join(artifacts.output, name));
                    expect(stat.uid).toBe(process.getuid());
                    expect(stat.mode & 0o7777).toBe(0o600);
                }
            }
            artifacts.write('trace.json', '{"events":[]}\n');
            artifacts.write('result.json', '{"status":"local-fixture"}\n');
            artifacts.close();
            expect(() => artifacts.write('result.json', '{}')).toThrow('CLOSED_HANDLE');
        }
        expect(outputs[0].root).not.toBe(outputs[1].root);
    });
    it.each(['empty-directory', 'files', 'file', 'junction', 'dangling-junction', 'ancestor-junction'])(
        'refuses %s before any network call and leaves unrelated files intact',
        async kind => {
            const base = fixture(),
                unrelated = path.join(base, 'unrelated');
            victim(unrelated);
            let output = path.join(base, 'evidence');
            if (kind === 'empty-directory') fs.mkdirSync(output);
            if (kind === 'files') {
                fs.mkdirSync(output);
                fs.writeFileSync(path.join(output, 'result.json'), 'EXISTING');
            }
            if (kind === 'file') fs.writeFileSync(output, 'EXISTING');
            if (kind === 'junction') junction(unrelated, output);
            if (kind === 'dangling-junction') junction(path.join(base, 'missing'), output);
            if (kind === 'ancestor-junction') {
                junction(unrelated, path.join(base, 'alias'));
                output = path.join(base, 'alias', 'new-evidence');
            }
            const fetch = spy(globalThis, 'fetch').mockRejectedValue(Error('MUST_NOT_CALL_NETWORK'));
            await expect(runLiveSync(options(output), credentials, candidate)).rejects.toThrow(/QA_ARTIFACT_/);
            expect(fetch).not.toHaveBeenCalled();
            expectUntouched(unrelated);
            if (kind === 'files') expect(fs.readFileSync(path.join(output, 'result.json'), 'utf8')).toBe('EXISTING');
            if (kind === 'file') expect(fs.readFileSync(output, 'utf8')).toBe('EXISTING');
        }
    );
    it('does not create arbitrary missing parent directories', async () => {
        const base = fixture(),
            missing = path.join(base, 'missing'),
            output = path.join(missing, 'evidence');
        const fetch = spy(globalThis, 'fetch').mockRejectedValue(Error('MUST_NOT_CALL_NETWORK'));
        await expect(runLiveSync(options(output), credentials, candidate)).rejects.toThrow();
        expect(fs.existsSync(missing)).toBe(false);
        expect(fetch).not.toHaveBeenCalled();
    });
    it.each(['file', 'hardlink', 'dangling-junction'])(
        'uses actual exclusive file creation against an allocation-time %s substitution',
        async kind => {
            const base = fixture(),
                unrelated = path.join(base, 'unrelated');
            victim(unrelated);
            const output = path.join(base, 'evidence');
            let inserted = false;
            const nativeOpen = fs.openSync;
            const target = path.join(output, 'result.json');
            const reserved = [];
            spy(fs, 'openSync').mockImplementation((name, ...args) => {
                if (name === target && !inserted) {
                    inserted = true;
                    if (kind === 'file') fs.writeFileSync(target, 'FOREIGN INSERTED FILE');
                    if (kind === 'hardlink') fs.linkSync(path.join(unrelated, 'result.json'), target);
                    if (kind === 'dangling-junction') junction(path.join(base, 'absent'), target);
                }
                const fd = nativeOpen(name, ...args);
                if (name === path.join(output, 'trace.json')) reserved.push(fd);
                return fd;
            });
            const fetch = spy(globalThis, 'fetch').mockRejectedValue(Error('MUST_NOT_CALL_NETWORK'));
            await expect(runLiveSync(options(output), credentials, candidate)).rejects.toThrow();
            expect(inserted).toBe(true);
            expect(fetch).not.toHaveBeenCalled();
            expectUntouched(unrelated);
            expect(reserved).toHaveLength(1);
            for (const fd of reserved) expect(() => fs.fstatSync(fd)).toThrow();
            if (kind === 'file') expect(fs.readFileSync(target, 'utf8')).toBe('FOREIGN INSERTED FILE');
        }
    );
    it('refuses to write a retained inode after an unexpected second hardlink is added', () => {
        const base = fixture(),
            artifacts = allocate(path.join(base, 'evidence'));
        const file = path.join(artifacts.output, 'trace.json');
        fs.linkSync(file, path.join(base, 'unrelated-alias'));
        expect(() => artifacts.write('trace.json', 'MUST NOT WRITE')).toThrow('NOT_EXCLUSIVELY_OWNED');
        expect(fs.readFileSync(file, 'utf8')).toBe('');
        expect(fs.readFileSync(path.join(base, 'unrelated-alias'), 'utf8')).toBe('');
    });
});

describe('real runner artifact boundary across long awaits (all fetches throw locally)', () => {
    it.each(['directory-junction', 'same-path-new-directory', 'ancestor-junction', 'file-hardlinks'])(
        'keeps both victims unchanged after a delayed %s replacement and records failure through retained fds',
        async kind => {
            const base = fixture(),
                unrelated = path.join(base, 'unrelated');
            victim(unrelated);
            const parent = path.join(base, 'parent');
            fs.mkdirSync(parent);
            const output = path.join(parent, 'evidence');
            let retained = output,
                renameBlocked = false;
            const rename = (from, to) => {
                try {
                    fs.renameSync(from, to);
                    return true;
                } catch (error) {
                    // Windows may refuse renaming a directory containing our
                    // open files. That is a real prevented attack, not a skip.
                    assert.equal(process.platform, 'win32');
                    assert(['EPERM', 'EACCES', 'EBUSY'].includes(error.code));
                    renameBlocked = true;
                    return false;
                }
            };
            const fetch = spy(globalThis, 'fetch').mockImplementation(async () => {
                // The real runner has already reserved both files before the
                // first Auth call. No service request is sent by this fixture.
                for (const name of Object.keys(sentinel)) {
                    expect(fs.readFileSync(path.join(output, name), 'utf8')).toBe('');
                }
                await delay(1100);
                if (kind === 'ancestor-junction') {
                    const moved = path.join(base, 'parent-retained');
                    if (!rename(parent, moved)) throw new Error('LOCAL_SYNTHETIC_STARTUP_FAILURE_NO_NETWORK');
                    retained = path.join(moved, 'evidence');
                    fs.mkdirSync(path.join(unrelated, 'evidence'));
                    for (const [name, content] of Object.entries(sentinel)) {
                        fs.writeFileSync(path.join(unrelated, 'evidence', name), content);
                    }
                    junction(unrelated, parent);
                } else if (kind === 'file-hardlinks') {
                    for (const name of Object.keys(sentinel)) {
                        fs.renameSync(path.join(output, name), path.join(output, 'retained-' + name));
                        fs.linkSync(path.join(unrelated, name), path.join(output, name));
                    }
                } else {
                    const moved = path.join(parent, 'retained');
                    if (!rename(output, moved)) throw new Error('LOCAL_SYNTHETIC_STARTUP_FAILURE_NO_NETWORK');
                    retained = moved;
                    if (kind === 'directory-junction') junction(unrelated, output);
                    else victim(output);
                }
                throw new Error('LOCAL_SYNTHETIC_STARTUP_FAILURE_NO_NETWORK');
            });
            const result = await runLiveSync(options(output), credentials, candidate);
            expect(fetch).toHaveBeenCalledTimes(1);
            expect(result.status).toBe('failed');
            expect(result.primaryError).toBe('LOCAL_SYNTHETIC_STARTUP_FAILURE_NO_NETWORK');
            expect(result.cleanupErrors.some(entry => entry.name === 'private-artifact-identity')).toBe(!renameBlocked);
            expectUntouched(unrelated);
            if (kind === 'ancestor-junction' && !renameBlocked) expectUntouched(path.join(unrelated, 'evidence'));
            if (kind === 'same-path-new-directory' && !renameBlocked) {
                expectUntouched(output);
                expect(result.cleanupErrors.some(entry => entry.error.includes('DIRECTORY_IDENTITY_CHANGED'))).toBe(
                    true
                );
            }
            const prefix = kind === 'file-hardlinks' ? 'retained-' : '';
            const stored = JSON.parse(fs.readFileSync(path.join(retained, prefix + 'result.json'), 'utf8'));
            expect(stored).toMatchObject({ status: 'failed', sourceSha: sha, phaseCount: 0, requiredPhases: 60 });
            const trace = JSON.parse(fs.readFileSync(path.join(retained, prefix + 'trace.json'), 'utf8'));
            expect(Array.isArray(trace.events)).toBe(true);
            expect(trace.cleanupErrors.some(entry => entry.name === 'private-artifact-identity')).toBe(!renameBlocked);
        }
    );
    it('finishes independent cleanup and trace before writing the final status through owned handles', async () => {
        const base = fixture(),
            artifacts = allocate(path.join(base, 'evidence'));
        const order = [];
        const result = await finalizeQa({
            cleanups: [
                [
                    'first',
                    () => {
                        order.push('first');
                        throw Error('LOCAL_CLEANUP_FAILURE');
                    },
                ],
                [
                    'second',
                    () => {
                        order.push('second');
                        artifacts.verify();
                    },
                ],
            ],
            writeTrace: errors => {
                order.push('trace');
                artifacts.write('trace.json', JSON.stringify({ errors }));
            },
            writeResult: value => {
                order.push('result');
                artifacts.write('result.json', JSON.stringify(value));
            },
        });
        expect(order).toEqual(['first', 'second', 'trace', 'result']);
        expect(result).toMatchObject({
            status: 'failed',
            cleanupErrors: [{ name: 'first', error: 'LOCAL_CLEANUP_FAILURE' }],
        });
        expect(JSON.parse(fs.readFileSync(path.join(artifacts.output, 'result.json'), 'utf8')).status).toBe('failed');
    });
    it('attempts closing both owned handles even if the first close fails', () => {
        const base = fixture(),
            output = path.join(base, 'evidence'),
            retained = [];
        const nativeOpen = fs.openSync,
            nativeClose = fs.closeSync;
        spy(fs, 'openSync').mockImplementation((name, ...args) => {
            const fd = nativeOpen(name, ...args);
            if (Object.keys(sentinel).some(file => name === path.join(output, file))) retained.push(fd);
            return fd;
        });
        const artifacts = allocate(output);
        const attempts = [];
        spy(fs, 'closeSync').mockImplementation(fd => {
            attempts.push(fd);
            if (fd === retained[0]) throw Error('LOCAL_INJECTED_CLOSE_FAILURE');
            nativeClose(fd);
        });
        try {
            expect(() => artifacts.close()).toThrow('QA_ARTIFACT_CLOSE_FAILED');
            expect(attempts).toEqual(retained);
            expect(() => fs.fstatSync(retained[1])).toThrow();
        } finally {
            nativeClose(retained[0]);
        }
    });
});
