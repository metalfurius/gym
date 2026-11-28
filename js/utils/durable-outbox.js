import { localFirstCache } from './local-first-cache.js';
import { OutboxJournalStorage, OUTBOX_JOURNAL_PREFIX } from './outbox-journal-storage.js';
import { validOutboxId, outboxOwner, orderOutboxEntries, causalFrontier, stableOutboxJson,
    mergeOutboxConflict, validOutboxWeekKey } from './outbox-order.js';

const LEGACY_KEY = 'offline:pending-operations:v1';
const V2_PREFIX = 'offline:journal:v2:';
const unique = values => [...new Set(values)].sort();
const invalid = () => Object.assign(new Error('Invalid or conflicting durable outbox identity'), { code: 'outbox/integrity' });

function intentIdentity(entry) {
    const descriptor = entry.descriptor;
    const legacySession = ['session.save', 'quicklog.save'].includes(descriptor?.type)
        && descriptor.payload?.userId && !descriptor.payload.sessionId;
    return stableOutboxJson({ id: entry.id, timestamp: entry.timestamp ?? 0, ownerId: entry.ownerId ?? descriptor?.payload?.userId,
        scope: entry.scope, descriptor: legacySession ? { ...descriptor, payload: { ...descriptor.payload, sessionId: `legacy-${entry.id}` } } : descriptor });
}

function materialize(intents, conflicts, acknowledgements, v2Ids = new Set()) {
    let ordered = orderOutboxEntries([...intents.values()]);
    const graph = new Map(ordered.map(entry => [entry.id, entry]));
    const hasAncestor = (entry, parentId, seen = new Set()) => {
        if (seen.has(entry.id)) return false;
        seen.add(entry.id);
        return entry.predecessorIds.some(id => id === parentId || (graph.has(id) && hasAncestor(graph.get(id), parentId, seen)));
    };
    // Unpublished V2 has no causal sequence. Only explicit links/FIFO evidence
    // can repair order; a wall clock cannot recover missing user intent.
    for (const entry of ordered.filter(item => v2Ids.has(item.id) && !acknowledgements.has(item.id))) {
        const peers = ordered.filter(item => item.id !== entry.id && v2Ids.has(item.id) && !acknowledgements.has(item.id)
            && outboxOwner(item) === outboxOwner(entry) && item.descriptor.type === 'preferences.saveWeeklyTarget'
            && entry.descriptor.type === item.descriptor.type && item.descriptor.payload?.weekKey === entry.descriptor.payload?.weekKey);
        if (peers.some(peer => !hasAncestor(entry, peer.id) && !hasAncestor(peer, entry.id))) {
            entry.status = 'quarantined'; entry.quarantineReason = 'legacy-order-unknown';
        }
    }
    ordered = ordered.map(entry => conflicts.has(entry.id) ? { ...entry, status: 'conflict', conflict: conflicts.get(entry.id) } : entry);
    ordered = ordered.map(entry => acknowledgements.get(entry.id) === 'unknown' ? { ...entry, status: 'quarantined', quarantineReason: 'unverified-legacy-ack' } : entry);
    return { entries: ordered.filter(entry => !acknowledgements.has(entry.id) || acknowledgements.get(entry.id) === 'unknown'),
        intents: new Map(ordered.map(entry => [entry.id, entry])), acknowledged: new Set(acknowledgements.keys()), acknowledgements, conflicts };
}

// V3 persists one immutable batch of deltas. Acks retain the outcome so an
// intentionally cancelled/conflicting parent cannot authorize a dependent RPC.
export class DurableOutbox {
    constructor(cache = localFirstCache) { this.cache = cache; this.storage = new OutboxJournalStorage(cache); }

