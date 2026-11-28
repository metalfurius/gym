import { doc, Timestamp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { runOwnedTransaction } from './owned-transaction.js';
import { normalizeWeeklyTargetSessions, WEEKLY_TARGET_DEFAULT } from './quick-log.js';
import { sessionRevisionRef } from './session-store.js';
import { createSecureId } from './secure-id.js';
import { matchesSyncProtocol, isSyncProtocolPolicy, isSessionRevision, syncProtocolGlobalRef, syncProtocolUserRef } from './sync-protocol.js';

const weekPattern = /^\d{4}-\d{2}-\d{2}$/;
const revisionOf = record => Math.max(0, Number.parseInt(record?.revision, 10) || 0);

export function normalizeWeeklyTargets(value) {
    const result = {};
    for (const [weekKey, record] of Object.entries(value || {})) {
        if (!weekPattern.test(weekKey) || !record || typeof record !== 'object') continue;
        const target = normalizeWeeklyTargetSessions(record.targetSessions ?? record.targetDays, WEEKLY_TARGET_DEFAULT);
        result[weekKey] = {
            ...record,
            targetSessions: target,
            targetDays: normalizeWeeklyTargetSessions(record.targetDays ?? record.targetSessions, WEEKLY_TARGET_DEFAULT),
            savesUsed: Math.max(0, Number.parseInt(record.savesUsed, 10) || 0),
            revision: revisionOf(record),
        };
    }
    return result;
}

export function normalizeWeeklyOutcomes(value) {
    const result = {};
    for (const [weekKey, record] of Object.entries(value || {})) {
        if (!weekPattern.test(weekKey) || !record || typeof record !== 'object') continue;
        const count = Number.parseInt(record.sessionCount ?? record.activeSessions ?? record.activeDays, 10);
        if (!Number.isInteger(count) || count < 0 || typeof record.met !== 'boolean') continue;
        const target = normalizeWeeklyTargetSessions(record.targetSessions ?? record.targetDays, WEEKLY_TARGET_DEFAULT);
        result[weekKey] = {
            ...record,
            sessionCount: count,
            activeSessions: count,
            activeDays: Math.max(0, Number.parseInt(record.activeDays, 10) || 0),
            targetSessions: target,
            targetDays: target,
        };
    }
    return result;
}

export function normalizeWeeklyState(state = {}) {
    const targets = normalizeWeeklyTargets(state.weeklyTargetsByWeek);
    const latestKey = Object.keys(targets).sort().at(-1);
    const target = normalizeWeeklyTargetSessions(
        latestKey ? targets[latestKey].targetSessions : (state.weeklyTargetSessions ?? state.weeklyTargetDays),
        WEEKLY_TARGET_DEFAULT
    );
    return {
        ...state,
        weeklyTargetBaselineSessions: baselineTarget(state),
        weeklyTargetsByWeek: targets,
        weeklyOutcomesByWeek: normalizeWeeklyOutcomes(state.weeklyOutcomesByWeek),
        weeklyTargetSessions: target,
        weeklyTargetDays: target,
    };
}

function baselineTarget(state) {
    return normalizeWeeklyTargetSessions(state.weeklyTargetBaselineSessions,
        Object.keys(state.weeklyTargetsByWeek || {}).length ? WEEKLY_TARGET_DEFAULT
            : (state.weeklyTargetSessions ?? state.weeklyTargetDays ?? WEEKLY_TARGET_DEFAULT));
}

export function resolveWeeklyTargetForWeek(state, weekKey) {
    const targets = normalizeWeeklyTargets(state.weeklyTargetsByWeek);
    const effectiveWeek = Object.keys(targets).filter(key => key <= weekKey).sort().at(-1);
    return effectiveWeek ? targets[effectiveWeek].targetSessions : baselineTarget(state);
}

function legacyOperationId(payload) {
    const source = JSON.stringify([payload.userId, payload.weekKey, payload.updatedAtIso,
        payload.weekRecord?.targetSessions ?? payload.weekRecord?.targetDays ?? payload.weeklyTargetDays,
        payload.weekRecord?.savesUsed]);
    let hash = 2166136261;
    let secondHash = 5381;
    for (let i = 0; i < source.length; i++) {
        hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
        secondHash = Math.imul(secondHash, 33) ^ source.charCodeAt(i);
    }
    return `legacy-${(hash >>> 0).toString(16)}-${(secondHash >>> 0).toString(16)}`;
}

export function createWeeklyTargetOperation(userId, weekKey, target, currentRecord, updatedAtIso) {
    const operationId = createSecureId('target');
    return migrateWeeklyTargetOperation({
        userId, weekKey, operationId, updatedAtIso,
        baseRevision: revisionOf(currentRecord),
        baseOperationId: currentRecord?.operationId || null,
        baseFingerprint: weeklyTargetFingerprint(currentRecord),
        weekRecord: {
            targetSessions: target,
            targetDays: target,
            savesUsed: (currentRecord?.savesUsed || 0) + 1,
            updatedAtIso,
        },
    });
}

// Version/op metadata can survive a legacy recursive merge unchanged. Compare
// the semantic leaves as well, so that acknowledged legacy edits are conflicts.
export function weeklyTargetFingerprint(record) {
    if (!record) return 'absent';
    return JSON.stringify([
        normalizeWeeklyTargetSessions(record.targetSessions ?? record.targetDays, WEEKLY_TARGET_DEFAULT),
        normalizeWeeklyTargetSessions(record.targetDays ?? record.targetSessions, WEEKLY_TARGET_DEFAULT),
        Math.max(0, Number.parseInt(record.savesUsed, 10) || 0),
        typeof record.updatedAtIso === 'string' ? record.updatedAtIso : null,
    ]);
}

export function migrateWeeklyTargetOperation(payload) {
    if (!payload?.userId || !weekPattern.test(payload?.weekKey)) throw new Error('Invalid weekly target operation');
    const updatedAtIso = payload.weekRecord?.updatedAtIso || payload.updatedAtIso;
    if (!updatedAtIso || Number.isNaN(new Date(updatedAtIso).getTime())) throw new Error('Invalid original operation timestamp');
    const target = normalizeWeeklyTargetSessions(
        payload.weekRecord?.targetSessions ?? payload.weekRecord?.targetDays ?? payload.weeklyTargetDays,
        WEEKLY_TARGET_DEFAULT
    );
    const operationId = payload.operationId || legacyOperationId(payload);
    if (typeof operationId !== 'string' || !operationId || operationId.includes('/') || operationId.length > 200) {
        throw new Error('Invalid weekly target operation identity');
    }
    return {
        ...payload,
        operationId,
        baseRevision: Number.isInteger(payload.baseRevision) ? payload.baseRevision : null,
        baseOperationId: payload.baseOperationId || null,
        updatedAtIso,
        weekRecord: { ...payload.weekRecord, targetSessions: target, targetDays: target, updatedAtIso },
    };
}

export function applyOptimisticWeeklyTarget(payload, state) {
    const operation = migrateWeeklyTargetOperation(payload);
    const next = normalizeWeeklyState(state);
    next.weeklyTargetBaselineSessions = baselineTarget(next);
    next.weeklyTargetsByWeek[operation.weekKey] = {
        ...next.weeklyTargetsByWeek[operation.weekKey],
        ...operation.weekRecord,
        revision: (operation.baseRevision || 0) + 1,
        operationId: operation.operationId,
        pending: true,
    };
    delete next.weeklyOutcomesByWeek[operation.weekKey];
    return normalizeWeeklyState(next);
}

export class WeeklyTargetConflictError extends Error {
    constructor(result) {
        super('Weekly target changed on another client; review the current value and save again');
        this.code = 'sync/conflict';
        this.result = result;
    }
}

// A receipt lives in its own document, so idempotency does not grow preferences
// without bound. Atomic revision assignment, never wall-clock time or savesUsed,
// orders accepted intents. Stale bases remain explicit durable conflicts.
export async function persistWeeklyTargetOperation(db, payload) {
    const operation = migrateWeeklyTargetOperation(payload);
    const result = await runOwnedTransaction(db, operation.userId, async (transaction, assertOwner) => {
        const preferencesRef = doc(db, 'users', operation.userId, 'app_data', 'user_preferences');
        const receiptRef = doc(db, 'users', operation.userId, 'app_data', 'user_preferences', 'weekly_operations', operation.operationId);
        const [snapshot, receipt] = await Promise.all([transaction.get(preferencesRef), transaction.get(receiptRef)]);
        assertOwner();
        const state = normalizeWeeklyState(snapshot.exists() ? snapshot.data() : {});
        if (receipt.exists()) {
            const previous = receipt.data();
            if (previous.weekKey !== operation.weekKey || previous.updatedAtIso !== operation.updatedAtIso
                || (previous.targetSessions !== undefined && previous.targetSessions !== operation.weekRecord.targetSessions)) {
                throw new Error('An operation identity cannot be reused for a different intent');
            }
            return { ...previous, state };
        }
        const current = state.weeklyTargetsByWeek[operation.weekKey];
        const sameLegacyIntent = operation.baseRevision === null && current
            && current.updatedAtIso === operation.updatedAtIso
            && current.targetSessions === operation.weekRecord.targetSessions;
        const matchesBase = operation.baseRevision === null
            ? !current || sameLegacyIntent
            : revisionOf(current) === operation.baseRevision
                && (current?.operationId || null) === operation.baseOperationId
                && typeof operation.baseFingerprint === 'string'
                && weeklyTargetFingerprint(current) === operation.baseFingerprint;
        if (!matchesBase || (state.weeklyOutcomesByWeek[operation.weekKey] && !sameLegacyIntent)) {
            const conflict = { status: 'conflict', operationId: operation.operationId, weekKey: operation.weekKey,
                targetSessions: operation.weekRecord.targetSessions,
                updatedAtIso: operation.updatedAtIso, currentRevision: revisionOf(current) };
            transaction.set(receiptRef, conflict);
            return { ...conflict, state };
        }
        if (!sameLegacyIntent) {
            const commitRevision = (state.preferencesRevision || 0) + 1;
            state.weeklyTargetBaselineSessions = baselineTarget(state);
            state.weeklyTargetsByWeek[operation.weekKey] = {
                ...current, ...operation.weekRecord,
                revision: revisionOf(current) + 1,
                operationId: operation.operationId,
                commitRevision,
                pending: false,
            };
            delete state.weeklyOutcomesByWeek[operation.weekKey];
            Object.assign(state, normalizeWeeklyState(state), {
                preferencesRevision: commitRevision,
                schemaVersion: 3,
                updatedAtIso: operation.updatedAtIso,
                updatedAt: Timestamp.fromDate(new Date(operation.updatedAtIso)),
            });
            // Full document is safe here: Firestore verifies the read revision.
            transaction.set(preferencesRef, state);
        }
        const accepted = { status: 'applied', operationId: operation.operationId, weekKey: operation.weekKey,
            targetSessions: operation.weekRecord.targetSessions,
            updatedAtIso: operation.updatedAtIso, revision: revisionOf(state.weeklyTargetsByWeek[operation.weekKey]) };
        transaction.set(receiptRef, accepted);
        return { ...accepted, state };
    }, 'preferences.weeklyTarget', { revisionRef: doc(db, 'users', operation.userId, 'app_data', 'user_preferences'), revisionField: 'preferencesRevision' });
    if (result.status === 'conflict') throw new WeeklyTargetConflictError(result);
    return result;
}

export async function persistWeeklyOutcomes(db, userId, outcomes, expectedTargets, { complete, nowIso, sessionRevision, protocolProof } = {}) {
    if (complete !== true || protocolProof?.userId !== userId || !matchesSyncProtocol(protocolProof)) return null;
    return runOwnedTransaction(db, userId, async (transaction, assertOwner) => {
        const preferencesRef = doc(db, 'users', userId, 'app_data', 'user_preferences');
        const [snapshot, revisionSnapshot, policy, global] = await Promise.all([
            transaction.get(preferencesRef), transaction.get(sessionRevisionRef(db, userId)),
            transaction.get(syncProtocolUserRef(db, userId)), transaction.get(syncProtocolGlobalRef(db)),
        ]);
        assertOwner();
        const state = normalizeWeeklyState(snapshot.exists() ? snapshot.data() : {});
        if (!policy.exists() || !global.exists() || !isSyncProtocolPolicy(policy.data(), protocolProof)
            || !isSyncProtocolPolicy(global.data(), protocolProof) || !revisionSnapshot.exists() || !isSessionRevision(revisionSnapshot.data())
            || !Number.isInteger(sessionRevision) || sessionRevision !== revisionSnapshot.data()?.revision) {
            return { state, changed: false };
        }
        let changed = false;
        for (const [weekKey, outcome] of Object.entries(normalizeWeeklyOutcomes(outcomes))) {
            if (state.weeklyOutcomesByWeek[weekKey]) continue;
            // Targets can change between the session query and this transaction.
            // Verify the effective carry-forward target, not only an exact key.
            const effectiveTarget = targets => Object.keys(targets).filter(key => key <= weekKey).sort().at(-1);
            const serverKey = effectiveTarget(state.weeklyTargetsByWeek);
            const expectedKey = effectiveTarget(expectedTargets || {});
            const serverTarget = serverKey ? state.weeklyTargetsByWeek[serverKey] : null;
            const expectedTarget = expectedKey ? expectedTargets[expectedKey] : null;
            if (serverKey !== expectedKey || revisionOf(serverTarget) !== revisionOf(expectedTarget)
                || (serverTarget?.operationId || null) !== (expectedTarget?.operationId || null)
                || weeklyTargetFingerprint(serverTarget) !== weeklyTargetFingerprint(expectedTarget)
                || (serverTarget?.targetSessions ?? serverTarget?.targetDays
                    ?? state.weeklyTargetBaselineSessions ?? WEEKLY_TARGET_DEFAULT) !== outcome.targetSessions) continue;
            state.weeklyOutcomesByWeek[weekKey] = { ...outcome, lockedAtIso: nowIso };
            changed = true;
        }
        if (changed) {
            state.preferencesRevision = (state.preferencesRevision || 0) + 1;
            state.schemaVersion = 3;
            // Derived writes must not change the original user-edit timestamp.
            transaction.set(preferencesRef, state);
        }
        return { state, changed };
    }, 'preferences.weeklyOutcomes', { revisionRef: doc(db, 'users', userId, 'app_data', 'user_preferences'), revisionField: 'preferencesRevision' });
}
