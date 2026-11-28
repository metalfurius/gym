/** @jest-environment node */
// Authoring-only protocol/browser-boundary fixtures. No browser, SDK, account or
// service is started; these results are not live acceptance evidence.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import * as espree from 'espree';
import { describe, expect, it } from '@jest/globals';
import { QaBrowser, verifyOfflineSessionPair } from '../../scripts/live-sync-qa-browser.mjs';
import { liveSyncPhases } from '../../scripts/live-sync-qa-scenarios.mjs';
import { calendarFixture, captureFixtures, canonical, digest, target, encode, documentData,
    assertFrozenPreserved, verifyCaptureRecords, ownsSession, PRIMARY_UID } from '../../scripts/live-sync-qa-protocol.mjs';

const source = await fs.readFile(new URL('../../scripts/live-sync-qa.mjs', import.meta.url), 'utf8');
const ast = espree.parse(source, { ecmaVersion: 'latest', sourceType: 'module', range: true });
function productionFunction(name, context) {
    let found;
    function walk(node) {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'FunctionDeclaration' && node.id?.name === name) found = node;
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(walk);
            else if (value && typeof value === 'object') walk(value);
        }
    }
    walk(ast); assert(found, `Missing actual runner function ${name}`);
    const vmAssert = new Proxy(assert, { get(object, key) {
        // Clone only at this VM boundary so Node's strict prototype check does
        // not reject equal arrays from separate realms. Values/types survive.
        if (key === 'deepEqual') return (actual, expected, message) => assert.deepEqual(structuredClone(actual), structuredClone(expected), message);
        return Reflect.get(object, key);
    } });
    return vm.runInNewContext(`(${source.slice(...found.range)})`, { assert: vmAssert, canonical, digest,
        PREFERENCES: 'app_data/user_preferences', ...context });
}
const options = { ...calendarFixture('2026-12-04T12:00:00.000Z'), runId: 'cf48819b-2ba4-4bf3-aad3-9ab04ece07cc', role: 'A' };
const fixtures = captureFixtures(options);
const pair = () => ['session.save', 'quicklog.save'].map((type, index) => ({
    id: `queue-${index}`, type, owner: 'primary', status: 'pending', timestamp: 1234 + index,
    sessionId: `session-${index}`, sessionFechaIso: index ? '2026-12-11T12:04:00.000Z' : fixtures[0].calendarIso,
    sessionPayloadHash: (index ? 'b' : 'a').repeat(64),
}));

