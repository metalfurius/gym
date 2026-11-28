export const validOutboxId = value => typeof value === 'string' && value.length > 0 && value.length <= 256;
export const outboxOwner = entry => entry?.descriptor?.payload?.userId || entry?.ownerId
    ? `account:${entry?.descriptor?.payload?.userId || entry?.ownerId}` : entry?.scope === 'global' ? 'global:' : 'unowned:';
export const operationIdForEntry = entry => entry?.descriptor?.payload?.operationId;
const unique = values => [...new Set(values.filter(validOutboxId))].sort();
export const validOutboxWeekKey = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function semanticOperationIds(entry) {
    const payload = entry?.descriptor?.payload || {};
    return unique([payload.baseOperationId, payload.parentOperationId, payload.predecessorOperationId]);
}

export function stableOutboxJson(value) {
    return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
}

// Conflict revision and immutable receipt context are independent knowledge:
// a newer conflict lacking week metadata cannot erase a known canonical week.
// The merge is commutative so journal row/UUID order never selects a winner.
export function mergeOutboxConflict(left, right) {
    const absent = value => value === undefined || value === null;
    if (absent(left) && absent(right)) return left ?? right;
    for (const value of [left, right]) {
        if (!absent(value) && (typeof value !== 'object' || Array.isArray(value))) {
            throw Object.assign(new Error('Invalid durable outbox conflict metadata'), { code: 'outbox/integrity' });
        }
    }
    if (absent(left)) return { ...right };
    if (absent(right)) return { ...left };
    const leftWeek = validOutboxWeekKey(left.weekKey) ? left.weekKey : null;
    const rightWeek = validOutboxWeekKey(right.weekKey) ? right.weekKey : null;
    if (leftWeek && rightWeek && leftWeek !== rightWeek) {
        throw Object.assign(new Error('Contradictory canonical weeks for one durable outbox intent'), {
            code: 'outbox/integrity', reason: 'conflicting-canonical-week', canonicalWeeks: [leftWeek, rightWeek].sort(),
        });
    }
    const revision = value => Number.isSafeInteger(value?.currentRevision) && value.currentRevision >= 0 ? value.currentRevision : -1;
    const leftRevision = revision(left), rightRevision = revision(right);
    const preferLeft = leftRevision > rightRevision || (leftRevision === rightRevision && stableOutboxJson(left) >= stableOutboxJson(right));
    const merged = preferLeft ? { ...right, ...left } : { ...left, ...right };
    if (leftRevision >= 0 || rightRevision >= 0) merged.currentRevision = Math.max(leftRevision, rightRevision);
    if (leftWeek || rightWeek) merged.weekKey = leftWeek || rightWeek;
    return merged;
}

// Ordering records observation/causality. Only semantic dependencies require a
// parent's accepted receipt; a different week's conflict never blocks a save.
export function orderOutboxEntries(entries, intents = entries) {
    const operationIds = new Map();
    for (const entry of intents) {
        const operationId = operationIdForEntry(entry);
        if (!validOutboxId(operationId)) continue;
        const key = JSON.stringify([outboxOwner(entry), operationId]);
        const prior = operationIds.get(key);
        if (prior && prior !== entry.id) throw new Error('Conflicting durable outbox operation identity');
        operationIds.set(key, entry.id);
    }
    const nodes = new Map(entries.map(entry => [entry.id, { ...entry,
        predecessorIds: unique(entry.predecessorIds || []),
        semanticDependencyIds: unique([...(entry.semanticDependencyIds || []),
            ...semanticOperationIds(entry).map(id => operationIds.get(JSON.stringify([outboxOwner(entry), id])))]),
    }]));
    const known = new Map(intents.map(entry => [entry.id, entry]));
    const indegrees = new Map(); const children = new Map();
    for (const entry of nodes.values()) {
        entry.predecessorIds = unique([...entry.predecessorIds, ...entry.semanticDependencyIds]);
        if (entry.predecessorIds.some(id => known.has(id) && outboxOwner(known.get(id)) !== outboxOwner(entry))) {
            entry.status = 'quarantined'; entry.quarantineReason = 'cross-owner-dependency';
        }
        const parents = entry.predecessorIds.filter(id => nodes.has(id));
        indegrees.set(entry.id, parents.length);
        for (const parent of parents) children.set(parent, [...(children.get(parent) || []), entry.id]);
    }
    const ready = [...nodes.keys()].filter(id => indegrees.get(id) === 0).sort();
    const result = [];
    while (ready.length) {
        const id = ready.shift(); result.push(nodes.get(id));
        for (const child of children.get(id) || []) {
            indegrees.set(child, indegrees.get(child) - 1);
            if (indegrees.get(child) === 0) { ready.push(child); ready.sort(); }
        }
    }
    for (const id of [...nodes.keys()].filter(id => indegrees.get(id) > 0).sort()) {
        result.push({ ...nodes.get(id), status: 'quarantined', quarantineReason: 'causal-cycle' });
    }
    return result;
}

export function causalFrontier(entries, owner) {
    const owned = entries.filter(entry => outboxOwner(entry) === owner);
    const parents = new Set(owned.flatMap(entry => entry.predecessorIds || []));
    return owned.map(entry => entry.id).filter(id => !parents.has(id)).sort();
}
