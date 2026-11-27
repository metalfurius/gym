#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const COVERAGE_THRESHOLD = 70;

export function evaluateCoverageSummary(summary) {
    const statements = summary?.total?.statements?.pct;
    if (!Number.isFinite(statements) || statements < 0 || statements > 100) {
        throw new Error('Invalid coverage-summary.json: total.statements.pct must be a finite percentage');
    }
    return { statements, threshold: COVERAGE_THRESHOLD, passed: statements >= COVERAGE_THRESHOLD };
}

function main() {
    const file = path.join(process.cwd(), 'coverage', 'coverage-summary.json');
    const result = evaluateCoverageSummary(JSON.parse(fs.readFileSync(file, 'utf8')));
    console.log(`[coverage-gate] required statements >= ${result.threshold}%.`);
    console.log(`[coverage-gate] statements=${result.statements.toFixed(2)}%.`);
    if (!result.passed) throw new Error(`${result.statements.toFixed(2)}% is below the ${result.threshold}% coverage floor`);
    console.log('[coverage-gate] PASSED.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try { main(); }
    catch (error) { console.error(`[coverage-gate] ERROR: ${error.message}`); process.exitCode = 1; }
}