describe('additional real-QA scenario contract (synthetic authoring only)', () => {
    it('retains all 47 original phases verbatim and orders mixed weeks before the original freeze opportunity', async () => {
        const original = JSON.parse(await fs.readFile(new URL('../fixtures/live-sync-qa-phases-949c791.json', import.meta.url)));
        const phases = liveSyncPhases(); const names = new Set(original.phases.map(phase => phase.name));
        expect(phases).toHaveLength(60); expect(phases.filter(phase => names.has(phase.name))).toEqual(original.phases);
        const index = action => phases.findIndex(phase => phase.action === action);
        expect(index('mixed-converge')).toBeLessThan(index('different-offline'));
        expect(index('offline-sessions-queue')).toBeLessThan(index('offline-sessions-cold'));
        expect(index('offline-sessions-cold')).toBeLessThan(index('offline-sessions-replay'));
        expect(index('offline-sessions-replay')).toBeLessThan(index('sessions'));
        expect(index('delete-latest-strength')).toBeLessThan(index('deleted-warm'));
        expect(index('deleted-cold')).toBeLessThan(index('deleted-reconcile'));
        expect(phases.at(-1)).toMatchObject({ actor: 'both', action: 'baseline-preserved' });
    });
    it.each(['date', 'owner', 'status', 'type', 'session-id', 'queue-id', 'payload', 'timestamp'])(
        'rejects invalid durable offline session proof: %s', fault => {
            const rows = pair();
            if (fault === 'date') rows[0].sessionFechaIso = rows[1].sessionFechaIso;
            if (fault === 'owner') rows[0].owner = 'other';
            if (fault === 'status') rows[0].status = 'blocked';
            if (fault === 'type') rows.reverse();
            if (fault === 'session-id') rows[1].sessionId = rows[0].sessionId;
            if (fault === 'queue-id') rows[1].id = rows[0].id;
            if (fault === 'payload') rows[0].sessionPayloadHash = '';
            if (fault === 'timestamp') rows[0].timestamp = undefined;
            expect(() => verifyOfflineSessionPair(rows, fixtures[0].calendarIso, pair()[1].sessionFechaIso)).toThrow('QA_');
        }
    );
    it('queues both public Save flows only after offline, with exact dates, original IDs and payload hashes', async () => {
        const order = []; let offline = false; let saved = 0;
        const browser = {
            stableEmpty: async () => order.push('empty'),
            network: async value => { offline = value; order.push('offline'); },
            clockAt: async value => order.push(value),
            reload: async () => expect(offline).toBe(true), assertOwner: async () => {},
            waitPage: async () => {}, field: async (selector, value) => order.push([selector, value]),
            click: async selector => { expect(offline).toBe(true); order.push(selector); if (selector.includes('save-')) saved++; },
            waitQueue: async predicate => {
                const state = { online: false, queue: pair().slice(0, saved), verified: true, staged: 0, unknown: 0, pendingAcks: 0 };
                expect(predicate(state)).toBe(true); return state;
            },
            client: { evaluate: async () => pair()[1].sessionFechaIso },
        };
        const proof = await QaBrowser.prototype.queueOfflineSessions.call(browser, { fixtureId: 'own-fixture', capture: fixtures[0], ...options });
        expect(proof.queued).toEqual(pair());
        expect(order.indexOf('offline')).toBeLessThan(order.indexOf('#save-session-btn'));
        expect(order.indexOf('#save-session-btn')).toBeLessThan(order.indexOf('#quick-log-save-btn'));
        expect(order).toContainEqual(['#quick-log-notes', `codexLiveQaRun:${options.runId}:4`]);
    });
    it('cold closes and starts offline on the same real directory before auth/queue proof, without clearing its native IDB', async () => {
        const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'gym-qa-cold-authoring-'));
        await fs.mkdir(path.join(profile, 'Default', 'IndexedDB'), { recursive: true });
        const order = []; let restarted = false;
        const state = { online: false, owner: 'primary', queue: pair(), verified: true, staged: 0, unknown: 0, pendingAcks: 0,
            clock: options.currentCalendarIso, target: 3, weekRecords: {}, controller: true,
            idbJournalRows: 3, idbJournalHash: 'c'.repeat(64), databases: ['gym-tracker-local-cache'], revision: 'v2.8.6' };
        const browser = { profile, profileRealPath: profile, waitPage: async () => {},
            waitQueue: async predicate => { expect(predicate(state)).toBe(true); order.push(restarted ? 'restored' : 'durable'); return structuredClone(state); },
            stop: async () => order.push('closed'), start: async offline => {
                expect(offline).toBe(true); expect(browser.profile).toBe(profile); restarted = true; order.push('start-offline');
            }, authenticated: async () => order.push('auth') };
        try {
            const proof = await QaBrowser.prototype.coldOffline.call(browser, { observeNetwork: true });
            expect(order).toEqual(['durable', 'closed', 'start-offline', 'auth', 'restored']);
            expect(proof.before.queue).toEqual(proof.after.queue);
            expect(proof.sameOwnedProfile).toBe(true);
            expect((await fs.stat(path.join(profile, 'Default', 'IndexedDB'))).isDirectory()).toBe(true);
        } finally {
            assert(profile.startsWith(path.join(os.tmpdir(), 'gym-qa-cold-authoring-')));
            await fs.rm(profile, { recursive: true });
        }
    });
    it('allows failed SDK attempts while offline and retains neither URLs nor request/credential data', () => {
        const browser = { trace: [], offlineObservation: { attempts: 0, serverResponses: 0, cachedResponses: 0, failedTransportEvents: 0 },
            commitObservation: { observe() {} } };
        const request = { url: 'https://firestore.googleapis.com/ignored?token=private-token' };
        for (const key of ['headers', 'postData', 'postDataEntries']) Object.defineProperty(request, key, { get() { throw Error('must not read'); } });
        QaBrowser.prototype.event.call(browser, { method: 'Network.requestWillBeSent', params: { request } });
        QaBrowser.prototype.event.call(browser, { method: 'Network.loadingFailed', params: { requestId: 'private-id' } });
        const result = QaBrowser.prototype.endOfflineObservation.call(browser);
        expect(result).toMatchObject({ attempts: 1, serverResponses: 0, failedTransportEvents: 1, failedAttemptsAllowed: true });
        expect(JSON.stringify({ result, trace: browser.trace })).not.toMatch(/private|token=|headers|postData/);
    });
    it.each(['session-date', 'session-payload', 'session-id', 'journal-hash', 'revision'])(
        'rejects cold restart drift instead of accepting the same UID/profile: %s', async fault => {
            const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'gym-qa-cold-authoring-'));
            await fs.mkdir(path.join(profile, 'Default', 'IndexedDB'), { recursive: true });
            const before = { online: false, queue: pair(), visiblePending: 2, verified: true, staged: 0, unknown: 0, pendingAcks: 0,
                clock: options.currentCalendarIso, target: 3, weekRecords: {}, controller: true,
                idbJournalRows: 3, idbJournalHash: 'c'.repeat(64), databases: ['gym-tracker-local-cache'], revision: 'v2.8.6' };
            const after = structuredClone(before);
            if (fault === 'session-date') after.queue[0].sessionFechaIso = after.queue[1].sessionFechaIso;
            if (fault === 'session-payload') after.queue[0].sessionPayloadHash = 'f'.repeat(64);
            if (fault === 'session-id') after.queue[0].sessionId = 'changed-id';
            if (fault === 'journal-hash') after.idbJournalHash = 'f'.repeat(64);
            if (fault === 'revision') after.revision = 'other';
            let read = 0;
            const browser = { profile, profileRealPath: profile, waitPage: async () => {},
                stop: async () => {}, start: async () => {}, authenticated: async () => {},
                waitQueue: async predicate => { const state = read++ ? after : before;
                    assert(predicate(state), 'QA_COLD_RESTORE_REJECTED'); return state; } };
            try {
                await expect(QaBrowser.prototype.coldOffline.call(browser)).rejects.toThrow();
            } finally { assert(profile.startsWith(path.join(os.tmpdir(), 'gym-qa-cold-authoring-'))); await fs.rm(profile, { recursive: true }); }
        }
    );
    it.each([200, 403, 500])('rejects a real Firestore response during the cold offline window, even HTTP %i', status => {
        const browser = { trace: [], offlineObservation: { attempts: 0, serverResponses: 0, cachedResponses: 0, failedTransportEvents: 0 }, commitObservation: { observe() {} } };
        QaBrowser.prototype.event.call(browser, { method: 'Network.responseReceived', params: { response: { url: 'https://firestore.googleapis.com/v1/read', status } } });
        expect(() => QaBrowser.prototype.endOfflineObservation.call(browser)).toThrow('RECEIVED_SERVER_RESPONSE');
    });
});

