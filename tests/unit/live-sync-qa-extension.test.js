/** @jest-environment node */
import { describe, expect, it } from '@jest/globals';
import { CommitObservation, coordinateOnlineOverlap } from '../../scripts/live-sync-qa-observations.mjs';
import {
    captureFixtures,
    calendarFixture,
    verifyCaptureRecords,
    assertOnlineRace,
    digest,
    QaCoordination,
    encode,
    documentData,
} from '../../scripts/live-sync-qa-protocol.mjs';
import { liveSyncPhases } from '../../scripts/live-sync-qa-scenarios.mjs';
import { QaBrowser } from '../../scripts/live-sync-qa-browser.mjs';

const endpoint = 'https://firestore.googleapis.com/v1/projects/gymm-178fb/databases/(default)/documents:commit';
const begin = (requestId = 'private-request-id', url = endpoint) => ({
    method: 'Network.requestWillBeSent',
    params: { requestId, timestamp: 10, wallTime: 1700000000, request: { url, method: 'POST' } },
});
const finish = (requestId = 'private-request-id') => ({
    method: 'Network.loadingFinished',
    params: { requestId, timestamp: 12 },
});
const response = (requestId = 'private-request-id', status = 200) => ({
    method: 'Network.responseReceived',
    params: { requestId, response: { status } },
});
const flush = () => new Promise(resolve => setImmediate(resolve));

describe('Commit metadata observation (synthetic CDP events, no live service)', () => {
    it('observes only fixed-project Commit begin/end and never accesses credentials, headers or bodies', async () => {
        const observation = new CommitObservation();
        observation.begin();
        const event = begin('sensitive-id', endpoint + '?key=private-query');
        for (const key of ['headers', 'postData', 'postDataEntries']) {
            Object.defineProperty(event.params.request, key, {
                get() {
                    throw Error('private payload must not be read');
                },
            });
        }
        observation.observe(event, async () => true);
        await flush();
        expect(observation.requireOpen()).toMatchObject({ ordinal: 1, online: true, startMono: 10 });
        const partial = observation.snapshot();
        expect(partial[0]).not.toHaveProperty('endMono');
        partial[0].online = false;
        expect(observation.requireOpen().online).toBe(true);
        observation.observe({
            method: 'Network.responseReceived',
            params: {
                requestId: 'sensitive-id',
                timestamp: 11,
                response: { status: 200, headers: { authorization: 'secret' } },
            },
        });
        observation.observe(finish('sensitive-id'));
        const rows = await observation.finish();
        expect(rows).toEqual([
            {
                ordinal: 1,
                startMono: 10,
                startWallMs: 1700000000000,
                online: true,
                httpStatus: 200,
                endMono: 12,
                endWallMs: 1700000002000,
                failedTransport: false,
            },
        ]);
        expect(JSON.stringify(rows)).not.toMatch(/private|sensitive|authorization|secret|url|headers|postData/i);
        expect(() => observation.observe(response('sensitive-id', { private: 'secret' }))).not.toThrow(); // finished window is inert
    });
    it.each([
        endpoint.replace('gymm-178fb', 'other-project'),
        endpoint.replace('firestore.googleapis.com', 'attacker.invalid'),
        endpoint.replace(':commit', ':batchGet'),
        endpoint.replace('https://', 'https://private:password@'),
    ])('ignores non-approved request metadata %s', async url => {
        const observation = new CommitObservation();
        observation.begin();
        observation.observe(begin('ignored', url), () => {
            throw Error('must not probe');
        });
        expect(observation.openFirst()).toBe(false);
        await expect(observation.finish()).rejects.toThrow('INCOMPLETE');
    });
    it('fails incomplete/offline observations and cannot replace the closed first Commit with a later one', async () => {
        const observation = new CommitObservation();
        observation.begin();
        observation.observe(begin('first'), async () => true);
        await flush();
        observation.observe(response('first'));
        observation.observe(finish('first'));
        observation.observe(begin('second'), async () => true);
        await flush();
        expect(observation.openFirst()).toBe(false);
        expect(() => observation.requireOpen(1)).toThrow('NOT_OBSERVED_OPEN');
        await expect(observation.finish()).rejects.toThrow('INCOMPLETE');
        observation.observe(finish('second'));
        await observation.finish();
        observation.begin();
        observation.observe(begin(), async () => false);
        await flush();
        observation.observe(finish());
        await expect(observation.finish()).rejects.toThrow('OBSERVED_OFFLINE');
    });
    it('does not accept a transport-failed first attempt as evidence of real HTTP writes', async () => {
        const observation = new CommitObservation();
        observation.begin();
        observation.observe(begin(), async () => true);
        await flush();
        observation.observe({
            method: 'Network.loadingFailed',
            params: { requestId: 'private-request-id', timestamp: 12 },
        });
        await expect(observation.finish()).rejects.toThrow('HTTP_RESPONSE_REQUIRED');
    });
    it('converts malformed-event failures into controlled sanitized QA errors rather than uncaught protocol callbacks', async () => {
        const browser = {
            commitObservation: {
                observe() {
                    throw Error('private-secret');
                },
            },
            trace: [],
            signal: AbortSignal.timeout(1000),
            client: {},
        };
        QaBrowser.prototype.event.call(browser, {
            method: 'Network.requestWillBeSent',
            params: { secret: 'private-secret' },
        });
        expect(browser.trace).toHaveLength(1);
        expect(JSON.stringify(browser.trace)).not.toContain('private');
        await expect(QaBrowser.prototype.waitPage.call(browser, 'true', 'controlled-error')).rejects.toThrow(
            'QA_COMMIT_OBSERVATION_FAILED'
        );
    });
});

