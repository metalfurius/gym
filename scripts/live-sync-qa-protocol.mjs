import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

export const PROJECT = 'gymm-178fb';
export const PRIMARY_UID = '6WE3vNHVpcSE6vPeku9xowLmrXm2';
export const OTHER_UID = 'UJEfXd7U2YZOJckimFs5JkHaZiV2';
export const CLOCK_INITIAL = '2026-11-27T12:00:00.000Z';
export const CLOCK_CURRENT = '2026-12-04T12:00:00.000Z';
export const WEEK_OLD = '2026-11-23';
export const WEEK_CURRENT = '2026-11-30';
export const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
export const canonical = value =>
    JSON.stringify(value, (_key, item) =>
        item && typeof item === 'object' && !Array.isArray(item)
            ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
            : item
    );
export const digest = value =>
    crypto
        .createHash('sha256')
        .update(typeof value === 'string' ? value : canonical(value))
        .digest('hex');

export function calendarFixture(value = CLOCK_INITIAL) {
    assert(/^\d{4}-\d{2}-\d{2}T12:00:00(?:\.000)?Z$/.test(value || ''), 'QA_CALENDAR_MUST_BE_NOON_UTC_ISO');
    const date = new Date(value);
    assert(
        Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value.slice(0, 10),
        'QA_INVALID_CALENDAR_DATE'
    );
    const first = Date.parse(CLOCK_INITIAL);
    assert(
        date.getTime() >= first && date.getTime() <= first + 51 * 7 * 86_400_000,
        'QA_CALENDAR_OUTSIDE_52_WEEK_WINDOW'
    );
    const current = new Date(date.getTime() + 7 * 86_400_000);
    const monday = day => {
        const copy = new Date(day);
        copy.setUTCDate(copy.getUTCDate() - ((copy.getUTCDay() + 6) % 7));
        return copy.toISOString().slice(0, 10);
    };
    return {
        baseCalendarIso: date.toISOString(),
        currentCalendarIso: current.toISOString(),
        initialWeek: monday(date),
        currentWeek: monday(current),
        currentDateKey: current.toISOString().slice(0, 10),
        currentMonthKey: current.toISOString().slice(0, 7),
    };
}

export function parseOptions(argv, platform = process.platform, env = process.env) {
    const options = {};
    for (let index = 0; index < argv.length; index++) {
        const flag = argv[index];
        if (['--live', '--validate-run'].includes(flag)) {
            if (options[flag.slice(2)]) throw new Error('QA_DUPLICATE_ARGUMENT');
            options[flag.slice(2)] = true;
            continue;
        }
        if (
            !['--role', '--run-id', '--expected-sha', '--output', '--base-calendar-iso'].includes(flag) ||
            !argv[index + 1] ||
            argv[index + 1].startsWith('--')
        ) {
            throw new Error('QA_INVALID_ARGUMENTS');
        }
        const key = flag.slice(2);
        if (options[key]) throw new Error('QA_DUPLICATE_ARGUMENT');
        options[key] = argv[++index];
    }
    assert(['A', 'B'].includes(options.role), 'QA_ROLE_REQUIRED');
    assert(UUID.test(options['run-id'] || ''), 'QA_UUID_REQUIRED');
    assert(/^[a-f\d]{40}$/.test(options['expected-sha'] || ''), 'QA_EXACT_SHA_REQUIRED');
    assert(options.live !== options['validate-run'], 'QA_EXPLICIT_MODE_REQUIRED');
    assert(platform === (options.role === 'A' ? 'win32' : 'linux'), 'QA_ROLE_REQUIRES_WINDOWS_A_LINUX_B');
    return {
        ...options,
        ...calendarFixture(options['base-calendar-iso'] || env.GYM_QA_BASE_CALENDAR_ISO || CLOCK_INITIAL),
        runId: options['run-id'].toLowerCase(),
        sha: options['expected-sha'],
    };
}

export function parseCredentials(text, role) {
    let value;
    try {
        value = JSON.parse(text);
    } catch {
        throw new Error('QA_CREDENTIALS_JSON_REQUIRED');
    }
    assert(value && Object.keys(value).every(key => ['primary', 'other'].includes(key)), 'QA_CREDENTIAL_FIELDS');
    for (const [key, uid] of [
        ['primary', PRIMARY_UID],
        ['other', OTHER_UID],
    ]) {
        const item = value[key];
        if (!item && key === 'other' && role === 'B') continue;
        assert(
            item &&
                Object.keys(item).sort().join(',') === 'email,password,uid' &&
                item.uid === uid &&
                typeof item.email === 'string' &&
                item.email.includes('@') &&
                typeof item.password === 'string' &&
                item.password.length >= 6,
            'QA_FIXED_CREDENTIAL_SCOPE_REQUIRED'
        );
    }
    return value;
}