    async read() {
        const rows = await this.storage.readRows();
        const intents = new Map(); const conflicts = new Map(); const acknowledgements = new Map(); const v2Ids = new Set();
        const mergeIntent = entry => {
            if (!validOutboxId(entry?.id) || !entry.descriptor || typeof entry.descriptor.type !== 'string') throw invalid();
            for (const field of ['predecessorIds', 'semanticDependencyIds']) {
                if (entry[field] !== undefined && (!Array.isArray(entry[field]) || !entry[field].every(validOutboxId))) throw invalid();
            }
            const prior = intents.get(entry.id);
            if (prior && intentIdentity(prior) !== intentIdentity(entry)) throw invalid();
            intents.set(entry.id, { ...(prior || entry), predecessorIds: unique([...(prior?.predecessorIds || []), ...(entry.predecessorIds || [])]),
                semanticDependencyIds: unique([...(prior?.semanticDependencyIds || []), ...(entry.semanticDependencyIds || [])]) });
            if (entry.status === 'conflict') conflicts.set(entry.id, mergeOutboxConflict(conflicts.get(entry.id), entry.conflict));
        };
        const event = (value, legacy = false) => {
            if (!value || !validOutboxId(value.id)) throw invalid();
            if (value.kind === 'intent' && value.entry?.id === value.id) mergeIntent(value.entry);
            else if (value.kind === 'conflict') {
                conflicts.set(value.id, mergeOutboxConflict(conflicts.get(value.id), value.conflict));
            } else if (value.kind === 'ack') {
                if (value.entry) { if (value.entry.id !== value.id) throw invalid(); mergeIntent(value.entry); }
                const outcome = legacy ? 'unknown' : value.outcome;
                if (!['accepted', 'cancelled', 'resolved', 'unknown'].includes(outcome)) throw invalid();
                const prior = acknowledgements.get(value.id);
                if (!prior || outcome === 'accepted' || prior === 'unknown') acknowledgements.set(value.id, outcome);
            } else throw invalid();
        };
        for (const row of rows) {
            if (row.key.startsWith(OUTBOX_JOURNAL_PREFIX)) {
                const batch = row.value;
                if (batch?.version !== 3 || !validOutboxId(batch.batchId) || row.key !== `${OUTBOX_JOURNAL_PREFIX}${batch.batchId}`
                    || typeof batch.eventsJson !== 'string') throw invalid();
                const events = JSON.parse(batch.eventsJson);
                if (!Array.isArray(events) || !events.length) throw invalid();
                events.forEach(value => event(value));
            } else if (row.key.startsWith(V2_PREFIX)) {
                if (row.value?.version !== 2 || row.key !== `${V2_PREFIX}${row.value.kind}:${encodeURIComponent(row.value.id)}`) throw invalid();
                if (row.value.kind === 'intent') v2Ids.add(row.value.id);
                event(row.value, true);
            }
        }
        // Both valid V1 arrays contribute per-owner FIFO edges. Contradictory
        // arrays become a cycle, never an arbitrary choice of storage copy.
        for (const row of rows.filter(item => item.key === LEGACY_KEY)) {
            if (!Array.isArray(row.value)) throw invalid();
            const previous = new Map();
            for (const entry of row.value) {
                mergeIntent(entry);
                const owner = outboxOwner(entry); const prior = previous.get(owner);
                if (prior) {
                    const current = intents.get(entry.id);
                    current.predecessorIds = unique([...current.predecessorIds, prior]);
                }
                previous.set(owner, entry.id);
            }
        }
        return materialize(intents, conflicts, acknowledgements, v2Ids);
    }

    async save(entries, acknowledged = []) {
        let prepared;
        try { prepared = this.prepareSave(await this.read(), entries, acknowledged); }
        catch (error) { error.provenNotCommitted = true; error.attemptedIds = entries.map(entry => entry.id); throw error; }
        const { events, covered, state } = prepared;
        if (!events.length) return { committed: true, batchId: null, committedIds: covered, state };
        const receipt = await this.storage.append(events);
        return { ...receipt, committedIds: covered, state };
    }

