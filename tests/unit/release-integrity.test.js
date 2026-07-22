import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from '@jest/globals';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, '../..');
const integrityScript = path.join(projectRoot, 'scripts', 'release-integrity.mjs');

describe('release integrity contract', () => {
    it('accepts the current release and two consecutive deterministic builds', () => {
        const output = execFileSync(process.execPath, [integrityScript, '--two-build'], {
            cwd: projectRoot,
            encoding: 'utf8'
        });

        expect(output).toContain('two-build check passed: v2.7.1 -> v2.7.2');
        expect(output).toContain('verified v2.7.1 with');
    });
});
