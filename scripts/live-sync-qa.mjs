#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { canonicalCandidate, startCandidateServer, QaBrowser } from './live-sync-qa-browser.mjs';
import {
    PROJECT,
    PRIMARY_UID,
    canonical,
    digest,
    target,
    parseOptions,
    parseCredentials,
    redactor,
    until,
    encode,
    documentData,
    assertFrozenPreserved,
    sessionPlan,
    ownsSession,
    QaFirebase,
    QaCoordination,
} from './live-sync-qa-protocol.mjs';
import { liveSyncPhases } from './live-sync-qa-scenarios.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PREFERENCES = 'app_data/user_preferences';

export async function finalizeQa({ primaryError, cleanups, writeTrace, writeResult }) {
    const cleanupErrors = [];
    for (const [name, action] of cleanups) {
        try {
            await action(cleanupErrors);
        } catch (error) {
            cleanupErrors.push({ name, error: error.message });
        }
    }
    try {
        await writeTrace(cleanupErrors);
    } catch (error) {
        cleanupErrors.push({ name: 'trace', error: error.message });
    }
    const result = {
        status: primaryError || cleanupErrors.length ? 'failed' : 'passed',
        primaryError: primaryError?.message || null,
        cleanupErrors,
    };
    await writeResult(result);
    return result;
}

