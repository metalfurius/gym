import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const evidence = path.resolve(process.env.WEEKLY_RESOLUTION_EVIDENCE_DIR || path.join(root, 'Validation Evidence/2026-11-28-weekly-offline-resolution'));
const output = path.join(evidence, 'native-legacy-original');
// This invocation owns a new directory; an existing result is never overwritten.
await fs.mkdir(output);
const file = 'Validation Evidence/2026-11-27-objective2-review-bdab/native-legacy-resolution.mjs.txt';
const original = await fs.readFile(path.join(root, file), 'utf8');
const adapted = original
    .replaceAll('file:///C:/tmp/gym-roadmap-02-legacy-fix/scripts/', pathToFileURL(path.join(root, 'scripts/')).href)
    .replace("path.resolve('C:/tmp/gym-roadmap-02-legacy-fix')", `path.resolve(${JSON.stringify(root)})`);
const hash = value => crypto.createHash('sha256').update(value.replace(/\r\n?/g, '\n')).digest('hex');
await fs.writeFile(path.join(output, 'recipe-adaptation.json'), `${JSON.stringify({
    original: file, originalSha256Lf: hash(original), adaptedSha256Lf: hash(adapted),
    adaptation: 'Only two helper import prefixes and the served worktree root; all original assertions unchanged',
    output,
}, null, 2)}\n`);
process.env.OUTBOX_SMOKE_EVIDENCE_DIR = output;
delete process.env.OUTBOX_SMOKE_NEGATIVE_CASE;
await import(`data:text/javascript;base64,${Buffer.from(adapted).toString('base64')}`);
