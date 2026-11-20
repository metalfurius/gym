import { spawn } from 'node:child_process';
import { appendFileSync, existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnOwnedBrowser } from '../../scripts/owned-browser-process.mjs';

const [mode, recordPath, profileDirectory] = process.argv.slice(2);
const fixturePath = fileURLToPath(import.meta.url);
const closeRequest = path.join(profileDirectory, 'close-request');
const record = kind => appendFileSync(recordPath, `${JSON.stringify({ kind, pid: process.pid })}\n`);

if (mode === 'leaf') {
    record('leaf');
    setInterval(() => {}, 1_000);
} else if (mode === 'wrapper') {
    record('wrapper');
    // The descendant retains the launcher's stderr pipe, reproducing xvfb-run's inherited handles.
    const leaf = spawn(process.execPath, [fixturePath, 'leaf', recordPath, profileDirectory], {
        windowsHide: true, stdio: ['ignore', 'ignore', 'inherit'],
    });
    let stopping = false;
    const stop = () => {
        if (stopping) return;
        stopping = true;
        leaf.once('exit', () => process.exit(0));
        leaf.kill();
    };
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
    setInterval(() => { if (existsSync(closeRequest)) stop(); }, 20);
} else if (mode === 'cancellation') {
    await fs.mkdir(profileDirectory, { recursive: true });
    const owner = spawnOwnedBrowser(process.execPath, [fixturePath, 'wrapper', recordPath, profileDirectory], {
        afterClose: () => fs.rm(profileDirectory, { recursive: true, force: true }),
    });
    owner.setClient({
        send: async () => fs.writeFile(closeRequest, 'graceful shutdown'),
        close() {},
    });
    process.on('message', message => {
        if (message === 'cancel') process.emit('SIGTERM');
    });
    process.send?.('ready');
}
