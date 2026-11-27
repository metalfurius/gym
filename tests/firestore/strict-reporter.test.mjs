import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rmdir, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { test } from 'node:test';

test('the real test CLI rejects skipped, TODO and failing cases while accepting a real pass', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'gym-rules-reporter-'));
    const file = path.join(directory, 'case.mjs');
    const childEnvironment = { ...process.env };
    delete childEnvironment.NODE_TEST_CONTEXT;
    try {
        for (const [options, body, expected] of [
            ['{}', '', 0],
            ['{skip:true}', '', 1],
            ['{todo:true}', '', 1],
            ['{}', 'throw new Error("deliberate assertion failure")', 1],
        ]) {
            await writeFile(file, `import {test} from 'node:test';test('fixture',${options},()=>{${body}});\n`);
            const result = spawnSync(
                process.execPath,
                ['--test', `--test-reporter=${new URL('./strict-reporter.mjs', import.meta.url).href}`, file],
                { encoding: 'utf8', timeout: 15_000, windowsHide: true, env: childEnvironment }
            );
            assert.ifError(result.error);
            assert.equal(result.status, expected, `${options}: ${result.stdout}\n${result.stderr}`);
            assert.match(result.stdout, /RULES_SUMMARY/);
            if (options !== '{}') assert.match(result.stderr, /Rules test gate rejects/);
        }
    } finally {
        await unlink(file).catch(error => {
            if (error.code !== 'ENOENT') throw error;
        });
        await rmdir(directory);
    }
});