    prepareSave(state, entries, acknowledged) {
        const events = []; const known = [...state.intents.values()];
        const nextConflicts = new Map(state.conflicts); const nextAcks = new Map(state.acknowledgements);
        const identities = new Map(); const inputConflicts = new Map();
        for (const entry of entries) {
            if (!validOutboxId(entry?.id) || !entry.descriptor || typeof entry.descriptor.type !== 'string') throw invalid();
            const identity = intentIdentity(entry);
            if (identities.has(entry.id) && identities.get(entry.id) !== identity) throw invalid();
            identities.set(entry.id, identity);
            if (entry.status === 'conflict') inputConflicts.set(entry.id, mergeOutboxConflict(inputConflicts.get(entry.id), entry.conflict));
        }
        const mergedEntries = entries.map(entry => inputConflicts.has(entry.id)
            ? { ...entry, status: 'conflict', conflict: inputConflicts.get(entry.id) } : entry);
        const ordered = orderOutboxEntries(mergedEntries, [...known, ...mergedEntries.filter(entry => !state.intents.has(entry.id))]);
        for (const entry of ordered) {
            if (!validOutboxId(entry?.id)) throw invalid();
            const prior = state.intents.get(entry.id);
            if (prior && intentIdentity(prior) !== intentIdentity(entry)) throw Object.assign(invalid(), { provenNotCommitted: true, attemptedIds: [entry.id] });
            if (!prior && !state.acknowledged.has(entry.id)) {
                const intent = { ...entry };
                delete intent.status; delete intent.conflict; delete intent.quarantineReason; delete intent.blockedReason;
                intent.predecessorIds = unique([...intent.predecessorIds, ...causalFrontier(known, outboxOwner(intent))]);
                events.push({ kind: 'intent', id: intent.id, entry: intent }); known.push(intent);
            }
            if (entry.status === 'conflict' && !state.acknowledged.has(entry.id)) {
                const merged = mergeOutboxConflict(nextConflicts.get(entry.id), entry.conflict);
                if (!nextConflicts.has(entry.id) || stableOutboxJson(nextConflicts.get(entry.id)) !== stableOutboxJson(merged)) {
                    events.push({ kind: 'conflict', id: entry.id, conflict: merged });
                    nextConflicts.set(entry.id, merged);
                }
            }
        }
        const acks = acknowledged.map(value => typeof value === 'string' ? { id: value, outcome: 'accepted' } : value);
        for (const ack of acks) {
            if (!validOutboxId(ack.id) || !['accepted', 'cancelled', 'resolved'].includes(ack.outcome)) throw invalid();
            if (ack.entry) {
                if (ack.entry.id !== ack.id || !ack.entry.descriptor) throw invalid();
                const prior = known.find(entry => entry.id === ack.id);
                if (prior && intentIdentity(prior) !== intentIdentity(ack.entry)) throw invalid();
                if (!prior) known.push(ack.entry);
            }
            if (ack.outcome === 'resolved' && ack.resolution && !state.acknowledged.has(ack.id)) {
                // This state came from save's fresh read, after the caller's
                // selection. Resolution criteria are local preconditions only;
                // they are never a new journal/schema field.
                const entry = known.find(item => item.id === ack.id);
                const payload = entry?.descriptor?.payload;
                const conflict = mergeOutboxConflict(nextConflicts.get(ack.id), ack.entry?.conflict);
                const week = validOutboxWeekKey(payload?.weekKey) ? payload.weekKey
                    : validOutboxWeekKey(conflict?.weekKey) ? conflict.weekKey : ack.resolution.fallbackWeekKey;
                if (!validOutboxWeekKey(ack.resolution.weekKey) || typeof ack.resolution.userId !== 'string' || !ack.resolution.userId.trim()
                    || entry?.descriptor?.type !== 'preferences.saveWeeklyTarget' || payload?.userId !== ack.resolution.userId
                    || (entry.ownerId && entry.ownerId !== ack.resolution.userId) || week !== ack.resolution.weekKey) {
                    throw Object.assign(new Error('Conflict resolution requires review of the latest owner/week metadata'), {
                        code: 'outbox/resolution-changed', resolutionIds: [ack.id],
                    });
                }
            }
            const journalAck = { ...ack }; delete journalAck.resolution;
            if (state.acknowledgements.get(ack.id) !== 'accepted' && state.acknowledgements.get(ack.id) !== ack.outcome) events.push({ kind: 'ack', ...journalAck });
            if (nextAcks.get(ack.id) !== 'accepted') nextAcks.set(ack.id, ack.outcome);
        }
        const covered = unique([...entries.map(entry => entry.id), ...acks.map(ack => ack.id)]);
        // Prepare this causal proof before any write. Poscommit refresh is only
        // advisory; callers must not dispatch against an older RAM graph.
        return { events, covered, state: materialize(new Map(known.map(entry => [entry.id, entry])), nextConflicts, nextAcks) };
    }
}
