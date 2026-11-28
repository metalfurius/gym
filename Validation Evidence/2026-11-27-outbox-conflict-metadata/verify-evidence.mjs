import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const base = '949c791ccc789058abe28254710c86f45326c1d0';
const directory = 'Validation Evidence/2026-11-27-outbox-conflict-metadata';
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024 });
const index = file => git('show', `:${file}`);
const sha = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const json = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const files = git('ls-files', '-z').toString('utf8').split('\0').filter(Boolean);
const baselineFiles = new Set(git('ls-tree', '-r', '--name-only', '-z', base).toString('utf8').split('\0').filter(Boolean));
const release = JSON.parse(index('release.json'));
assert.equal(release.version, '2.8.6');
assert.equal(Object.keys(release.assets).length, 75);
const runtimeDelta = ['js/utils/durable-outbox.js', 'js/utils/offline-manager.js', 'js/utils/outbox-order.js'];
const nativePaths = [
    'outbox-positive/result.json', 'outbox-negative/result.json', 'native-legacy-original/result.json',
    'native-metadata/result.json', 'native-metadata-offline-replay-diagnostic/result.json',
];
const nativeInputs = nativePaths.map(file => ({ file: `${directory}/${file}`, value: JSON.parse(index(`${directory}/${file}`)) }));
const sources = [...new Set([
    ...Object.keys(release.assets), ...nativeInputs.flatMap(({ value }) => Object.keys(value.sourceHashesLf)),
    '.gitattributes', 'sw.js', 'release.json', 'package.json', 'package-lock.json', 'jest.config.js', 'eslint.config.mjs',
    'firestore.rules', 'tests/unit/outbox-conflict-metadata.test.js',
    'scripts/browser-outbox-smoke.mjs', 'scripts/verify-outbox-smoke-negative.mjs',
    'scripts/browser-upgrade-smoke.mjs', 'scripts/browser-smoke-driver.mjs', 'scripts/browser-cdp-target.mjs',
].filter(file => files.includes(file)))].sort();
const sourceRows = sources.map(file => {
    const bytes = index(file);
    const baseline = baselineFiles.has(file) ? git('show', `${base}:${file}`) : null;
    if (!/\.(png|ico)$/.test(file)) assert.equal(bytes.includes(Buffer.from('\r\n')), false, `Noncanonical CRLF in index: ${file}`);
    return { path: file, sizeBytes: bytes.length, sha256: sha(bytes),
        utf8Bom: bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])),
        baseSha256: baseline ? sha(baseline) : null, changedFromBase: !baseline || !baseline.equals(bytes) };
});
const byPath = new Map(sourceRows.map(row => [row.path, row]));
const changedRuntime = sourceRows.filter(row => row.path.startsWith('js/') && row.changedFromBase).map(row => row.path).sort();
assert.deepEqual(changedRuntime, [...runtimeDelta].sort());
const changed = git('diff', '--cached', '--name-only', base).toString('utf8').trim().split('\n').filter(Boolean);
const allowed = new Set([...runtimeDelta, '.gitattributes', 'release.json', 'tests/unit/outbox-conflict-metadata.test.js']);
assert.deepEqual(changed.filter(file => !allowed.has(file) && !file.startsWith(`${directory}/`)), [], 'Unexpected source or historical evidence delta');
for (const [file, hash] of Object.entries(release.assets)) assert.equal(byPath.get(file).sha256, hash, `Release asset mismatch: ${file}`);
for (const { file, value } of nativeInputs) {
    for (const [source, hash] of Object.entries(value.sourceHashesLf)) assert.equal(byPath.get(source).sha256, hash, `Native source mismatch: ${file} / ${source}`);
}
const nativeSources = new Set(nativeInputs.flatMap(({ value }) => Object.keys(value.sourceHashesLf)));
const protectedSources = [...nativeSources].filter(file => !runtimeDelta.includes(file)).sort();
for (const file of protectedSources) assert.equal(byPath.get(file).changedFromBase, false, `Protected source changed: ${file}`);
const excluded = new Set(['source-manifest.json', 'artifact-manifest.json', 'verification-summary.json'].map(file => `${directory}/${file}`));
const artifactRows = files.filter(file => file.startsWith(`${directory}/`) && !excluded.has(file)).sort().map(file => {
    const bytes = index(file);
    if (!file.endsWith('.png')) assert.equal(bytes.includes(Buffer.from('\r\n')), false, `Noncanonical evidence text: ${file}`);
    return { path: file, sizeBytes: bytes.length, sha256: sha(bytes) };
});
const outputs = {
    'source-manifest.json': { base, provenance: 'Git index buffers; LF text, UTF-8 BOM preserved; binary assets unchanged',
        releaseVersion: release.version, releaseAssets: Object.keys(release.assets).length,
        changedRuntime, protectedSources, sources: sourceRows },
    'artifact-manifest.json': { base, provenance: 'Only tracked Git index artifacts in this evidence directory',
        excludes: [...excluded].sort(), artifacts: artifactRows },
    'verification-summary.json': { status: 'passed', base, sources: sourceRows.length, artifacts: artifactRows.length,
        releaseAssets: 75, nativeSourceProofs: nativeInputs.map(({ file }) => file),
        changedRuntime, protectedSources, sourceMismatches: [], artifactMismatches: [], historicalEvidenceChanges: [],
        scope: 'Local integrity proof only; required online metadata scenario passes; offline replay remnant remains open' },
};
for (const [file, value] of Object.entries(outputs)) {
    const target = `${directory}/${file}`;
    if (process.argv.includes('--write')) fs.writeFileSync(path.join(root, target), json(value));
    else assert.equal(index(target).equals(json(value)), true, `Generated manifest differs from staged bytes: ${target}`);
}
console.log(JSON.stringify({ status: 'passed', action: process.argv.includes('--write') ? 'wrote manifests; stage them and run again' : 'verified staged manifests',
    sources: sourceRows.length, artifacts: artifactRows.length, releaseAssets: 75, protectedSources: protectedSources.length,
    changedRuntime, offlineReplayRemnant: 'open; diagnostic exit 1 retained' }));
