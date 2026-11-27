/** @jest-environment node */
import { describe, expect, it } from '@jest/globals';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
    parseOptions,
    calendarFixture,
    parseCredentials,
    PRIMARY_UID,
    OTHER_UID,
    canonical,
    redactor,
    encode,
    documentData,
    assertFrozenPreserved,
    sessionPlan,
    ownsSession,
    QaFirebase,
    QaCoordination,
    until,
} from '../../scripts/live-sync-qa-protocol.mjs';
import { canonicalCandidate, startCandidateServer, QaBrowser } from '../../scripts/live-sync-qa-browser.mjs';
import { liveSyncPhases } from '../../scripts/live-sync-qa-scenarios.mjs';
import { finalizeQa, runLiveSync } from '../../scripts/live-sync-qa.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const runId = 'cf48819b-2ba4-4bf3-aad3-9ab04ece07cc';
const sha = 'a'.repeat(40);
const account = { uid: PRIMARY_UID, email: 'synthetic-primary@example.invalid', password: 'synthetic-password-only' };
const other = { uid: OTHER_UID, email: 'synthetic-other@example.invalid', password: 'synthetic-other-password' };
const options = role => ({ role, runId, sha, revision: 'v2.8.6', signal: AbortSignal.timeout(3000) });
const clean = () => redactor([account.email, account.password]);

class MemoryControl {
    constructor() {
        this.document = null;
        this.sequence = 0;
        this.patches = [];
    }
    async request(method, _resource, { data, query = {} } = {}) {
        if (method === 'GET') return this.document && JSON.parse(JSON.stringify(this.document));
        if (
            (query['currentDocument.exists'] === 'false' && this.document) ||
            (query['currentDocument.updateTime'] && query['currentDocument.updateTime'] !== this.document?.updateTime)
        ) {
            throw Object.assign(new Error('synthetic CAS contention'), { status: 412 });
        }
        const mask = query['updateMask.fieldPaths'];
        if (this.document) expect(['roleA', 'roleB']).toContain(mask);
        const prior = this.document ? documentData(this.document) : {};
        const next = mask ? { ...prior, [mask]: data[mask] } : data;
        this.document = { fields: encode(next).mapValue.fields, updateTime: `revision-${++this.sequence}` };
        this.patches.push({ data, query });
        return this.document;
    }
}