class SharedControl {
    async request(method, _resource, { data, query = {} } = {}) {
        if (method === 'GET') return this.document && JSON.parse(JSON.stringify(this.document));
        if (
            (query['currentDocument.exists'] === 'false' && this.document) ||
            (query['currentDocument.updateTime'] && query['currentDocument.updateTime'] !== this.document?.updateTime)
        ) {
            throw Object.assign(Error('CAS'), { status: 412 });
        }
        const mask = query['updateMask.fieldPaths'];
        const previous = this.document ? documentData(this.document) : {};
        this.document = {
            fields: encode(mask ? { ...previous, [mask]: data[mask] } : data).mapValue.fields,
            updateTime: String((this.sequence = (this.sequence || 0) + 1)),
        };
        return this.document;
    }
}
describe('causal cross-host overlap proof without wall-clock synchronization', () => {
    it('keeps the main phase ready while fixed signals prove the same A request encloses B observation', async () => {
        const api = new SharedControl();
        const common = {
            runId: 'cf48819b-2ba4-4bf3-aad3-9ab04ece07cc',
            sha: 'a'.repeat(40),
            revision: 'v2.8.6',
            signal: AbortSignal.timeout(3000),
        };
        const a = new QaCoordination(api, { ...common, role: 'A' }),
            b = new QaCoordination(api, { ...common, role: 'B' });
        await Promise.all([a.claim(), b.claim()]);
        await Promise.all([a.publish('main-online-press', 'ready'), b.publish('main-online-press', 'ready')]);
        const calls = [];
        const browser = role => ({
            waitOpenCommit: async () => ({
                ordinal: 1,
                startMono: role === 'A' ? 10 : 9999,
                startWallMs: role === 'A' ? 1000 : 9000000000,
                online: true,
            }),
            requireOpenCommit: ordinal => {
                calls.push(role + ordinal);
                return { ordinal };
            },
        });
        const [left, right] = await Promise.all([
            coordinateOnlineOverlap({ browser: browser('A'), coord: a, role: 'A' }),
            coordinateOnlineOverlap({ browser: browser('B'), coord: b, role: 'B' }),
        ]);
        expect(left).toEqual(right);
        expect(left).toMatchObject({
            sameARequestStillOpen: true,
            bObservedOpenBetween: true,
            clockSynchronizationAssumed: false,
        });
        expect(calls.sort()).toEqual(['A1', 'B1']);
        const state = documentData(api.document);
        expect(state.roleA.phase).toBe('main-online-press');
        expect(state.roleB.phase).toBe('main-online-press');
        expect(state.roleA.completed['main-online-press']).toBeUndefined();
        expect(state.roleB.completed['main-online-press']).toBeUndefined();
    });
    it('rejects an expired A request instead of claiming overlap from unsynchronized timestamps', async () => {
        const browser = {
            waitOpenCommit: async () => ({ ordinal: 1, online: true }),
            requireOpenCommit() {
                throw Error('QA_SAME_COMMIT_NOT_OBSERVED_OPEN_ONLINE');
            },
        };
        const coord = {
            publishSignal: async () => {},
            waitSignal: async () => ({ sawAOrdinal: 1, own: { ordinal: 1 } }),
        };
        await expect(coordinateOnlineOverlap({ browser, coord, role: 'A' })).rejects.toThrow('SAME_COMMIT');
    });
});

