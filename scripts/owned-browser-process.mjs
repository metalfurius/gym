import { execFile, spawn } from 'node:child_process';
import process from 'node:process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const activeBrowsers = new Set();
let signalExit = null;
const signalHandlers = new Map();

async function settlesWithin(promise, milliseconds) {
    let timer;
    try {
        return await Promise.race([
            promise.then(() => true, () => false),
            new Promise(resolve => { timer = setTimeout(() => resolve(false), milliseconds); }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

function updateSignalHandlers() {
    for (const [signal, exitCode] of [['SIGINT', 130], ['SIGTERM', 143]]) {
        if (activeBrowsers.size && !signalHandlers.has(signal)) {
            const handler = () => {
                signalExit ||= Promise.allSettled([...activeBrowsers].map(browser => browser.close())).then(results => {
                    for (const result of results) {
                        if (result.status === 'rejected') console.error(result.reason.message);
                    }
                    process.exit(exitCode);
                });
            };
            signalHandlers.set(signal, handler);
            process.once(signal, handler);
        } else if (!activeBrowsers.size && signalHandlers.has(signal)) {
            process.removeListener(signal, signalHandlers.get(signal));
            signalHandlers.delete(signal);
        }
    }
}

export function spawnOwnedBrowser(command, args, {
    browserCloseTimeoutMs = 2_000,
    exitTimeoutMs = 3_000,
    terminationTimeoutMs = 2_000,
    afterClose = async () => {},
    env = process.env,
} = {}) {
    // A dedicated POSIX process group includes xvfb-run, Xvfb, Chrome and its children.
    // Never discover/kill browsers by name or attach this lifecycle to a user process.
    const grouped = process.platform !== 'win32';
    const child = spawn(command, args, { detached: grouped, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], env });
    child.stderr?.resume();
    let closed = false;
    const closePromise = new Promise(resolve => child.once('close', () => { closed = true; resolve(); }));
    child.once('error', () => {});
    let client = null;
    let closing = null;

    function groupAlive() {
        if (!child.pid) return false;
        if (!grouped) return !closed;
        try {
            process.kill(-child.pid, 0);
            return true;
        } catch (error) {
            if (error.code === 'ESRCH') return false;
            throw error;
        }
    }

    async function waitUntilStopped(milliseconds) {
        const deadline = Date.now() + milliseconds;
        do {
            if (closed && !groupAlive()) return true;
            await new Promise(resolve => setTimeout(resolve, Math.min(25, Math.max(1, deadline - Date.now()))));
        } while (Date.now() < deadline);
        return closed && !groupAlive();
    }

    async function terminate(signal) {
        if (!child.pid || !groupAlive()) return;
        if (grouped) {
            try {
                process.kill(-child.pid, signal);
            } catch (error) {
                if (error.code !== 'ESRCH') throw error;
            }
        } else if (child.exitCode === null && child.signalCode === null) {
            // taskkill is restricted to the still-live launcher PID and its descendants.
            await execFileAsync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
                windowsHide: true, timeout: terminationTimeoutMs,
            }).catch(error => {
                if (child.exitCode === null && child.signalCode === null) throw error;
            });
        }
    }

    const owner = {
        process: child,
        setClient(value) { client = value; },
        close() {
            closing ||= (async () => {
                try {
                    // Request graceful browser shutdown before closing the connected CDP socket.
                    if (client) {
                        await settlesWithin(client.send('Browser.close'), browserCloseTimeoutMs);
                        client.close();
                        await settlesWithin(closePromise, exitTimeoutMs);
                    }
                    if (!(await waitUntilStopped(25))) {
                        await terminate('SIGTERM');
                        if (!(await waitUntilStopped(terminationTimeoutMs))) {
                            await terminate('SIGKILL');
                            if (!(await waitUntilStopped(terminationTimeoutMs))) {
                                throw new Error(`[browser-cleanup] owned launcher ${child.pid} or its process group did not stop`);
                            }
                        }
                    }
                    await afterClose();
                } finally {
                    client?.close();
                    // Release only our own inherited pipes, including failed-launch handles.
                    child.stderr?.destroy();
                    if (!closed) child.unref();
                    activeBrowsers.delete(owner);
                    updateSignalHandlers();
                }
            })();
            return closing;
        },
    };
    activeBrowsers.add(owner);
    updateSignalHandlers();
    return owner;
}
