/** @jest-environment node */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';
import { ESLint } from 'eslint';

const root = fileURLToPath(new URL('../..', import.meta.url));
const eslint = new ESLint({ cwd: root });
const lint = async (code, extension = 'mjs') => (await eslint.lintText(code, { filePath: `scripts/quality-probe.${extension}` }))[0];

describe('ESLint 10 repository quality contract', () => {
    it.each(['js', 'cjs', 'mjs'])('checks correctness in authored .%s files', async extension => {
        const result = await lint('missingGymSymbol();\n', extension);
        expect(result.messages.map(message => message.ruleId)).toContain('no-undef');
    });

    it('preserves CommonJS and ES module parsing', async () => {
        expect((await lint('module.exports = 1;\n', 'cjs')).messages).toEqual([]);
        expect((await lint('export const value = 1;\n')).messages).toEqual([]);
    });

    it.each([
        ['no-unassigned-vars', 'let value; console.log(value);\n'],
        ['no-useless-assignment', 'let value = 1; value = 2; console.log(value);\n'],
        ['preserve-caught-error', "try { JSON.parse('bad'); } catch (error) { throw new Error('failed'); }\n"],
        ['eqeqeq', "if (1 == '1') console.log('same');\n"],
        ['no-eval', "eval('1');\n"],
    ])('retains the %s rule as a real diagnostic', async (rule, code) => {
        expect((await lint(code)).messages.map(message => message.ruleId)).toContain(rule);
    });

    it('accepts preserved error causes and the existing template-literal policy', async () => {
        const source = "try { JSON.parse('bad'); } catch (error) { throw new Error(`failed`, { cause: error }); }\n";
        expect((await lint(source)).messages).toEqual([]);
    });

    it('keeps the existing formatting policies active through maintained rules', async () => {
        const result = await lint('const value = "double";\nconsole.log(value)\n');
        expect(result.messages.map(message => message.ruleId)).toEqual(expect.arrayContaining(['@stylistic/quotes', '@stylistic/semi']));
    });

    it('makes the actual CLI reject warning-only input at the zero-warning ratchet', () => {
        const result = spawnSync(process.execPath, [path.join(root, 'node_modules/eslint/bin/eslint.js'),
            '--stdin', '--stdin-filename', 'scripts/quality-probe.mjs', '--max-warnings', '0'], {
            cwd: root, input: 'const unusedProbe = 1;\n', encoding: 'utf8', timeout: 15_000,
        });
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(1);
        expect(result.stdout).toContain('no-unused-vars');
        expect(result.stderr).toMatch(/too many warnings/i);
    });

    it('includes the merged browser/sandbox .mjs helpers in the authored lint scope', async () => {
        for (const file of ['browser-cdp-target.mjs', 'browser-protocol-client.mjs', 'browser-windows-permissions.mjs', 'install-linux-browser-sandbox.mjs']) {
            expect(await eslint.isPathIgnored(path.join(root, 'scripts', file))).toBe(false);
        }
    });
});