describe('four-capture fixture and online CAS acceptance assertions', () => {
    function records() {
        const fixture = captureFixtures(calendarFixture());
        const rows = fixture.map((item, index) => ({
            id: `id-${index}`,
            data: {
                nombreEntrenamiento: 'QA capture',
                fecha: { $timestamp: item.calendarIso },
                ejercicios: [{ sets: [{ peso: item.weight, reps: item.reps }] }],
            },
        }));
        const manifest = rows.map((row, index) => ({
            id: row.id,
            label: 'QA capture',
            ...fixture[index],
            dataHash: digest(row.data),
        }));
        return { rows, manifest };
    }
    it('uses distinct weights and explicit monotonic one-second dates on the shared day; fallback remains three records', () => {
        const { rows, manifest } = records();
        expect(manifest.map(item => item.weight)).toEqual([50.5, 51.5, 52.5, 53.5]);
        expect(new Set(manifest.map(item => item.calendarIso.slice(0, 10))).size).toBe(1);
        expect(manifest.map(item => Date.parse(item.calendarIso) - Date.parse(manifest[0].calendarIso))).toEqual([
            0, 1000, 2000, 3000,
        ]);
        expect(verifyCaptureRecords(manifest, rows)).toMatchObject({ count: 4, best: 53.5, latest: { id: 'id-3' } });
        expect(verifyCaptureRecords(manifest, rows.slice(0, 3))).toMatchObject({
            count: 3,
            best: 52.5,
            latest: { id: 'id-2' },
        });
        expect(() => verifyCaptureRecords(manifest, [rows[0], rows[2], rows[3]])).toThrow('WRONG_STRENGTH');
        rows[0].data.fecha.$timestamp = manifest[1].calendarIso;
        expect(() => verifyCaptureRecords(manifest, rows)).toThrow('DATE_CHANGED');
    });
    function online() {
        const base = {
            weekKey: '2026-11-30',
            revision: 4,
            preferencesRevision: 10,
            operationId: 'base-op',
            fingerprint: 'same-semantic-base',
        };
        const overlap = {
            aOrdinal: 1,
            bOrdinal: 1,
            sameARequestStillOpen: true,
            bObservedOpenBetween: true,
            clockSynchronizationAssumed: false,
        };
        const actions = ['A', 'B'].map((role, index) => ({
            role,
            beforeOnline: true,
            afterOnline: true,
            intent: {
                operationId: 'op-' + role,
                baseRevision: 4,
                baseOperationId: 'base-op',
                baseFingerprint: base.fingerprint,
                target: index ? 6 : 4,
                updatedAtIso: 'original-' + role,
            },
            receipt: {
                operationId: 'op-' + role,
                weekKey: base.weekKey,
                status: index ? 'conflict' : 'applied',
                targetSessions: index ? 6 : 4,
                updatedAtIso: 'original-' + role,
                ...(index ? { currentRevision: 5 } : { revision: 5 }),
            },
            receiptHash: 'receipt-' + role,
            overlap: { ...overlap },
            commits: [
                { ordinal: 1, startMono: 10, endMono: 12, online: true, failedTransport: false, httpStatus: 200 },
            ],
        }));
        return {
            base,
            actions,
            state: {
                preferencesRevision: 11,
                weeklyTargetsByWeek: { [base.weekKey]: { revision: 5, operationId: 'op-A', targetSessions: 4 } },
            },
        };
    }
    it('accepts exactly one winner/conflict with exact revision increments and preserved immutable intent metadata', () => {
        const { base, actions, state } = online();
        expect(assertOnlineRace(base, actions, state)).toMatchObject({ winner: 'A', loser: 'B', revision: 5 });
    });
    it.each([
        'sequential-two-applied',
        'offline',
        'changed-base',
        'changed-semantics',
        'wrong-revision',
        'missing-overlap',
        'missing-end',
        'failed-transport',
        'wrong-target',
        'changed-receipt',
    ])('rejects unproven online outcome %s', fault => {
        const { base, actions, state } = online();
        if (fault === 'sequential-two-applied') actions[1].receipt.status = 'applied';
        if (fault === 'offline') actions[1].beforeOnline = false;
        if (fault === 'changed-base') actions[1].intent.baseRevision = 5;
        if (fault === 'changed-semantics') actions[1].intent.baseFingerprint = 'other-base';
        if (fault === 'wrong-revision') state.preferencesRevision++;
        if (fault === 'missing-overlap') actions[0].overlap.sameARequestStillOpen = false;
        if (fault === 'missing-end') delete actions[0].commits[0].endMono;
        if (fault === 'failed-transport') actions[0].commits[0].failedTransport = true;
        if (fault === 'wrong-target') state.weeklyTargetsByWeek[base.weekKey].targetSessions = 6;
        if (fault === 'changed-receipt') actions[0].receipt.updatedAtIso = 'replaced';
        expect(() => assertOnlineRace(base, actions, state)).toThrow('QA_');
    });
    it('declares online public race/resolve and strength fallback without replacing the last-page sentinel scenario', () => {
        const phases = liveSyncPhases();
        expect(phases).toHaveLength(47);
        expect(new Set(phases.map(item => item.name)).size).toBe(47);
        const names = phases.map(item => item.name);
        expect(names.indexOf('online-race-identical-online-base')).toBeLessThan(
            names.indexOf('online-race-public-press')
        );
        expect(names.indexOf('online-race-public-press')).toBeLessThan(
            names.indexOf('online-race-loser-explicit-resolution')
        );
        expect(names.indexOf('B-deletes-single-owned-last-page-record')).toBeLessThan(
            names.indexOf('B-deletes-latest-owned-strength')
        );
        expect(names.indexOf('B-deletes-latest-owned-strength')).toBeLessThan(
            names.indexOf('both-surfaces-fallback-previous-strength')
        );
    });
});