describe('opt-in real QA boundaries (synthetic fixtures; no Firebase calls)', () => {
    it('rejects an artifact directory equal to or inside the checkout before any service call', async () => {
        await expect(
            runLiveSync({ ...options('A'), output: root }, { primary: account, other }, { apiKey: 'synthetic' })
        ).rejects.toThrow('OUTSIDE_CHECKOUT');
        await expect(
            runLiveSync(
                { ...options('A'), output: root + '/tmp/inside' },
                { primary: account, other },
                { apiKey: 'synthetic' }
            )
        ).rejects.toThrow('OUTSIDE_CHECKOUT');
    });

    it('persists the stale-base public press while offline before reconnecting for the real conflict', async () => {
        const order = [];
        let durable = false;
        const intent = { id: 'synthetic-intent', baseRevision: 3, target: 7, status: 'pending' };
        const browser = {
            offline: true,
            saveTarget: async () => {
                expect(browser.offline).toBe(true);
                order.push('press-offline');
            },
            network: async offline => {
                expect(durable).toBe(true);
                expect(offline).toBe(false);
                browser.offline = offline;
                order.push('reconnect');
            },
            waitQueue: async predicate => {
                const state = browser.offline
                    ? { online: false, verified: true, queue: [intent], staged: 0, unknown: 0, pendingAcks: 0 }
                    : { online: true, conflicts: 1, queue: [{ ...intent, status: 'conflict' }] };
                expect(predicate(state)).toBe(true);
                order.push(browser.offline ? 'durable-intent' : 'real-conflict');
                durable = true;
                return state;
            },
        };
        const result = await QaBrowser.prototype.submitStaleTarget.call(browser, 7, 'synthetic-clock', 3);
        expect(order).toEqual(['press-offline', 'durable-intent', 'reconnect', 'real-conflict']);
        expect(result.queued[0].baseRevision).toBe(3);
        expect(result.ui.queue[0].status).toBe('conflict');
    });
    it('derives a shared seven-day calendar pair and rejects non-noon, invalid and out-of-window dates', () => {
        expect(calendarFixture()).toMatchObject({
            baseCalendarIso: '2026-11-27T12:00:00.000Z',
            currentCalendarIso: '2026-12-04T12:00:00.000Z',
            initialWeek: '2026-11-23',
            currentWeek: '2026-11-30',
        });
        expect(calendarFixture('2027-01-01T12:00:00Z')).toMatchObject({
            currentCalendarIso: '2027-01-08T12:00:00.000Z',
            initialWeek: '2026-12-28',
            currentWeek: '2027-01-04',
        });
        for (const value of [
            '2026-11-27T13:00:00Z',
            '2026-11-27T12:00:00+00:00',
            '2027-02-30T12:00:00Z',
            '2028-01-01T12:00:00Z',
            '2026-11-20T12:00:00Z',
            '$(unsafe)',
        ]) {
            expect(() => calendarFixture(value)).toThrow('QA_');
        }
        const parsed = parseOptions(
            ['--validate-run', '--role', 'A', '--run-id', runId, '--expected-sha', sha],
            'win32',
            { GYM_QA_BASE_CALENDAR_ISO: '2027-01-01T12:00:00Z' }
        );
        expect(parsed.currentWeek).toBe('2027-01-04');
    });
    it('requires explicit mode, exact SHA, UUID and distinct platform roles', () => {
        const args = ['--live', '--role', 'A', '--run-id', runId, '--expected-sha', sha];
        expect(parseOptions(args, 'win32')).toMatchObject({ role: 'A', live: true, runId, sha });
        expect(() => parseOptions(args, 'linux')).toThrow('WINDOWS_A_LINUX_B');
        expect(() => parseOptions(args.slice(1), 'win32')).toThrow('EXPLICIT_MODE');
        expect(() => parseOptions([...args, '--live'], 'win32')).toThrow('DUPLICATE');
        expect(() => parseOptions([...args, '--arbitrary-command', 'echo'], 'win32')).toThrow('INVALID_ARGUMENTS');
        expect(() =>
            parseOptions(
                args.map(value => (value === runId ? '../../escape' : value)),
                'win32'
            )
        ).toThrow('UUID');
    });

    it('admits only fixed synthetic account UIDs and requires other for role A', () => {
        expect(parseCredentials(JSON.stringify({ primary: account }), 'B')).toEqual({ primary: account });
        expect(parseCredentials(JSON.stringify({ primary: account, other }), 'A').other.uid).toBe(OTHER_UID);
        expect(() => parseCredentials(JSON.stringify({ primary: account }), 'A')).toThrow('FIXED_CREDENTIAL');
        expect(() => parseCredentials(JSON.stringify({ primary: { ...account, uid: 'foreign' }, other }), 'A')).toThrow(
            'FIXED_CREDENTIAL'
        );
        expect(() => parseCredentials(JSON.stringify({ primary: account, admin: {} }), 'B')).toThrow(
            'CREDENTIAL_FIELDS'
        );
    });

    it('redacts credential values, token-like strings, emails and sensitive nested fields', () => {
        const redact = clean();
        redact.add('opaque-refresh-synthetic');
        const output = JSON.stringify(
            redact({
                message: `${account.email} ${account.password} opaque-refresh-synthetic third@example.invalid Bearer abc`,
                nested: { postData: 'private', authorization: 'private', token: 'private', email: 'private' },
                exception: 'eyJabc.defghi.jklmnop',
            })
        );
        for (const privateValue of [
            account.email,
            account.password,
            'opaque-refresh-synthetic',
            'third@example.invalid',
            'Bearer abc',
            'eyJabc.defghi.jklmnop',
            'private',
        ]) {
            expect(output).not.toContain(privateValue);
        }
    });

    it('refuses a wrong authenticated UID before any Firestore request', async () => {
        let calls = 0;
        const api = new QaFirebase({
            apiKey: 'synthetic-key',
            account,
            clean: clean(),
            runId,
            fetchImpl: async () => {
                calls++;
                return { ok: true, json: async () => ({ localId: OTHER_UID, idToken: 'synthetic-token' }) };
            },
        });
        await expect(api.authenticate()).rejects.toThrow('AUTH_UID_MISMATCH');
        expect(calls).toBe(1);
    });

    it('refuses a token for a different Firebase project before any Firestore request', async () => {
        const token = `synthetic.${Buffer.from(JSON.stringify({ aud: 'other-project', sub: PRIMARY_UID, iss: 'https://securetoken.google.com/other-project' })).toString('base64url')}.synthetic`;
        let calls = 0;
        const api = new QaFirebase({
            apiKey: 'synthetic-key',
            account,
            clean: clean(),
            runId,
            fetchImpl: async () => {
                calls++;
                return { ok: true, json: async () => ({ localId: PRIMARY_UID, idToken: token }) };
            },
        });
        await expect(api.authenticate()).rejects.toThrow('TOKEN_PROJECT_MISMATCH');
        expect(calls).toBe(1);
    });

    it('preserves baseline timestamp precision and large integer/unknown Firestore types in comparisons', () => {
        expect(
            documentData({
                fields: {
                    long: { integerValue: '9007199254740993' },
                    time: { timestampValue: '2026-11-27T12:00:00.123456789Z' },
                    reference: { referenceValue: 'synthetic/reference' },
                    bytes: { bytesValue: 'AA==' },
                },
            })
        ).toEqual({
            long: { $integer: '9007199254740993' },
            time: { $timestamp: '2026-11-27T12:00:00.123456789Z' },
            reference: { $reference: 'synthetic/reference' },
            bytes: { $bytes: 'AA==' },
        });
    });

    it('denies direct session, preference, policy and foreign-owner writes even with a token', async () => {
        let calls = 0;
        const api = new QaFirebase({
            apiKey: 'synthetic-key',
            account,
            clean: clean(),
            runId,
            fetchImpl: async () => {
                calls++;
                throw Error('must not fetch');
            },
        });
        api.token = 'synthetic-token';
        for (const suffix of [
            'sesiones_entrenamiento/own',
            'app_data/user_preferences',
            'app_data/sync_protocol',
            'session_mutations/own/receipts/create',
        ]) {
            await expect(
                api.request('PATCH', `users/${PRIMARY_UID}/${suffix}`, { data: { forbidden: true } })
            ).rejects.toThrow('DIRECT_PRODUCT_WRITE_DENIED');
        }
        await expect(api.request('GET', `users/${OTHER_UID}/app_data/user_preferences`)).rejects.toThrow(
            'FOREIGN_RESOURCE'
        );
        await expect(
            api.request('PATCH', `users/${PRIMARY_UID}/qa_sync_runs/ab48819b-2ba4-4bf3-aad3-9ab04ece07cc`, { data: {} })
        ).rejects.toThrow('DIRECT_PRODUCT_WRITE_DENIED');
        await expect(api.request('DELETE', `users/${PRIMARY_UID}/routines/codex-live-qa-${runId}`)).rejects.toThrow(
            'CAS_CLEANUP'
        );
        await expect(
            api.request('PATCH', `users/${PRIMARY_UID}/routines/codex-live-qa-${runId}`, { data: {} })
        ).rejects.toThrow('CREATE_ONLY');
        expect(calls).toBe(0);
    });

    it('survives simultaneous role claims and role-specific patches without overwriting its peer', async () => {
        const api = new MemoryControl();
        const a = new QaCoordination(api, options('A')),
            b = new QaCoordination(api, options('B'));
        await Promise.all([a.claim(), b.claim()]);
        await Promise.all([
            a.publish('phase', 'done', { observed: 'A' }),
            b.publish('phase', 'done', { observed: 'B' }),
        ]);
        expect(documentData(api.document)).toMatchObject({
            roleA: { completed: { phase: { observed: 'A' } } },
            roleB: { completed: { phase: { observed: 'B' } } },
        });
        expect(await a.wait('phase', 'done')).toEqual({ observed: 'B' });
        const duplicate = new QaCoordination(api, options('A'));
        await expect(duplicate.claim()).rejects.toThrow('ALREADY_CLAIMED');
        await expect(duplicate.publish('bad', 'failed')).rejects.toThrow('UNCLAIMED');
        expect(documentData(api.document).roleA.completed.phase).toEqual({ observed: 'A' });
    });

    it('terminates immediately on peer error or a different source SHA', async () => {
        const api = new MemoryControl();
        const a = new QaCoordination(api, options('A')),
            b = new QaCoordination(api, options('B'));
        await a.claim();
        await b.claim();
        await b.publish('phase', 'failed', null, { message: 'synthetic failure' });
        await expect(a.wait('phase', 'done')).rejects.toThrow('PEER_FAILED');
        const wrong = new QaCoordination(api, { ...options('A'), sha: 'b'.repeat(40) });
        expect(() => wrong.verify(api.document)).toThrow('SOURCE_MISMATCH');
        const differentClock = new QaCoordination(api, {
            ...options('A'),
            baseCalendarIso: '2027-01-01T12:00:00.000Z',
        });
        expect(() => differentClock.verify(api.document)).toThrow('SOURCE_MISMATCH');
    });

    it('never treats elapsed sleep as success and respects the bounded wait', async () => {
        let calls = 0;
        await expect(
            until(
                () => {
                    calls++;
                    return false;
                },
                { timeoutMs: 8, intervalMs: 2, label: 'synthetic-negative' }
            )
        ).rejects.toThrow('QA_TIMEOUT:synthetic-negative');
        expect(calls).toBeGreaterThanOrEqual(1);
        const controller = new AbortController();
        controller.abort();
        await expect(until(() => true, { signal: controller.signal })).rejects.toThrow();
    });

    it('plans a single owned last-page sentinel without mutating baseline data', () => {
        for (let count = 0; count < 21; count++) {
            const baseline = Array.from({ length: count }, (_, index) => ({
                id: `old-${index}`,
                data: { fecha: { $timestamp: '2026-11-01T00:00:00Z' } },
            }));
            const snapshot = canonical(baseline),
                plan = sessionPlan(baseline);
            expect((count + plan.count) % 10).toBe(1);
            expect(plan.count).toBeGreaterThanOrEqual(11);
            expect(plan.count).toBeLessThanOrEqual(20);
            expect(Date.parse(plan.sentinelIso)).toBeLessThan(Date.parse('2026-11-01T00:00:00Z'));
            expect(canonical(baseline)).toBe(snapshot);
        }
        expect(() => sessionPlan([{ id: 'old', data: { fecha: 'unreadable' } }])).toThrow('BASELINE_DATE');
        expect(
            ownsSession(
                { userId: PRIMARY_UID, routineId: `codex-live-qa-${runId}`, nombreEntrenamiento: `Codex QA ${runId}` },
                runId
            )
        ).toBe(true);
        expect(ownsSession({ userId: OTHER_UID, routineId: `codex-live-qa-${runId}` }, runId)).toBe(false);
        expect(() =>
            assertFrozenPreserved(
                { weeklyOutcomesByWeek: { old: { met: true } } },
                { weeklyOutcomesByWeek: { old: { met: false } } }
            )
        ).toThrow('FROZEN_OUTCOME_CHANGED');
    });

    it('declares both reconnect orders, cold restart, explicit resolution, account isolation and surface cleanup', () => {
        const phases = liveSyncPhases(),
            names = phases.map(item => item.name);
        expect(new Set(names).size).toBe(phases.length);
        expect(names.indexOf('different-week-A-offline-plus7d')).toBeLessThan(
            names.indexOf('different-week-B-online-base')
        );
        expect(names.indexOf('different-week-B-online-base')).toBeLessThan(names.indexOf('different-week-A-reconnect'));
        expect(names.indexOf('cold-A-two-offline-intents')).toBeLessThan(
            names.indexOf('cold-A-full-process-offline-restart')
        );
        for (const order of ['A-then-B', 'B-then-A']) {
            expect(phases.find(item => item.name === `${order}-first-reconnect-${order[0]}`).actor).toBe(order[0]);
            expect(names).toContain(`${order}-second-explicit-resolution`);
        }
        for (const action of [
            'owner-other',
            'owner-primary',
            'reauthenticate',
            'sessions',
            'surfaces',
            'delete-sentinel',
            'cleanup-sessions',
            'baseline-preserved',
        ]) {
            expect(phases.some(item => item.action === action)).toBe(true);
        }
    });

    it('attempts all cleanups, writes trace and emits failure only after preserving primary and cleanup errors', async () => {
        const order = [];
        let result;
        await finalizeQa({
            primaryError: Error('primary'),
            cleanups: [
                [
                    'browser',
                    () => {
                        order.push('browser');
                        throw Error('cleanup');
                    },
                ],
                [
                    'profile',
                    errors => {
                        order.push('profile');
                        expect(errors).toHaveLength(1);
                    },
                ],
                ['server', () => order.push('server')],
            ],
            writeTrace: () => {
                order.push('trace');
                throw Error('trace-write');
            },
            writeResult: value => {
                order.push('result');
                result = value;
            },
        });
        expect(order).toEqual(['browser', 'profile', 'server', 'trace', 'result']);
        expect(result).toMatchObject({
            status: 'failed',
            primaryError: 'primary',
            cleanupErrors: [
                { name: 'browser', error: 'cleanup' },
                { name: 'trace', error: 'trace-write' },
            ],
        });
    });

    it('fails the CLI closed without credentials and never starts a browser or service run', () => {
        const env = { ...process.env };
        delete env.GYM_LIVE_QA_CREDENTIALS_JSON;
        const child = spawnSync(
            process.execPath,
            [
                'scripts/live-sync-qa.mjs',
                '--live',
                '--role',
                process.platform === 'win32' ? 'A' : 'B',
                '--run-id',
                runId,
                '--expected-sha',
                sha,
            ],
            { cwd: root, env, encoding: 'utf8' }
        );
        expect(child.status).toBe(1);
        expect(child.stderr).toContain('QA_CREDENTIALS_JSON_REQUIRED');
        expect(child.stdout).toBe('');
    });

    it('keeps the eight original matrix cases and sandbox body unchanged; secrets exist only in the opt-in step', () => {
        const workflow = fs
            .readFileSync(new URL('../../.github/workflows/browser-gates.yml', import.meta.url), 'utf8')
            .replace(/\r\n/g, '\n');
        // Canonical original browser-job body from immutable 9a69595. A hash
        // keeps this assertion usable in shallow CI checkouts without Git history.
        const originalBrowserJobSha256 = 'a62d866ea25cf5506169892c265b14141c2b4ea1d19b1c84a77df02255316d96';
        expect(
            crypto
                .createHash('sha256')
                .update(
                    workflow
                        .slice(workflow.indexOf('    browser:\n'), workflow.indexOf('\n    real-sync-qa:'))
                        .trimEnd()
                )
                .digest('hex')
        ).toBe(originalBrowserJobSha256);
        const optIn = workflow.slice(workflow.indexOf('    real-sync-qa:'));
        expect(optIn).toContain(
            "github.event_name == 'workflow_dispatch' && inputs.real_firebase_qa == true && github.ref == 'refs/heads/codex/roadmap-02-history-sync'"
        );
        expect(workflow.match(/secrets\.GYM_LIVE_QA_CREDENTIALS_JSON/g) || []).toHaveLength(1);
        expect(optIn).toContain('install-linux-browser-sandbox.mjs');
        expect(optIn).not.toContain('--no-sandbox');
        expect(optIn).toContain('if: always()');
        expect(workflow).toContain('default: false');
    });
});

