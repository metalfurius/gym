/** @jest-environment node */
import { fork, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from '@jest/globals';
import { spawnOwnedBrowser } from '../../scripts/owned-browser-process.mjs';

const fixturePath = fileURLToPath(new URL('../fixtures/owned-browser-process.mjs', import.meta.url));
const directories = [];
const owners = [];
const runners = [];
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function processAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        if (error.code === 'ESRCH') return false;
        throw error;
    }
}

async function waitFor(predicate, label) {
    const deadline = Date.now() + 5_000;
    do {
        if (await predicate()) return;
        await sleep(25);
    } while (Date.now() < deadline);
    throw new Error(`timed out waiting for ${label}`);
}

async function fixture() {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'owned-browser-process-test-'));
    directories.push(directory);
    const profileDirectory = path.join(directory, 'profile');
    await fs.mkdir(profileDirectory);
    const recordPath = path.join(directory, 'processes.jsonl');
    const getProcesses = async () => {
        try {
            return (await fs.readFile(recordPath, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
        } catch (error) {
            if (error.code === 'ENOENT') return [];
            throw error;
        }
    };
    return { profileDirectory, recordPath, getProcesses };
}

afterEach(async () => {
    for (const owner of owners.splice(0)) await owner.close();
    for (const runner of runners.splice(0)) {
        if (runner.exitCode === null && runner.signalCode === null) {
            await new Promise(resolve => {
                runner.once('close', resolve);
                runner.kill();
            });
        }
    }
    for (const directory of directories.splice(0)) await fs.rm(directory, { recursive: true, force: true });
});

describe('owned browser process lifecycle', () => {
    it('gives a child its explicit environment without changing the parent', async () => {
        const { profileDirectory } = await fixture();
        const output = path.join(profileDirectory, 'environment.txt');
        const owner = spawnOwnedBrowser(process.execPath, ['-e',
            'require("node:fs").writeFileSync(process.argv[1], process.env.GYM_OWNED_CHILD_VALUE)', output], {
            env: { ...process.env, GYM_OWNED_CHILD_VALUE: 'isolated-child-value' },
        });
        owners.push(owner);
        await new Promise((resolve, reject) => {
            owner.process.once('error', reject);
            owner.process.once('close', code => code === 0 ? resolve() : reject(new Error(`Child exited ${code}`)));
        });
        expect(await fs.readFile(output, 'utf8')).toBe('isolated-child-value');
        expect(process.env.GYM_OWNED_CHILD_VALUE).not.toBe('isolated-child-value');
        await owner.close();
    });

    it.each(['success', 'protocol-failure', 'protocol-timeout', 'startup-failure'])('terminates a real wrapper and inherited-handle descendant on %s', async mode => {
        const { profileDirectory, recordPath, getProcesses } = await fixture();
        const unrelated = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
            windowsHide: true, stdio: 'ignore',
        });
        runners.push(unrelated);
        const owner = spawnOwnedBrowser(process.execPath, [fixturePath, 'wrapper', recordPath, profileDirectory], {
            browserCloseTimeoutMs: 100, exitTimeoutMs: 100, terminationTimeoutMs: 1_000,
            afterClose: () => fs.rm(profileDirectory, { recursive: true, force: true }),
        });
        owners.push(owner);
        await waitFor(async () => (await getProcesses()).some(item => item.kind === 'leaf'), 'wrapper descendant');
        let connected = true;
        if (mode !== 'startup-failure') {
            owner.setClient({
                async send(method) {
                    expect(connected).toBe(true);
                    expect(method).toBe('Browser.close');
                    if (mode === 'protocol-failure') throw new Error('CDP unavailable');
                    if (mode === 'protocol-timeout') return new Promise(() => {});
                    await fs.writeFile(path.join(profileDirectory, 'close-request'), 'graceful shutdown');
                },
                close() { connected = false; },
            });
        }
        const started = Date.now();
        await Promise.all([owner.close(), owner.close()]);
        expect(Date.now() - started).toBeLessThan(4_000);
        const processes = await getProcesses();
        expect(processes.map(item => item.kind).sort()).toEqual(['leaf', 'wrapper']);
        await waitFor(() => processes.every(item => !processAlive(item.pid)), 'all owned processes to exit');
        expect(processAlive(unrelated.pid)).toBe(true);
        await expect(fs.access(profileDirectory)).rejects.toThrow();
    }, 15_000);

    it('cleans the real owned wrapper tree and profile before cancellation exits the runner', async () => {
        const { profileDirectory, recordPath, getProcesses } = await fixture();
        const runner = fork(fixturePath, ['cancellation', recordPath, profileDirectory], {
            windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
        });
        runners.push(runner);
        runner.stderr.resume();
        const exited = new Promise(resolve => runner.once('close', (code, signal) => resolve({ code, signal })));
        await waitFor(async () => (await getProcesses()).some(item => item.kind === 'leaf'), 'cancellable wrapper descendant');
        if (process.platform === 'win32') runner.send('cancel');
        else runner.kill('SIGTERM');
        let deadline;
        let result;
        try {
            result = await Promise.race([exited, new Promise((_resolve, reject) => {
                deadline = setTimeout(() => reject(new Error('cancelled runner did not exit')), 10_000);
            })]);
        } finally {
            clearTimeout(deadline);
        }
        expect(result).toEqual({ code: 143, signal: null });
        const processes = await getProcesses();
        await waitFor(() => processes.every(item => !processAlive(item.pid)), 'cancelled owned processes to exit');
        await expect(fs.access(profileDirectory)).rejects.toThrow();
    }, 20_000);
});