export async function runLiveSync(options, credentials, candidate) {
    const tick = seconds => new Date(Date.parse(options.currentCalendarIso) + seconds * 1000).toISOString();
    const currentTarget = (value, week = options.currentWeek) => target(value, week);
    const weekRevision = value => value.weeklyTargetsByWeek?.[options.currentWeek]?.revision || 0;
    const output = path.resolve(
        options.output || path.join(os.tmpdir(), 'gym-live-sync-qa-evidence', options.runId, options.role)
    );
    const outputRelative = path.relative(ROOT, output);
    assert(
        outputRelative === '..' || outputRelative.startsWith(`..${path.sep}`) || path.isAbsolute(outputRelative),
        'QA_OUTPUT_MUST_BE_OUTSIDE_CHECKOUT'
    );
    const clean = redactor([
        credentials.primary.email,
        credentials.primary.password,
        credentials.other?.email,
        credentials.other?.password,
        candidate.apiKey,
    ]);
    await fs.mkdir(output, { recursive: true });
    for (const name of ['result.json', 'trace.json']) {
        try {
            await fs.access(path.join(output, name));
            throw new Error('QA_EVIDENCE_ALREADY_EXISTS_USE_NEW_RUN');
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
    }
    const signal = AbortSignal.timeout(900_000);
    const api = new QaFirebase({
        apiKey: candidate.apiKey,
        account: credentials.primary,
        clean,
        signal,
        runId: options.runId,
    });
    const trace = [],
        phaseResults = [],
        local = { queued: {}, bases: {} };
    const plan = liveSyncPhases();
    let server,
        browser,
        coord,
        primaryError,
        baseline = [],
        otherApi,
        otherBaseline,
        routineProof;
    let frozen,
        phase = 'startup';
    const createdSessions = [];
    const record = {
        mode: 'real-Firebase-real-SDK-two-machine-acceptance',
        live: true,
        role: options.role,
        runId: options.runId,
        sourceSha: candidate.sha,
        baseCalendarIso: options.baseCalendarIso,
        currentCalendarIso: options.currentCalendarIso,
        revision: candidate.release.revision,
        project: PROJECT,
        startedAt: new Date().toISOString(),
        syntheticFixedAccountsOnly: true,
        physicalPhone: false,
        installedPwa: false,
        plan,
        phases: phaseResults,
        notes: [
            'No SDK/HTML/request replacement; all product mutations use public UI.',
            'No forced Commit-response loss is injected by this runner.',
            'QA session/preference receipts and the control document are retained; fences and previous records are never reset.',
        ],
    };
    const prefs = async () => (await api.read(PREFERENCES, true))?.data || {};
    const serverTarget = async expected =>
        until(
            async () => {
                const value = await prefs();
                return currentTarget(value) === expected && value;
            },
            { signal: api.signal, label: 'server-target' }
        );
    const acceptedTarget = async value => {
        const previousRevision = weekRevision(await prefs());
        await browser.network(false);
        await browser.saveTarget(value, tick(10 + phaseResults.length));
        await serverTarget(value);
        await browser.stableEmpty();
        assert.equal(weekRevision(await prefs()), previousRevision + 1, 'QA_EXPLICIT_PRESS_MUST_COMMIT_EXACTLY_ONCE');
        const ui = await browser.snapshot();
        assert.equal(ui.target, value, 'QA_TARGET_UI_NOT_CONVERGED');
    };
    const receipts = async (entries, status) => {
        const records = [];
        for (const entry of entries) {
            const receipt = await api.read(`${PREFERENCES}/weekly_operations/${entry.operationId}`, true);
            if (!receipt) {
                assert.equal(status, 'conflict-or-blocked', 'QA_MISSING_IMMUTABLE_RECEIPT');
                records.push({ operationId: entry.operationId, status: 'not-submitted-blocked' });
                continue;
            }
            assert.equal(receipt.data.updatedAtIso, entry.updatedAtIso, 'QA_ORIGINAL_TIMESTAMP_CHANGED');
            assert.equal(receipt.data.targetSessions, entry.target, 'QA_RECEIPT_INTENT_CHANGED');
            assert(
                status === 'conflict-or-blocked' ? receipt.data.status === 'conflict' : receipt.data.status === status,
                'QA_RECEIPT_OUTCOME_MISMATCH'
            );
            records.push({
                operationId: entry.operationId,
                status: receipt.data.status,
                updatedAtIso: receipt.data.updatedAtIso,
                revision: receipt.data.revision ?? null,
            });
        }
        return records;
    };
    const queueTwo = async spec => {
        await browser.network(true);
        const first = spec.first ?? (options.role === 'A' ? 4 : 6),
            second = spec.second ?? (options.role === 'A' ? 5 : 7);
        const offset = 100 + phaseResults.length * 4 + (options.role === 'A' ? 0 : 2);
        await browser.saveTarget(first, tick(offset));
        await browser.saveTarget(second, tick(offset - 1)); // Deliberate clock rollback; causal FIFO must win.
        const snapshot = await browser.waitQueue(
            value => !value.online && value.queue.length === 2 && !value.staged && !value.unknown,
            'two-durable-intents'
        );
        assert(
            snapshot.queue.every(entry => entry.owner === 'primary' && entry.type === 'preferences.saveWeeklyTarget')
        );
        assert.equal(new Set(snapshot.queue.map(entry => entry.operationId)).size, 2, 'QA_DUPLICATE_OPERATION_ID');
        local.queued[spec.key] = snapshot.queue;
        return { queued: snapshot.queue, clockRollback: true };
    };
    const reconnectConflict = async spec => {
        await browser.network(false);
        const ui = await browser.waitQueue(
            value =>
                value.queue.some(entry => entry.status === 'conflict') &&
                value.queue.some(entry => entry.status === 'blocked'),
            'conflict-and-dependent-blocked'
        );
        assert.equal(currentTarget(await prefs()), spec.preserved, 'QA_DELAYED_WRITE_OVERWROTE_NEWER_SERVER');
        assert.equal(
            canonical(ui.queue.map(({ status: _status, ...entry }) => entry)),
            canonical(local.queued[spec.key].map(({ status: _status, ...entry }) => entry)),
            'QA_REPLAY_CHANGED_IMMUTABLE_INTENT'
        );
        return { ui, receipts: await receipts(local.queued[spec.key], 'conflict-or-blocked') };
    };
    const verifyOwnedSet = async () => {
        const all = await api.sessions(),
            before = new Map(baseline.map(entry => [entry.id, entry.data]));
        for (const entry of baseline) {
            assert.equal(
                digest({ data: all.find(item => item.id === entry.id)?.data }),
                digest({ data: entry.data }),
                'QA_PREVIOUS_SESSION_CHANGED'
            );
        }
        for (const entry of all) {
            if (!before.has(entry.id)) {
                assert(ownsSession(entry.data, options.runId), 'QA_UNEXPLAINED_FOREIGN_NEW_SESSION');
            }
        }
        const own = all.filter(entry => ownsSession(entry.data, options.runId));
        assert.equal(new Set(all.map(entry => entry.id)).size, all.length);
        return { all, own };
    };
    const cleanupSessions = async () => {
        assert(browser?.client, 'QA_CLEANUP_BROWSER_UNAVAILABLE');
        await browser.network(false);
        const state = await browser.snapshot();
        if (state.owner !== 'primary') {
            if (state.owner) await browser.logout();
            await browser.login(credentials.primary);
        }
        const all = await api.sessions();
        const own = all.filter(
            entry => !baseline.some(old => old.id === entry.id) && ownsSession(entry.data, options.runId)
        );
        const errors = [];
        for (const entry of own) {
            try {
                const current = await api.read(`sesiones_entrenamiento/${entry.id}`, true);
                if (!current) continue;
                assert(ownsSession(current.data, options.runId), 'QA_CLEANUP_OWNERSHIP_LOST');
                await browser.deleteOwned(entry.id);
                await until(async () => !(await api.read(`sesiones_entrenamiento/${entry.id}`, true)), {
                    signal: api.signal,
                    label: 'owned-ui-delete',
                });
            } catch (error) {
                errors.push(error.message);
            }
        }
        assert.equal(errors.length, 0, 'QA_UI_CLEANUP_FAILED');
        await browser.stableEmpty();
        return { deletedOwnSessions: own.map(entry => entry.id) };
    };
    async function surfaces() {
        const { all, own } = await verifyOwnedSet();
        const captures = own.filter(entry => entry.data.routineId === `codex-live-qa-${options.runId}`);
        assert.equal(captures.length, 3, 'QA_CAPTURE_COUNT_CHANGED');
        for (const entry of captures) {
            assert.equal(entry.data.ejercicios[0].sets[0].peso, 50.5);
            assert.equal(entry.data.ejercicios[0].sets[0].reps, 8);
        }
        const history = await browser.allHistoryIds();
        assert.deepEqual([...history].sort(), all.map(entry => entry.id).sort(), 'QA_HISTORY_SERVER_ID_DISAGREEMENT');
        assert.equal(new Set(history).size, history.length, 'QA_DUPLICATE_HISTORY_ID');
        await browser.click('#nav-dashboard');
        const expectedMonth = all.filter(
            entry => stampInParis(entry.data).slice(0, 7) === options.currentMonthKey
        ).length;
        const expectedDay = all.filter(entry => stampInParis(entry.data) === options.currentDateKey).length;
        const expectedWeek = all.filter(entry => {
            const date = stampInParis(entry.data);
            return date >= options.currentWeek && date <= options.currentDateKey;
        }).length;
        const ui = await browser.waitQueue(
            value => value.monthCount === expectedMonth && Number(value.weekly.split('/')[0]) === expectedWeek,
            'hub-server-counts'
        );
        assert.equal(ui.visiblePending, 0);
        await browser.waitPage(
            `(() => {const e=document.querySelector('#activity-calendar .is-today');return !!e&&${
                expectedDay > 1
                    ? `new RegExp('(^|[^0-9])${expectedDay} (sesiones|sessions)([^a-z]|$)').test(e.title)`
                    : `e.classList.contains('level-${expectedDay ? 1 : 0}')`
            }})()`,
            'calendar-server-count'
        );
        await browser.click('#nav-progress');
        const exerciseName = `QA Press ${options.runId}`;
        await browser.waitPage(
            `(async()=>{const option=[...document.querySelector('#exercise-select').options].find(e=>e.textContent.includes(${JSON.stringify(exerciseName)}));return !!option&&option.textContent.includes('(3 ')})()`,
            'progress-three-captures'
        );
        const exerciseValue = await browser.client.evaluate(
            `[...document.querySelector('#exercise-select').options].find(e=>e.textContent.includes(${JSON.stringify(exerciseName)})).value`
        );
        await browser.field('#exercise-select', exerciseValue);
        await browser.field('#period-select', 'all');
        await browser.field('#metric-select', 'weight');
        await browser.waitPage(
            `document.getElementById('session-count').textContent==='3'&&document.getElementById('best-record').textContent.trim().replace(',','.')==='50.5 kg'&&document.querySelectorAll('#progress-data-table tbody tr').length===1&&Number(document.querySelector('#progress-data-table tbody tr')?.lastElementChild.textContent)===50.5`,
            'progress-server-values'
        );
        await browser.field('#metric-select', 'reps');
        await browser.waitPage(
            `document.getElementById('session-count').textContent==='3'&&document.querySelectorAll('#progress-data-table tbody tr').length===1&&Number(document.querySelector('#progress-data-table tbody tr')?.lastElementChild.textContent)===8`,
            'progress-server-reps'
        );
        return {
            serverCount: all.length,
            ownIds: own.map(entry => entry.id),
            historyCount: history.length,
            historyIdsHash: digest([...history].sort()),
            monthCount: ui.monthCount,
            weekCount: expectedWeek,
            dayCount: expectedDay,
            progressSessions: 3,
            weight: 50.5,
            reps: 8,
            queueEmpty: true,
        };
    }
    function stampInParis(data) {
        const value = data.fecha?.$timestamp || data.fechaIso;
        const date = new Date(value);
        assert(Number.isFinite(date.getTime()), 'QA_SESSION_DATE_UNREADABLE');
        const pieces = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Europe/Paris',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).formatToParts(date);
        return ['year', 'month', 'day'].map(type => pieces.find(piece => piece.type === type).value).join('-');
    }
    async function createSessions() {
        const plan = sessionPlan(baseline, options),
            fixtureId = `codex-live-qa-${options.runId}`;
        for (let index = 0; index < plan.count; index++) {
            await browser.reload();
            await browser.assertOwner();
            const prior = (await api.sessions()).map(entry => entry.id);
            if (index < 3) {
                await browser.waitPage(
                    `[...document.querySelector('#day-select').options].some(e=>e.value===${JSON.stringify(fixtureId)})`,
                    'fixture-routine-visible'
                );
                await browser.field('#day-select', fixtureId);
                await browser.click('#start-session-btn');
                await browser.field('input[name="weight-0-0"]', '50.5');
                await browser.field('input[name="reps-0-0"]', '8');
                await browser.click('#save-session-btn');
            } else {
                await browser.field('#quick-log-label', `QA ${options.runId} ${index}`);
                await browser.field('#quick-log-notes', `codexLiveQaRun:${options.runId}:${index}`);
                await browser.field(
                    '#quick-log-datetime',
                    index === plan.count - 1
                        ? plan.sentinelIso.slice(0, 16)
                        : `${options.currentDateKey}T13:${String(index).padStart(2, '0')}`
                );
                await browser.click('#quick-log-save-btn');
            }
            const created = await until(
                async () => {
                    const all = await api.sessions(),
                        added = all.filter(item => !prior.includes(item.id));
                    assert(
                        added.every(item => ownsSession(item.data, options.runId)),
                        'QA_UNPROVABLE_NEW_SESSION'
                    );
                    assert(added.length <= 1, 'QA_DUPLICATE_UI_SAVE');
                    return added.length === 1 && added[0];
                },
                { signal, label: 'one-ui-save-one-server-session' }
            );
            if (index < 3) assert.equal(canonical(created.data.ejercicios[0].sets[0].peso), canonical(50.5));
            if (index < 3) assert.equal(created.data.ejercicios[0].sets[0].reps, 8);
            if (index < 3) {
                await browser.waitPage(
                    '!document.getElementById("dashboard-view").classList.contains("hidden")',
                    'capture-ui-acknowledged'
                );
            } else {
                await browser.waitPage(
                    'document.getElementById("quick-log-notes").value===""&&!document.getElementById("quick-log-save-btn").disabled',
                    'quicklog-ui-acknowledged'
                );
            }
            await browser.stableEmpty();
            createdSessions.push(created.id);
        }
        const { all } = await verifyOwnedSet();
        assert.equal(all.length % 10, 1, 'QA_LAST_PAGE_FIXTURE_SIZE');
        return {
            createdIds: createdSessions,
            sentinelId: createdSessions.at(-1),
            count: plan.count,
            baselineCount: baseline.length,
        };
    }
    async function createRoutineFixture() {
        const data = {
            name: `Codex QA ${options.runId}`,
            codexLiveQaRun: options.runId,
            createdAt: new Date(),
            updatedAt: new Date(),
            exercises: [
                {
                    name: `QA Press ${options.runId}`,
                    type: 'strength',
                    sets: 1,
                    reps: '8',
                    duration: '',
                    notes: '',
                    executionMode: 'two_hand',
                },
            ],
        };
        routineProof = { updateTime: null, data: documentData({ fields: encode(data).mapValue.fields }) };
        try {
            const document = await api.request(
                'PATCH',
                `users/${PRIMARY_UID}/routines/codex-live-qa-${options.runId}`,
                { data, query: { 'currentDocument.exists': 'false' } }
            );
            routineProof.updateTime = document.updateTime;
        } catch (error) {
            if ([409, 412].includes(error.status)) routineProof = null;
            throw error;
        }
        return { fixtureId: `codex-live-qa-${options.runId}`, createOnly: true };
    }
    async function perform(spec) {
        if (spec.actor !== 'both' && spec.actor !== options.role) return { standby: true };
        switch (spec.action) {
            case 'initial':
                await browser.authenticated();
                await browser.stableEmpty();
                return { clock: options.baseCalendarIso };
            case 'different-offline':
                await browser.network(true);
                await browser.saveTarget(4, options.currentCalendarIso);
                return browser.waitQueue(
                    value => value.queue.length === 1 && !value.staged && !value.unknown,
                    'different-week-durable-intent'
                );
            case 'different-reconnect':
                await browser.network(false);
                await browser.stableEmpty();
                assert.equal(currentTarget(await prefs(), options.initialWeek), 6);
                assert.equal(currentTarget(await prefs()), 4);
                return { bothWeeksPreserved: true };
            case 'different-converge':
                await browser.clockAt(options.currentCalendarIso);
                await browser.reload();
                await browser.stableEmpty();
                assert.equal((await browser.snapshot()).weekRecords[options.initialWeek].target, 6);
                assert.equal((await browser.snapshot()).weekRecords[options.currentWeek].target, 4);
                return { oldWeek: 6, currentWeek: 4 };
            case 'target':
                if (spec.initialWeek) {
                    assert.equal(browser.clock, options.baseCalendarIso);
                    await browser.saveTarget(spec.value);
                    await browser.stableEmpty();
                    assert.equal(currentTarget(await prefs(), options.initialWeek), spec.value);
                    return { oldWeekApplied: spec.value };
                }
                await acceptedTarget(spec.value);
                return { accepted: spec.value };
            case 'base': {
                await browser.network(false);
                await browser.reload();
                await browser.stableEmpty();
                const state = await prefs();
                const ui = await browser.snapshot();
                assert.equal(ui.weekRecords[options.currentWeek]?.revision || 0, weekRevision(state));
                local.bases[spec.key] = weekRevision(state);
                await browser.network(true); // Hold this exact base until the intended public press.
                return {
                    revision: weekRevision(state),
                    operationId: state.weeklyTargetsByWeek?.[options.currentWeek]?.operationId || null,
                };
            }
            case 'stale': {
                const before = await prefs();
                const { queued, ui } = await browser.submitStaleTarget(spec.value, tick(20), local.bases.same);
                assert.equal(currentTarget(await prefs()), spec.preserved);
                assert.equal(weekRevision(await prefs()), weekRevision(before));
                return { ui, queued, receipts: await receipts(queued, 'conflict-or-blocked') };
            }
            case 'converge':
                await browser.network(false);
                await browser.reload();
                await browser.stableEmpty();
                assert.equal((await browser.snapshot()).target, spec.value);
                assert.equal(currentTarget(await prefs()), spec.value);
                return { converged: spec.value };
            case 'queue-two':
                return queueTwo(spec);
            case 'cold-restart':
                return browser.coldOffline();
            case 'reconnect-conflict':
                return reconnectConflict(spec);
            case 'reconnect-accepted': {
                await browser.network(false);
                await browser.stableEmpty();
                assert.equal(currentTarget(await prefs()), spec.value);
                assert.equal(weekRevision(await prefs()), local.bases[spec.key] + 2, 'QA_CAUSAL_REPLAY_REVISION_COUNT');
                return { finalTarget: spec.value, receipts: await receipts(local.queued[spec.key], 'applied') };
            }
            case 'owner-queue':
                await browser.network(true);
                await browser.saveTarget(2, tick(300));
                local.ownerQueued = (
                    await browser.waitQueue(
                        value => value.queue.length === 1 && !value.staged && !value.unknown,
                        'owner-durable-intent'
                    )
                ).queue;
                local.ownerServer = digest(await prefs());
                return { queue: local.ownerQueued };
            case 'owner-other': {
                await browser.logout();
                await browser.network(false);
                await browser.login(credentials.other);
                const ui = await browser.snapshot();
                assert.equal(ui.owner, 'other');
                assert.equal(ui.visiblePending, 0);
                assert.deepEqual(
                    ui.queue.map(entry => entry.id),
                    local.ownerQueued.map(entry => entry.id)
                );
                assert.equal(digest(await prefs()), local.ownerServer, 'QA_PRIMARY_REPLAYED_DURING_OTHER_ACCOUNT');
                assert.equal(digest((await otherApi.sessions()).map(item => item.id).sort()), otherBaseline.sessions);
                assert.equal(currentTarget((await otherApi.read(PREFERENCES, true))?.data || {}), otherBaseline.target);
                assert(
                    !(await browser.client.evaluate(
                        `document.getElementById('dashboard-view').textContent.includes(${JSON.stringify(options.runId)})`
                    ))
                );
                return { ui, primaryDidNotReplay: true, otherUnchanged: true };
            }
            case 'owner-primary':
                await browser.logout();
                await browser.login(credentials.primary);
                await browser.stableEmpty();
                assert.equal(currentTarget(await prefs()), 2);
                return { receipts: await receipts(local.ownerQueued, 'applied') };
            case 'reauthenticate':
                await browser.logout();
                await browser.login(credentials.primary);
                await browser.reload();
                await browser.stableEmpty();
                return { ownerRestored: true };
            case 'routine': {
                const current = await api.read('routines/codex-live-qa-' + options.runId);
                assert.equal(digest(current.data), digest(routineProof.data), 'QA_FIXTURE_CHANGED_BEFORE_CAPTURE');
                return { fixtureId: 'codex-live-qa-' + options.runId, createOnly: true, preAuthFixtureVerified: true };
            }
            case 'sessions':
                return createSessions();
            case 'surfaces':
                return surfaces();
            case 'delete-sentinel': {
                const document = await api.request('GET', coord.resource);
                const result = documentData(document).roleA.completed['sessions-three-captures-and-quicklogs'].action;
                const { all, own } = await verifyOwnedSet();
                assert(own.some(entry => entry.id === result.sentinelId));
                const ids = await browser.allHistoryIds();
                assert.equal(ids.length, all.length);
                const visible = await browser.client.evaluate(
                    '[...document.querySelectorAll("#history-list li[data-session-id]")].map(e=>e.dataset.sessionId)'
                );
                assert.deepEqual(visible, [result.sentinelId], 'QA_LAST_PAGE_NOT_EXACT_OWN_SENTINEL');
                const proof = await api.read(`sesiones_entrenamiento/${result.sentinelId}`);
                assert(ownsSession(proof.data, options.runId));
                await browser.deleteVisible(result.sentinelId);
                await until(async () => !(await api.read(`sesiones_entrenamiento/${result.sentinelId}`, true)), {
                    signal,
                    label: 'last-page-deleted',
                });
                return { deletedId: result.sentinelId, lastPageHadOneOwnedRecord: true };
            }
            case 'cleanup-sessions':
                return cleanupSessions();
            case 'baseline-preserved': {
                const { own, all } = await verifyOwnedSet();
                assert.equal(own.length, 0);
                assert.equal(all.length, baseline.length);
                return { baselineCount: baseline.length, baselinePreserved: true, ownSessionsRemaining: 0 };
            }
            default:
                throw new Error('QA_UNKNOWN_DECLARED_ACTION');
        }
    }
    try {
        await api.authenticate(); // Fixed UID is checked before the first write.
        const global = await api.request('GET', 'runtime_config/sync_protocol');
        const policy = await api.read('app_data/sync_protocol');
        assert.equal(digest(documentData(global)), digest(policy.data), 'QA_SERVER_PROTOCOL_NOT_ATTESTED');
        assert.equal(policy.data.version, 1);
        assert.equal(policy.data.epoch, 'gym-sync-v1-2026-11');
        assert.equal(Object.keys(policy.data).sort().join(','), 'epoch,version', 'QA_CANONICAL_UID_POLICY_REQUIRED');
        const counter = (await api.read('app_data/session_revision')).data;
        assert(
            Object.keys(counter).sort().join(',') === 'lastSessionId,revision' &&
                Number.isInteger(counter.revision) &&
                counter.revision >= 0 &&
                (counter.lastSessionId === null ||
                    (typeof counter.lastSessionId === 'string' &&
                        counter.lastSessionId.length > 0 &&
                        !counter.lastSessionId.includes('/'))),
            'QA_SERVER_REVISION_REQUIRED'
        );
        baseline = await api.sessions();
        assert(
            !baseline.some(entry => ownsSession(entry.data, options.runId)),
            'QA_RUN_MARKER_ALREADY_PRESENT_IN_BASELINE'
        );
        sessionPlan(baseline, options);
        frozen = await prefs();
        assert(
            !frozen.weeklyOutcomesByWeek?.[options.initialWeek] && !frozen.weeklyOutcomesByWeek?.[options.currentWeek],
            'QA_REQUIRED_WEEKS_ALREADY_FROZEN'
        );
        record.baseline = {
            count: baseline.length,
            hash: digest(baseline),
            frozenHash: digest(frozen.weeklyOutcomesByWeek || {}),
        };
        if (credentials.other && options.role === 'A') {
            otherApi = new QaFirebase({
                apiKey: candidate.apiKey,
                account: credentials.other,
                clean,
                signal,
                runId: options.runId,
            });
            await otherApi.authenticate();
            otherBaseline = {
                sessions: digest((await otherApi.sessions()).map(item => item.id).sort()),
                target: currentTarget((await otherApi.read(PREFERENCES, true))?.data || {}),
            };
        }
        coord = new QaCoordination(api, { ...options, revision: candidate.release.revision, signal });
        await coord.claim();
        phase = 'preflight';
        await coord.publish(phase, 'ready');
        await coord.wait(phase, 'ready');
        await coord.publish(phase, 'done', { sharedSourceAndCalendarValidated: true });
        await coord.wait(phase, 'done');
        phase = 'fixture-before-auth';
        await coord.publish(phase, 'ready');
        await coord.wait(phase, 'ready');
        const fixture = options.role === 'A' ? await createRoutineFixture() : { waitingForA: true };
        await coord.publish(phase, 'done', fixture);
        const peerFixture = await coord.wait(phase, 'done');
        record.startupFixture = options.role === 'A' ? fixture : peerFixture;
        server = await startCandidateServer(candidate);
        browser = new QaBrowser({
            url: server.url,
            candidate,
            clean,
            signal,
            trace,
            role: options.role,
            baseCalendarIso: options.baseCalendarIso,
        });
        await browser.initialize();
        await browser.start();
        await browser.login(credentials.primary);
        for (const spec of plan) {
            phase = spec.name;
            await coord.publish(phase, 'ready');
            await coord.wait(phase, 'ready');
            const action = await perform(spec);
            const serverPreferences = await prefs();
            assertFrozenPreserved(frozen, serverPreferences);
            frozen = serverPreferences;
            const result = clean({
                action,
                ui: await browser.snapshot(),
                server: {
                    currentTarget: currentTarget(serverPreferences),
                    oldWeekTarget: currentTarget(serverPreferences, options.initialWeek),
                    weekRevision: weekRevision(serverPreferences),
                    frozenWeeks: Object.keys(serverPreferences.weeklyOutcomesByWeek || {}),
                    frozenHash: digest(serverPreferences.weeklyOutcomesByWeek || {}),
                },
            });
            phaseResults.push({ name: phase, at: new Date().toISOString(), ...result });
            await coord.publish(phase, 'done', result);
            const peer = await coord.wait(phase, 'done');
            if (spec.action === 'base') {
                assert.equal(canonical(peer.action), canonical(action), 'QA_CLIENTS_DID_NOT_READ_IDENTICAL_BASE');
            }
        }
        assert.equal(phaseResults.length, plan.length, 'QA_INCOMPLETE_SEQUENCE');
    } catch (error) {
        primaryError = error;
        if (browser?.client) {
            try {
                record.failureState = clean(await browser.snapshot());
            } catch {
                record.failureStateUnavailable = true;
            }
        }
        if (coord?.claimed) {
            try {
                await coord.publish(phase, 'failed', null, clean({ message: error.message }));
            } catch {
                /* Preserve primary failure. */
            }
        }
    }
    const cleanupSignal = AbortSignal.timeout(60_000);
    api.signal = cleanupSignal;
    if (browser) browser.signal = cleanupSignal;
    const cleanup = [];
    if (options.role === 'A' && browser && routineProof) cleanup.push(['owned-sessions-public-ui', cleanupSessions]);
    if (options.role === 'A' && routineProof) {
        cleanup.push([
            'owned-routine-compare-and-delete',
            async () => {
                assert(
                    !(await api.sessions()).some(entry => ownsSession(entry.data, options.runId)),
                    'QA_ROUTINE_RETAINED_RESIDUAL_SESSIONS'
                );
                const suffix = `routines/codex-live-qa-${options.runId}`,
                    current = await api.read(suffix, true);
                if (!current) return;
                assert.equal(current.data.codexLiveQaRun, options.runId);
                assert.equal(digest(current.data), digest(routineProof.data), 'QA_ROUTINE_CHANGED_RETAINED');
                await api.request('DELETE', `users/${PRIMARY_UID}/${suffix}`, {
                    query: { 'currentDocument.updateTime': current.updateTime },
                });
            },
        ]);
    }
    if (api.token && routineProof) {
        cleanup.push([
            'residual-run-session-evidence',
            async () => {
                record.residualOwnSessionIds = (await api.sessions())
                    .filter(entry => ownsSession(entry.data, options.runId))
                    .map(entry => entry.id);
                assert.equal(record.residualOwnSessionIds.length, 0, 'QA_OWNED_SESSIONS_REMAIN_AFTER_CLEANUP');
            },
        ]);
    }
    if (browser) {
        for (const owner of browser.owners) {
            cleanup.push([
                'owned-browser-close',
                async () => {
                    await owner.close();
                    browser.closedOwners.add(owner);
                },
            ]);
        }
        cleanup.push([
            'owned-connections-close',
            () => {
                for (const connection of browser.connections) connection.close();
            },
        ]);
        if (browser.profile) cleanup.push(['owned-profile-delete-after-close', () => browser.removeProfile()]);
    }
    if (server) cleanup.push(['loopback-server-close', () => server.close()]);
    cleanup.push([
        'checkout-remained-frozen',
        () => {
            canonicalCandidate(ROOT, options.sha);
        },
    ]);
    if (coord?.claimed) {
        cleanup.push([
            'both-machine-cleanup-barrier',
            async cleanupErrors => {
                api.signal = AbortSignal.timeout(90_000);
                coord.signal = api.signal;
                const failed = primaryError || cleanupErrors.length;
                await coord.publish(
                    'local-cleanup-complete',
                    failed ? 'failed' : 'done',
                    { complete: !failed },
                    failed ? { message: 'QA_ROLE_OR_CLEANUP_FAILED' } : null
                );
                await coord.wait('local-cleanup-complete', 'done');
            },
        ]);
    }
    const result = await finalizeQa({
        primaryError,
        cleanups: cleanup,
        writeTrace: async cleanupErrors => {
            // Failure in an earlier independent cleanup must also reach the peer.
            if (coord?.claimed && cleanupErrors.length) {
                try {
                    await coord.publish('cleanup-failed', 'failed', null, { message: 'QA_LOCAL_CLEANUP_FAILED' });
                } catch {
                    /* Local failure artifact remains authoritative. */
                }
            }
            await fs.writeFile(
                path.join(output, 'trace.json'),
                `${JSON.stringify(clean({ events: trace, cleanupErrors }), null, 2)}\n`
            );
        },
        writeResult: async result => {
            // A trace or cleanup failure must reach the other machine before
            // either local result can claim paired evidence readiness.
            if (coord?.claimed) {
                try {
                    await coord.publish(
                        'final-evidence-ready',
                        result.status === 'passed' ? 'done' : 'failed',
                        { status: result.status },
                        result.status === 'failed' ? { message: 'QA_FINAL_EVIDENCE_FAILED' } : null
                    );
                    const peer = await coord.wait('final-evidence-ready', 'done');
                    assert.equal(peer.status, 'passed', 'QA_PEER_FINAL_EVIDENCE_FAILED');
                } catch (error) {
                    result.status = 'failed';
                    if (!result.primaryError) result.primaryError = error.message;
                    else result.cleanupErrors.push({ name: 'peer-final-evidence', error: error.message });
                }
            }
            await fs.writeFile(
                path.join(output, 'result.json'),
                JSON.stringify(
                    clean({
                        ...record,
                        ...result,
                        completedAt: new Date().toISOString(),
                        platform: process.platform,
                        phaseCount: phaseResults.length,
                        requiredPhases: plan.length,
                        browser: browser?.version || null,
                        ownedProfile: browser?.profile
                            ? { basename: path.basename(browser.profile), removed: browser.profileRemoved === true }
                            : null,
                    }),
                    null,
                    2
                ) + '\n'
            );
        },
    });
    console.log(
        JSON.stringify({
            status: result.status,
            role: options.role,
            runId: options.runId,
            sourceSha: candidate.sha,
            output,
        })
    );
    return result;
}

export async function main(argv = process.argv.slice(2)) {
    const options = parseOptions(argv);
    if (options['validate-run']) {
        canonicalCandidate(ROOT, options.sha);
        if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `qa_run_id=${options.runId}\n`);
        console.log(
            JSON.stringify({
                status: 'validated-only-no-services',
                role: options.role,
                runId: options.runId,
                sha: options.sha,
                baseCalendarIso: options.baseCalendarIso,
                currentCalendarIso: options.currentCalendarIso,
            })
        );
        return;
    }
    const credentials = parseCredentials(process.env.GYM_LIVE_QA_CREDENTIALS_JSON, options.role);
    const candidate = canonicalCandidate(ROOT, options.sha);
    const result = await runLiveSync(options, credentials, candidate);
    if (result.status !== 'passed') process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        console.error(
            JSON.stringify({ status: 'failed', phase: 'guard-or-final-artifact', error: redactor()(error.message) })
        );
        process.exitCode = 1;
    });
}