export function redactor(secrets = []) {
    const values = new Set();
    const add = value => {
        if (typeof value !== 'string' || !value.length) return;
        for (const variant of [value, JSON.stringify(value).slice(1, -1), encodeURIComponent(value)]) {
            values.add(variant);
        }
    };
    secrets.forEach(add);
    const text = value => {
        let result = value;
        for (const secret of [...values].sort((a, b) => b.length - a.length)) {
            result = result.split(secret).join('[redacted]');
        }
        return result
            .replace(/[A-Z\d.!#$%&'*+/=?^_`{|}~-]+@[A-Z\d.-]+\.[A-Z]{2,}/gi, '[email]')
            .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
            .replace(/eyJ[A-Za-z\d_-]+\.[A-Za-z\d_-]+\.[A-Za-z\d_-]+/g, '[token]');
    };
    const clean = value => {
        if (typeof value === 'string') return text(value);
        if (Array.isArray(value)) return value.map(clean);
        if (value && typeof value === 'object') {
            return Object.fromEntries(
                Object.entries(value).map(([key, item]) => [
                    key,
                    /password|email|token|authorization|headers|postData|expression|credential/i.test(key)
                        ? '[redacted]'
                        : clean(item),
                ])
            );
        }
        return value;
    };
    clean.add = add;
    return clean;
}

export async function until(check, { signal, timeoutMs = 60_000, intervalMs = 1000, label = 'condition' } = {}) {
    const deadline = Date.now() + timeoutMs;
    do {
        signal?.throwIfAborted();
        const result = await check();
        if (result) return result;
        if (Date.now() >= deadline) break;
        await delay(Math.min(intervalMs, deadline - Date.now()), undefined, { signal });
    } while (Date.now() < deadline);
    throw new Error(`QA_TIMEOUT:${label}`);
}

export function encode(value) {
    if (value === null) return { nullValue: null };
    if (value instanceof Date) return { timestampValue: value.toISOString() };
    if (typeof value === 'string') return { stringValue: value };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    }
    if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
    if (value && typeof value === 'object') {
        return {
            mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) },
        };
    }
    throw new Error('QA_UNSUPPORTED_CONTROL_VALUE');
}
export function decode(value) {
    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) {
        return Number.isSafeInteger(Number(value.integerValue))
            ? Number(value.integerValue)
            : { $integer: value.integerValue };
    }
    if ('doubleValue' in value) return value.doubleValue;
    if ('booleanValue' in value) return value.booleanValue;
    if ('nullValue' in value) return null;
    if ('timestampValue' in value) return { $timestamp: value.timestampValue };
    if ('bytesValue' in value) return { $bytes: value.bytesValue };
    if ('referenceValue' in value) return { $reference: value.referenceValue };
    if ('geoPointValue' in value) return { $geoPoint: value.geoPointValue };
    if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
    if ('mapValue' in value) {
        return Object.fromEntries(
            Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, decode(item)])
        );
    }
    throw new Error('QA_UNSUPPORTED_FIRESTORE_VALUE');
}
export const documentData = document =>
    Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => [key, decode(value)]));
export const stamp = data => data.fecha?.$timestamp || data.fechaIso;
export const target = (preferences, week = WEEK_CURRENT) =>
    preferences.weeklyTargetsByWeek?.[week]?.targetSessions ??
    preferences.weeklyTargetsByWeek?.[week]?.targetDays ??
    preferences.weeklyTargetSessions ??
    preferences.weeklyTargetDays ??
    3;

export function assertFrozenPreserved(before, after) {
    for (const [week, value] of Object.entries(before.weeklyOutcomesByWeek || {})) {
        assert.equal(
            digest({ value: after.weeklyOutcomesByWeek?.[week] }),
            digest({ value }),
            `QA_FROZEN_OUTCOME_CHANGED:${week}`
        );
    }
}
export function sessionPlan(baseline, calendar = calendarFixture()) {
    assert(
        baseline.length <= 200 && new Set(baseline.map(item => item.id)).size === baseline.length,
        'QA_BASELINE_TOO_LARGE_OR_DUPLICATED'
    );
    const times = baseline.map(item => Date.parse(stamp(item.data)));
    assert(
        times.every(time => Number.isFinite(time) && time <= Date.parse(calendar.currentCalendarIso)),
        'QA_BASELINE_DATE_NOT_PROVABLE'
    );
    const firstOfMonth = new Date(calendar.baseCalendarIso);
    firstOfMonth.setUTCDate(1);
    return {
        count: 11 + ((10 - (baseline.length % 10)) % 10),
        sentinelIso: new Date(Math.min(firstOfMonth.getTime(), ...times) - 86_400_000).toISOString(),
    };
}
export function ownsSession(data, runId) {
    return (
        data.userId === PRIMARY_UID &&
        ((data.routineId === `codex-live-qa-${runId}` && data.nombreEntrenamiento === `Codex QA ${runId}`) ||
            (data.quickLog?.source === 'quick_log' &&
                data.ejercicios?.some(exercise => exercise.notasEjercicio?.startsWith(`codexLiveQaRun:${runId}:`))))
    );
}

