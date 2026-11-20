import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const baseline = '4a0f14163399e42955103f3482eee1920d1436bb';
const suffix = `.sync-baseline-${process.pid}.js`;
const progressFile = resolve('js', suffix);
const historyFile = resolve('js/modules', suffix);
const resultFile = resolve(`.sync-baseline-${process.pid}.json`);
const evidenceDirectory = resolve('Validation Evidence/2026-11-20-objective2');
mkdirSync(evidenceDirectory, { recursive: true });
try {
    writeFileSync(progressFile, execFileSync('git', ['show', `${baseline}:js/progress.js`]));
    writeFileSync(historyFile, execFileSync('git', ['show', `${baseline}:js/modules/history-manager.js`]));
    const run = spawnSync(process.execPath, ['--experimental-vm-modules', 'node_modules/jest/bin/jest.js',
        'tests/unit/progress-flow.test.js', 'tests/unit/history-manager.test.js', '--runInBand',
        '--testNamePattern=progress deferred UI ownership|history deferred ownership', '--json', `--outputFile=${resultFile}`], {
        encoding: 'utf8', env: { ...process.env, GYM_SYNC_PROGRESS_MODULE: `../../js/${suffix}`, GYM_SYNC_HISTORY_MODULE: `../../js/modules/${suffix}` },
    });
    const result = JSON.parse(readFileSync(resultFile, 'utf8'));
    const summary = { baseline, node: process.version, exit: run.status, failed: result.numFailedTests, passed: result.numPassedTests };
    writeFileSync(resolve(evidenceDirectory, 'baseline-races.txt'), `${JSON.stringify(summary, null, 2)}\n${run.stdout}\n${run.stderr}`);
    console.log(JSON.stringify(summary));
    if (run.status !== 1 || result.numFailedTests < 5) throw new Error('Expected concrete baseline race failures were not reproduced');
} finally {
    rmSync(progressFile, { force: true }); rmSync(historyFile, { force: true }); rmSync(resultFile, { force: true });
}
