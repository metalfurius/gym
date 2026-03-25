#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TESTS_DIR = path.join(ROOT, 'tests');
const TEST_FILE_RE = /\.test\.js$/;
const SKIP_RE = /\b(?:it|test|describe)\.skip\s*\(|\b(?:xit|xtest|xdescribe)\s*\(/g;

function walk(dir, files = []) {
    if (!fs.existsSync(dir)) return files;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(fullPath, files);
        } else if (entry.isFile() && TEST_FILE_RE.test(entry.name)) {
            files.push(fullPath);
        }
    }

    return files;
}

function toPosixPath(filePath) {
    return filePath.replaceAll(path.sep, '/');
}

function main() {
    const testFiles = walk(TESTS_DIR);
    const findings = [];

    for (const filePath of testFiles) {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split(/\r?\n/);

        lines.forEach((line, idx) => {
            SKIP_RE.lastIndex = 0;
            if (SKIP_RE.test(line)) {
                findings.push(`${toPosixPath(path.relative(ROOT, filePath))}:${idx + 1}: ${line.trim()}`);
            }
        });
    }

    if (findings.length > 0) {
        console.error('[no-skipped-tests] Found skipped tests:');
        findings.forEach((entry) => console.error(`  - ${entry}`));
        process.exit(1);
    }

    console.log('[no-skipped-tests] OK: no skipped tests found.');
}

try {
    main();
} catch (error) {
    console.error(`[no-skipped-tests] ERROR: ${error.message}`);
    process.exit(1);
}