describe('canonical Git-only loopback server', () => {
    function fixture({ dirty = false, corrupt = false, escape = false } = {}) {
        const files = {
            'index.html': Buffer.from('<meta name="gym-release-revision" content="v1.0.0">'),
            'manifest.json': Buffer.from(JSON.stringify({ release_revision: 'v1.0.0' })),
            'sw.js': Buffer.from("const RELEASE_REVISION = 'v1.0.0';"),
            'js/firebase-config.js': Buffer.from("const config={projectId:'gymm-178fb',apiKey:'synthetic-api-key'};"),
            'assets/probe.png': Buffer.from([0, 255, 10, 128]),
        };
        const assets = Object.fromEntries(
            Object.entries(files)
                .filter(([name]) => name !== 'sw.js')
                .map(([name, bytes]) => [name, crypto.createHash('sha256').update(bytes).digest('hex')])
        );
        if (corrupt) assets['assets/probe.png'] = '0'.repeat(64);
        if (escape) assets['../outside'] = '0'.repeat(64);
        files['release.json'] = Buffer.from(JSON.stringify({ revision: 'v1.0.0', assets }));
        const git = args =>
            args[0] === 'status'
                ? Buffer.from(dirty ? ' M index.html' : '')
                : args[0] === 'rev-parse'
                    ? Buffer.from(sha)
                    : files[args[1].slice(5)];
        return { candidate: () => canonicalCandidate(root, sha, git), files };
    }
    it('rejects dirty checkouts, asset hash mismatches and paths outside the declared release', () => {
        expect(() => fixture({ dirty: true }).candidate()).toThrow('CLEAN_CHECKOUT');
        expect(() => fixture({ corrupt: true }).candidate()).toThrow('CANONICAL_ASSET_HASH');
        expect(() => fixture({ escape: true }).candidate()).toThrow('ASSET_ESCAPE');
    });
    it('serves exact binary Git bytes and no arbitrary filesystem, proxy or POST', async () => {
        const { candidate, files } = fixture();
        const server = await startCandidateServer(candidate());
        try {
            const response = await fetch(new URL('assets/probe.png?cache-bust=permitted', server.url));
            expect(Buffer.from(await response.arrayBuffer())).toEqual(files['assets/probe.png']);
            expect(response.headers.get('x-gym-qa-source')).toBe(sha);
            expect((await fetch(new URL('unknown', server.url))).status).toBe(404);
            expect((await fetch(new URL('index.html', server.url), { method: 'POST' })).status).toBe(405);
        } finally {
            await server.close();
        }
    });
});
