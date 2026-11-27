import { localFirstCache } from './local-first-cache.js';

const PREFIX = 'offline:journal:v2:';
const LEGACY_KEY = 'offline:pending-operations:v1';
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 256;
const key = (kind, id) => `${PREFIX}${kind}:${encodeURIComponent(id)}`;

// Independent append-only identities replace the shared whole-array snapshot.
// Acknowledgements are retained tombstones: a stale tab/legacy migration can
// append the original intent again, but can never make it pending again.
export class DurableOutbox {
    constructor(cache = localFirstCache) { this.cache = cache; }

    async append(event) {
        const row = await this.cache.set(key(event.kind, event.id), event, { requireDurable: true });
        if (!row) {
            const error = new Error('Durable outbox write was superseded');
            error.code = 'cache/persistence-unavailable';
            throw error;
        }
    }

    async read() {
        const rows = await this.cache.getPersistedEntries('offline:');
        const acknowledged = new Set();
        const conflicts = new Map();
        const entries = new Map();
        for (const row of rows) {
            if (!row.key.startsWith(PREFIX)) continue;
            const event = row.value;
            if (!event || !validId(event.id) || event.version !== 2) throw new Error('Invalid durable outbox event');
            if (event.kind === 'ack') acknowledged.add(event.id);
            else if (event.kind === 'conflict') conflicts.set(event.id, event.conflict);
            else if (event.kind === 'intent' && event.entry?.id === event.id) entries.set(event.id, event.entry);
            else throw new Error('Invalid durable outbox event');
        }
        // Retain the legacy array as a migration source. Never replace/remove
        // it on migration: another old tab may still have unimported work.
        const legacy = rows.find(row => row.key === LEGACY_KEY)?.value;
        for (const entry of Array.isArray(legacy) ? legacy : []) {
            if (validId(entry?.id) && !entries.has(entry.id)) entries.set(entry.id, entry);
        }
        for (const id of acknowledged) entries.delete(id);
        for (const [id, conflict] of conflicts) {
            if (entries.has(id)) entries.set(id, { ...entries.get(id), status: 'conflict', conflict });
        }
        return { entries: [...entries.values()].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)
            || a.id.localeCompare(b.id)), acknowledged };
    }

    async save(entries, acknowledged = []) {
        for (const entry of entries) {
            if (!validId(entry?.id)) throw new Error('Invalid durable outbox identity');
            // Conflict is its own monotonic event; a stale pending snapshot must
            // not overwrite a conflict already discovered in another tab.
            const { status, conflict, ...intent } = entry;
            await this.append({ version: 2, kind: 'intent', id: entry.id, entry: intent });
            if (status === 'conflict') {
                await this.append({ version: 2, kind: 'conflict', id: entry.id, conflict });
            }
        }
        for (const id of acknowledged) {
            if (!validId(id)) throw new Error('Invalid durable outbox identity');
            await this.append({ version: 2, kind: 'ack', id });
        }
    }
}
