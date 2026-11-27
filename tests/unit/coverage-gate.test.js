/** @jest-environment node */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from '@jest/globals';
import { evaluateCoverageSummary } from '../../scripts/coverage-gate.mjs';

const roots = [];
const script = fileURLToPath(new URL('../../scripts/coverage-gate.mjs', import.meta.url));

afterEach(async () => {
    for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

async function runSummary(summary) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gym-coverage-gate-test-'));
    roots.push(root);
    await fs.mkdir(path.join(root, 'coverage'));
    await fs.writeFile(path.join(root, 'coverage/coverage-summary.json'), JSON.stringify(summary));
    return spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8', timeout: 5_000,
        env: { ...process.env, COVERAGE_GATE_DATE: '2026-01-01' } });
}

describe('permanent coverage floor', () => {
    it.each([[0, 1], [69.99, 1], [70, 0], [100, 0]])('checks %s%% with exit %s even with an expired date override', async (percentage, expected) => {
        const result = await runSummary({ total: { statements: { pct: percentage } } });
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(expected);
        expect(result.stdout).toContain('required statements >= 70%');
        if (expected === 1) expect(result.stderr).toContain('70% coverage floor');
    });

    it.each([null, '75', -1, 101])('rejects malformed/out-of-range percentage %s', async percentage => {
        const result = await runSummary({ total: { statements: { pct: percentage } } });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('finite percentage');
    });

    it('does not accept non-finite or missing coverage values', () => {
        expect(() => evaluateCoverageSummary({ total: { statements: { pct: NaN } } })).toThrow('finite percentage');
        expect(() => evaluateCoverageSummary({})).toThrow('finite percentage');
    });
});