export class QaFirebase {
    constructor({ apiKey, account, clean, signal, runId, fetchImpl = fetch }) {
        this.apiKey = apiKey;
        this.account = account;
        this.clean = clean;
        this.signal = signal;
        this.fetch = fetchImpl;
        assert(UUID.test(runId || ''), 'QA_API_RUN_SCOPE_REQUIRED');
        this.runId = runId;
        assert([PRIMARY_UID, OTHER_UID].includes(account.uid), 'QA_FIXED_OWNER_REQUIRED');
    }
    async authenticate() {
        const response = await this.fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${this.apiKey}`,
            {
                method: 'POST',
                redirect: 'error',
                signal: this.signal,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: this.account.email,
                    password: this.account.password,
                    returnSecureToken: true,
                }),
            }
        );
        if (!response.ok) throw new Error(`QA_AUTH_HTTP_${response.status}`);
        const value = await response.json();
        this.clean.add(value.idToken);
        this.clean.add(value.refreshToken);
        assert(value.localId === this.account.uid && value.idToken, 'QA_AUTH_UID_MISMATCH');
        let claims;
        try {
            claims = JSON.parse(Buffer.from(value.idToken.split('.')[1], 'base64url').toString('utf8'));
        } catch {
            throw new Error('QA_AUTH_TOKEN_PROJECT_MISMATCH');
        }
        assert(
            claims.aud === PROJECT &&
                claims.sub === this.account.uid &&
                claims.iss === `https://securetoken.google.com/${PROJECT}`,
            'QA_AUTH_TOKEN_PROJECT_MISMATCH'
        );
        this.token = value.idToken;
    }
    async request(method, resource, { data, query = {}, allowMissing = false } = {}) {
        assert(this.token, 'QA_AUTH_REQUIRED');
        assert(['GET', 'PATCH', 'DELETE'].includes(method), 'QA_REST_METHOD_DENIED');
        assert(
            resource === 'runtime_config/sync_protocol' || resource.startsWith(`users/${this.account.uid}/`),
            'QA_FOREIGN_RESOURCE_DENIED'
        );
        assert(!resource.includes('..') && !resource.includes('?') && !resource.includes('#'), 'QA_RESOURCE_ESCAPE');
        if (method !== 'GET') {
            const control = resource === `users/${PRIMARY_UID}/qa_sync_runs/${this.runId}`;
            const routine = resource === `users/${PRIMARY_UID}/routines/codex-live-qa-${this.runId}`;
            assert(this.account.uid === PRIMARY_UID && (control || routine), 'QA_DIRECT_PRODUCT_WRITE_DENIED');
            assert(
                control
                    ? method === 'PATCH'
                    : method === 'PATCH'
                        ? query['currentDocument.exists'] === 'false'
                        : !!query['currentDocument.updateTime'],
                'QA_CREATE_ONLY_OR_CAS_CLEANUP_REQUIRED'
            );
        }
        const url = new URL(
            `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${resource}`
        );
        for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
        const response = await this.fetch(url, {
            method,
            redirect: 'error',
            signal: this.signal,
            headers: { Authorization: `Bearer ${this.token}`, ...(data ? { 'Content-Type': 'application/json' } : {}) },
            ...(data ? { body: JSON.stringify({ fields: encode(data).mapValue.fields }) } : {}),
        });
        if (response.status === 404 && allowMissing) return null;
        if (!response.ok) {
            throw Object.assign(new Error(`QA_FIRESTORE_HTTP_${response.status}`), { status: response.status });
        }
        if (method === 'DELETE') return null;
        return response.json();
    }
    async read(suffix, allowMissing = false) {
        const value = await this.request('GET', `users/${this.account.uid}/${suffix}`, { allowMissing });
        return value ? { data: documentData(value), updateTime: value.updateTime } : null;
    }
    async sessions() {
        const result = [];
        let pageToken;
        do {
            const page = await this.request('GET', `users/${this.account.uid}/sesiones_entrenamiento`, {
                query: { pageSize: 100, ...(pageToken ? { pageToken } : {}) },
            });
            for (const item of page.documents || []) {
                result.push({ id: item.name.split('/').pop(), data: documentData(item) });
            }
            assert(result.length <= 2000, 'QA_COLLECTION_ENUMERATION_CAP');
            assert(!page.nextPageToken || page.nextPageToken !== pageToken, 'QA_PAGINATION_DID_NOT_ADVANCE');
            pageToken = page.nextPageToken;
        } while (pageToken);
        return result;
    }
}