describe('actual runner assertions with injected synthetic read-only boundaries', () => {
    function resolutionContext(fault = null) {
        const order = []; let offline = false; let durable = false;
        const old = { id: 'old-X', operationId: 'old-operation-X', status: 'conflict', weekKey: options.initialWeek };
        const intent = { id: 'new-X', operationId: 'new-operation-X', status: 'pending', weekKey: options.initialWeek,
            target: 3, timestamp: 12345, updatedAtIso: options.baseCalendarIso, observedWeeklyConflictIds: [old.id] };
        const original = [{ operationId: old.operationId, data: { status: 'conflict' } },
            { operationId: 'Y', data: { status: 'applied' } }];
        const receipts = new Map(original.map(row => [row.operationId, { data: row.data, updateTime: 'original' }]));
        const prior = { receipts: original.map(row => ({ operationId: row.operationId, receiptHash: digest(receipts.get(row.operationId)) })) };
        receipts.set(intent.operationId, { data: { status: 'applied', targetSessions: 3, operationId: intent.operationId,
            weekKey: options.initialWeek, revision: 2, updatedAtIso: options.baseCalendarIso } });
        if (fault === 'time') receipts.get(intent.operationId).data.updatedAtIso = options.currentCalendarIso;
        if (fault === 'old-receipt') receipts.get('Y').data.status = 'conflict';
        if (fault === 'unobserved') intent.observedWeeklyConflictIds = [];
        if (fault === 'foreign-observed') intent.observedWeeklyConflictIds.push('foreign-Y');
        const context = { options, local: { mixedInitial: { preferencesRevision: 4 } }, assertFrozenPreserved, documentData,
            currentTarget: (value, week = options.currentWeek) => target(value, week), coord: { resource: 'own-control' },
            prefs: async () => ({ preferencesRevision: 7, weeklyTargetsByWeek: {
                [options.initialWeek]: { targetSessions: 3, revision: 2 }, [options.currentWeek]: { targetSessions: 5, revision: 1 } } }),
            api: { request: async method => { assert.equal(method, 'GET'); return { fields: encode({ roleA: { completed: {
                'mixed-A-reconnect-X-conflict-Y-applied': { action: prior } } } }).mapValue.fields }; },
            read: async suffix => receipts.get(suffix.split('/').at(-1)) },
            browser: { clock: options.baseCalendarIso, snapshot: async () => ({ queue: [old] }),
                network: async value => { if (!value) assert(durable, 'must prove durable before reconnect'); offline = value; order.push(value ? 'offline' : 'reconnect'); },
                saveTarget: async (value, clock) => { assert(offline); assert.equal(value, 3); assert.equal(clock, options.baseCalendarIso); order.push('public-press'); },
                waitQueue: async predicate => { assert(offline); const state = { online: false, verified: true, staged: 0, unknown: 0, pendingAcks: 0,
                    queue: [old, ...(fault === 'missing-durable' ? [] : [intent])] }; assert(predicate(state), 'QA_NO_DURABLE_RESOLUTION');
                durable = true; order.push('durable'); return state; },
                stableEmpty: async () => { assert(!offline && durable); order.push('replay-drained'); },
                queueAcknowledgements: async ids => ids.map((id, index) => ({ id, pending: false,
                    outcome: index ? 'accepted' : fault === 'auto-ack-X' ? 'accepted' : 'resolved' })) } };
        return { context, order };
    }
    it('performs the actual mixed resolution offline, proves durable intent before reconnect, and requires durable resolved/accepted ACKs', async () => {
        const { context, order } = resolutionContext();
        const result = await productionFunction('resolveMixedOffline', context)();
        expect(order).toEqual(['offline', 'public-press', 'durable', 'reconnect', 'replay-drained']);
        expect(result).toMatchObject({ resolvedXByOfflinePublicNewPressAndReplay: true, independentY: 5, originalReceiptsPreserved: true });
        expect(result.acknowledgements.map(row => row.outcome)).toEqual(['resolved', 'accepted']);
    });
    it.each(['missing-durable', 'auto-ack-X', 'time', 'old-receipt', 'unobserved', 'foreign-observed'])('rejects offline conflict-resolution false success: %s', async fault => {
        await expect(productionFunction('resolveMixedOffline', resolutionContext(fault).context)()).rejects.toThrow();
    });
    function replayContext(fault = null) {
        const intents = pair(); const local = { offlineSessionRevision: 7, offlineSessionPair: { queued: intents } };
        const rows = intents.map((intent, index) => ({ id: intent.sessionId, data: { userId: PRIMARY_UID,
            nombreEntrenamiento: index ? `QA ${options.runId} 4` : `Codex QA ${options.runId}`,
            ...(index ? { quickLog: { source: 'quick_log' } } : { routineId: `codex-live-qa-${options.runId}` }),
            fecha: { $timestamp: intent.sessionFechaIso }, ejercicios: index ? [{ notasEjercicio: `codexLiveQaRun:${options.runId}:4` }]
                : [{ sets: [{ peso: 50.5, reps: 8 }] }] } }));
        const receipts = intents.map((intent, index) => ({ data: { sessionId: intent.sessionId, kind: 'create', changed: true, revision: 8 + index } }));
        if (fault === 'duplicate') rows.push({ ...rows[0], id: 'unexplained-duplicate' });
        if (fault === 'date') rows[0].data.fecha.$timestamp = options.baseCalendarIso;
        if (fault === 'weight') rows[0].data.ejercicios[0].sets[0].peso = 51.5;
        if (fault === 'receipt') receipts[0].data.revision++;
        const context = { options, local, captureFixtures, ownsSession, signal: AbortSignal.timeout(1000),
            until: async predicate => { const value = await predicate(); assert(value); return value; },
            browser: { network: async offline => assert.equal(offline, false), stableEmpty: async () => {}, reload: async () => {} },
            verifyOwnedSet: async () => ({ all: rows, own: rows }), api: { read: async suffix => suffix === 'app_data/session_revision'
                ? { data: { revision: fault === 'counter' ? 10 : 9 } } : receipts[Number(suffix.split('/')[1].at(-1))] } };
        return context;
    }
    it('validates the actual two-session replay against fixed original dates, raw values and ordered immutable create receipts', async () => {
        const context = replayContext(); const result = await productionFunction('replayOfflineSessionPair', context)();
        expect(result).toMatchObject({ exactlyOnceAfterReconnectAndReload: true });
        expect(result.receipts.map(row => row.receiptRevision)).toEqual([8, 9]);
        expect(context.local.offlineSessionPair.replayed).toBe(true);
        expect(context.local.offlineSessionPair.captures).toHaveLength(1);
    });
    it.each(['duplicate', 'date', 'weight', 'receipt', 'counter'])('rejects session replay false success: %s', async fault => {
        await expect(productionFunction('replayOfflineSessionPair', replayContext(fault))()).rejects.toThrow();
    });
    function mixedContext(fault = null) {
        const queued = [options.initialWeek, options.currentWeek].map((weekKey, index) => ({ id: `q${index}`, operationId: `op${index}`,
            weekKey, updatedAtIso: index ? options.currentCalendarIso : options.baseCalendarIso, target: index ? 5 : 4, status: 'pending' }));
        const local = { mixedInitial: { preferencesRevision: 4, weeklyOutcomesByWeek: { old: { met: true } } } };
        const saved = { preferencesRevision: 6, weeklyOutcomesByWeek: { old: { met: true } }, weeklyTargetsByWeek: {
            [options.initialWeek]: { targetSessions: 6, revision: 1 }, [options.currentWeek]: { targetSessions: 5, revision: 1 } } };
        const rows = queued.map((row, index) => ({ data: { operationId: row.operationId, weekKey: row.weekKey, updatedAtIso: row.updatedAtIso,
            targetSessions: row.target, status: index ? 'applied' : 'conflict', ...(index ? { revision: 1 } : { currentRevision: 1 }) }, updateTime: `time${index}` }));
        const state = { clock: options.baseCalendarIso, queue: [{ ...queued[0], status: 'conflict' }], visiblePending: 1 };
        if (fault === 'acked-X') state.queue = [];
        if (fault === 'blocked-Y') state.queue.push({ ...queued[1], status: 'blocked' });
        if (fault === 'clock') state.clock = options.currentCalendarIso;
        if (fault === 'timestamp') rows[1].data.updatedAtIso = options.baseCalendarIso;
        if (fault === 'receipt') rows[1].data.status = 'conflict';
        if (fault === 'revision') saved.preferencesRevision++;
        if (fault === 'frozen') saved.weeklyOutcomesByWeek.old.met = false;
        const context = { options, local, target, currentTarget: (value, week = options.currentWeek) => target(value, week),
            prefs: async () => saved, assertFrozenPreserved, documentData,
            coord: { resource: 'own-control' }, browser: { snapshot: async () => state },
            api: { request: async method => {
                assert.equal(method, 'GET'); return { fields: encode({ roleA: { completed: { 'mixed-A-offline-X-then-Y-return-base-clock': { action: { queued } } } } }).mapValue.fields };
            }, read: async suffix => rows[Number(suffix.at(-1))] } };
        return context;
    }
    it('requires an acknowledged independent Y while X remains conflicted with original timestamps and frozen outcomes intact', async () => {
        const result = await productionFunction('mixedEvidence', mixedContext())();
        expect(result).toMatchObject({ conflictXRetained: true, independentYDrained: true, baseClock: options.baseCalendarIso });
        expect(result.receipts.map(row => row.status)).toEqual(['conflict', 'applied']);
    });
    it.each(['acked-X', 'blocked-Y', 'clock', 'timestamp', 'receipt', 'revision', 'frozen'])('rejects mixed-week false success: %s', async fault => {
        await expect(productionFunction('mixedEvidence', mixedContext(fault))()).rejects.toThrow('QA_');
    });
    it('executes the actual offline surface helper without any REST/product-read fallback and checks both deleted IDs', async () => {
        const manifest = { captures: [], records: [], createdIds: [], sentinelId: 'deleted-sentinel', offlineQueuedIds: ['offline-quicklog'] };
        for (const [index, fixture] of fixtures.entries()) {
            const data = { routineId: `codex-live-qa-${options.runId}`, nombreEntrenamiento: 'Own capture', fecha: { $timestamp: fixture.calendarIso }, ejercicios: [{ sets: [{ peso: fixture.weight, reps: fixture.reps }] }] };
            const original = { ...fixture, id: `strength-${index}`, label: data.nombreEntrenamiento, dataHash: digest(data) };
            manifest.captures.push(original); manifest.records.push(original); manifest.createdIds.push(original.id);
        }
        const own = manifest.captures.slice(0, 3).map(row => ({ id: row.id, data: { routineId: `codex-live-qa-${options.runId}`, nombreEntrenamiento: row.label,
            fecha: { $timestamp: row.calendarIso }, ejercicios: [{ sets: [{ peso: row.weight, reps: row.reps }] }] } }));
        const quickData = { nombreEntrenamiento: 'Offline Quick Log', fecha: { $timestamp: options.currentCalendarIso }, ejercicios: [] };
        own.push({ id: 'offline-quicklog', data: quickData });
        manifest.records.push({ id: 'offline-quicklog', label: quickData.nombreEntrenamiento, calendarIso: options.currentCalendarIso, dataHash: digest(quickData), noteMarker: 'own-marker' });
        manifest.createdIds.push('offline-quicklog', manifest.sentinelId);
        const called = []; const ids = own.map(row => row.id);
        const state = { clock: options.currentCalendarIso, monthCount: 4, weekly: '4/3', visiblePending: 0, online: false };
        const browser = { clockAt: async () => {}, snapshot: async () => state, allHistoryIds: async () => ids,
            detail: async row => { called.push('detail:' + row.id); return { id: row.id }; }, click: async selector => called.push(selector),
            field: async selector => called.push(selector), waitPage: async () => {}, waitQueue: async predicate => { assert(predicate(state)); return state; },
            suggestions: async (_fixture, row) => { expect(row.weight).toBe(52.5); called.push('suggestions'); return { weight: 52.5 }; },
            client: { evaluate: async () => 'unique-exercise-value' } };
        const context = { options, browser, baseline: [], local: {}, verifyCaptureRecords,
            stampInParis: data => (data.fecha.$timestamp).slice(0, 10),
            verifyOwnedSet: () => { throw Error('offline must not call server set verifier'); },
            api: new Proxy({}, { get() { throw Error('offline must not read any REST API'); } }),
            documentData: () => { throw Error('offline must not fetch a control manifest'); } };
        const result = await productionFunction('surfaces', context)({ offline: true, observed: { all: own, own, manifest, deleted: ['deleted-sentinel', 'strength-3'] } });
        expect(result).toMatchObject({ offline: true, deletedIdsAbsent: true, progressSessions: 3, weight: 52.5 });
        expect(called).toEqual(expect.arrayContaining(['#nav-dashboard', '#nav-progress', '#metric-select', 'detail:offline-quicklog', 'suggestions']));
        expect(result.offlineQueuedIdsVerified).toEqual(['offline-quicklog']);
    });
});
