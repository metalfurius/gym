import { createSecureId } from './secure-id.js';
import { logger } from './logger.js';

export const OUTBOX_JOURNAL_PREFIX = 'offline:journal:v3:batch:';
const storageError = (message, provenNotCommitted = false) => Object.assign(new Error(message), {
    code: 'cache/persistence-unavailable', provenNotCommitted,
});

export class OutboxJournalStorage {
    constructor(cache) { this.cache = cache; }

    async readRows() {
        const cache = this.cache;
        await cache.initialize(); await cache.persistenceTail;
        const indexed = cache.needsIndexedDb();
        if (indexed && (!cache.indexedDbEnabled || !await cache.dbPromise)) throw storageError('IndexedDB outbox authority unavailable');
        // V1 needs both valid copies for its conservative FIFO union. V3 never
        // promotes a partial advisory mirror to authority when IDB was expected.
        const local = cache.localStorageKeys('offline:').map(key => cache.readFromLocalStorage(key)).filter(Boolean);
        const disk = indexed ? await cache.getAllFromIndexedDb('offline:') : [];
        const rows = [];
        for (const [source, values] of [['localStorage', local], ['indexedDB', disk]]) {
            for (const row of values) {
                if (row.key?.startsWith(OUTBOX_JOURNAL_PREFIX) && indexed && source !== 'indexedDB') continue;
                const invalidation = await cache.readInvalidations(row.key);
                if (invalidation.blocked) throw storageError('Durable outbox invalidation is unavailable');
                if (cache.entryMatchesInvalidations(row, invalidation)) rows.push({ ...row, journalSource: source });
            }
        }
        return rows;
    }

    async append(events) {
        const batchId = createSecureId('outbox-batch');
        const attemptedIds = [...new Set(events.map(event => event.id))];
        let eventsJson;
        try { eventsJson = JSON.stringify(events); JSON.parse(eventsJson); }
        catch (error) { throw Object.assign(error, { provenNotCommitted: true, attemptedIds }); }
        const cache = this.cache;
        let authorityWriteStarted = false;
        try {
            return await cache.persistInOrder(async () => {
                await cache.initialize();
                const indexed = cache.needsIndexedDb();
                if (indexed && (!cache.indexedDbEnabled || !await cache.dbPromise)) throw storageError('IndexedDB outbox authority unavailable', true);
                const key = `${OUTBOX_JOURNAL_PREFIX}${batchId}`;
                const invalidation = await cache.readInvalidations(key);
                if (invalidation.blocked) throw storageError('Durable outbox invalidation is unavailable', true);
                // One encoded batch is the atomic unit in either authority.
                // Application typed-codec envelopes remain opaque JSON here.
                const entry = JSON.parse(JSON.stringify({ key, value: { version: 3, batchId, eventsJson },
                    metadata: { source: 'outbox-journal' }, updatedAt: Date.now(), cacheInvalidations: invalidation.stamps }));
                if (indexed) {
                    authorityWriteStarted = true;
                    const written = await cache.writeToIndexedDb(entry, { journal: true });
                    if (!written) throw storageError('Durable local storage unavailable', true);
                    // Everything after tx.complete is advisory. A broken mirror
                    // cannot make an accepted intent look like a failed enqueue.
                    try { cache.writeToLocalStorage(entry); } catch (error) { logger.warn('Outbox mirror unavailable after commit:', error); }
                } else {
                    authorityWriteStarted = true;
                    if (!cache.writeToLocalStorage(entry)) throw storageError('Durable local storage unavailable', true);
                }
                return { committed: true, batchId, committedIds: attemptedIds };
            });
        } catch (error) { if (!authorityWriteStarted) error.provenNotCommitted = true; error.attemptedIds ||= attemptedIds; throw error; }
    }
}