export class QaCoordination {
    constructor(api, { role, runId, sha, revision, signal, baseCalendarIso = CLOCK_INITIAL }) {
        Object.assign(this, { api, role, runId, sha, revision, signal, baseCalendarIso });
        this.peer = role === 'A' ? 'B' : 'A';
        this.nonce = crypto.randomUUID();
        this.completed = {};
        this.claimed = false;
        this.resource = `users/${PRIMARY_UID}/qa_sync_runs/${runId}`;
    }
    verify(document) {
        const value = documentData(document);
        assert(
            value.runId === this.runId &&
                value.sourceSha === this.sha &&
                value.revision === this.revision &&
                value.schemaVersion === 1 &&
                value.baseCalendarIso === this.baseCalendarIso,
            'QA_PEER_SOURCE_MISMATCH'
        );
        const peer = value[`role${this.peer}`];
        if (peer?.error) throw new Error(`QA_PEER_FAILED:${peer.phase || 'startup'}`);
        if (peer) {
            assert(
                peer.sourceSha === this.sha &&
                    peer.platform === (this.peer === 'A' ? 'win32' : 'linux') &&
                    peer.nonce !== this.nonce,
                'QA_PEER_MACHINE_MISMATCH'
            );
        }
        return value;
    }
    async claim() {
        for (let attempt = 0; attempt < 6; attempt++) {
            const existing = await this.api.request('GET', this.resource, { allowMissing: true });
            const value = existing ? this.verify(existing) : {};
            assert(!value[`role${this.role}`], 'QA_RUN_ROLE_ALREADY_CLAIMED_USE_NEW_UUID');
            const own = {
                nonce: this.nonce,
                sourceSha: this.sha,
                baseCalendarIso: this.baseCalendarIso,
                platform: this.role === 'A' ? 'win32' : 'linux',
                phase: 'claimed',
                completed: {},
            };
            try {
                const data = existing
                    ? { [`role${this.role}`]: own }
                    : {
                        runId: this.runId,
                        sourceSha: this.sha,
                        revision: this.revision,
                        schemaVersion: 1,
                        baseCalendarIso: this.baseCalendarIso,
                        [`role${this.role}`]: own,
                    };
                await this.api.request('PATCH', this.resource, {
                    data,
                    query: existing
                        ? {
                            'updateMask.fieldPaths': `role${this.role}`,
                            'currentDocument.updateTime': existing.updateTime,
                        }
                        : { 'currentDocument.exists': 'false' },
                });
                this.claimed = true;
                return;
            } catch (error) {
                if (![409, 412].includes(error.status)) throw error;
            }
        }
        throw new Error('QA_ROLE_CLAIM_CONTENTION');
    }
    async publish(phase, stage, result = null, error = null) {
        assert(this.claimed, 'QA_UNCLAIMED_ROLE_CANNOT_PUBLISH');
        if (result) this.completed[phase] = result;
        await this.api.request('PATCH', this.resource, {
            data: {
                [`role${this.role}`]: {
                    nonce: this.nonce,
                    sourceSha: this.sha,
                    baseCalendarIso: this.baseCalendarIso,
                    platform: this.role === 'A' ? 'win32' : 'linux',
                    phase,
                    stage,
                    completed: this.completed,
                    ...(error ? { error } : {}),
                },
            },
            query: { 'updateMask.fieldPaths': `role${this.role}`, 'currentDocument.exists': 'true' },
        });
    }
    async wait(phase, stage) {
        return until(
            async () => {
                const value = this.verify(await this.api.request('GET', this.resource));
                const peer = value[`role${this.peer}`];
                return stage === 'done' ? peer?.completed?.[phase] : peer?.phase === phase || peer?.completed?.[phase];
            },
            { signal: this.signal, label: `peer-${phase}-${stage}`, timeoutMs: 120_000 }
        );
    }
}
