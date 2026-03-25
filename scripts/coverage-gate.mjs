#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const COVERAGE_SUMMARY_PATH = path.join(process.cwd(), 'coverage', 'coverage-summary.json');

const STAGES = [
    { from: '2026-04-06', threshold: 64 },
    { from: '2026-04-20', threshold: 67 },
    { from: '2026-05-04', threshold: 70 }
];

function parseDateOnly(value) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
        throw new Error(`Invalid date: ${value}`);
    }
    return date;
}

function getEffectiveThreshold(dateOnlyUtc) {
    let selected = null;
    for (const stage of STAGES) {
        if (dateOnlyUtc >= parseDateOnly(stage.from)) {
            selected = stage.threshold;
        }
    }
    return selected;
}

function getGateDate() {
    const override = process.env.COVERAGE_GATE_DATE;
    if (override) {
        return parseDateOnly(override);
    }

    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    return parseDateOnly(`${yyyy}-${mm}-${dd}`);
}

function formatDateOnly(date) {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function readCoverageSummary() {
    if (!fs.existsSync(COVERAGE_SUMMARY_PATH)) {
        throw new Error(`Coverage summary not found: ${COVERAGE_SUMMARY_PATH}`);
    }

    const raw = fs.readFileSync(COVERAGE_SUMMARY_PATH, 'utf8');
    const parsed = JSON.parse(raw);

    const statements = parsed?.total?.statements?.pct;
    if (typeof statements !== 'number') {
        throw new Error('Invalid coverage-summary.json: missing total.statements.pct');
    }

    return statements;
}

function main() {
    const gateDate = getGateDate();
    const gateDateLabel = formatDateOnly(gateDate);
    const threshold = getEffectiveThreshold(gateDate);
    const statementsPct = readCoverageSummary();

    if (threshold == null) {
        console.log(`[coverage-gate] ${gateDateLabel}: baseline window (no staged threshold yet).`);
        console.log(`[coverage-gate] statements=${statementsPct.toFixed(2)}%.`);
        return;
    }

    console.log(`[coverage-gate] ${gateDateLabel}: required statements >= ${threshold}%.`);
    console.log(`[coverage-gate] statements=${statementsPct.toFixed(2)}%.`);

    if (statementsPct < threshold) {
        console.error(
            `[coverage-gate] FAILED: ${statementsPct.toFixed(2)}% is below ${threshold}% staged gate.`
        );
        process.exit(1);
    }

    console.log('[coverage-gate] PASSED.');
}

try {
    main();
} catch (error) {
    console.error(`[coverage-gate] ERROR: ${error.message}`);
    process.exit(1);
}
