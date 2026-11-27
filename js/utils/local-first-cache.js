import { logger } from './logger.js';
import { createSecureId } from './secure-id.js';
import { cacheOwnerForPrefix, withCacheMutationLock } from './cache-mutation-lock.js';

const DB_NAME = 'gym-tracker-local-cache';
const DB_VERSION = 1;
const STORE_NAME = 'entries';
const LOCAL_STORAGE_PREFIX = 'gym-tracker-local-cache:';
const INVALIDATION_PREFIX = '__cache_invalidation__:';

function persistenceError() {
    const error = new Error('Durable cache invalidation is unavailable');
    error.code = 'cache/persistence-unavailable';
    return error;
}

function hasIndexedDbSupport() {
    return typeof indexedDB !== 'undefined';
}

function safeStringify(value) {
    try {
        return JSON.stringify(value);
    } catch (error) {
        logger.warn('LocalFirstCache: unable to serialize value', error);
        return null;
    }
}

function safeParse(value, fallback = null) {
    if (!value) return fallback;

    try {
        return JSON.parse(value);
    } catch (error) {
        logger.warn('LocalFirstCache: unable to parse value', error);
        return fallback;
    }
}

function isValidEntry(entry) {
    return !!entry && typeof entry === 'object' && typeof entry.key === 'string';
}

export class LocalFirstCache {
    constructor() {
        this.memoryCache = new Map();
        this.dbPromise = null;
        this.initialized = false;
        this.indexedDbEnabled = hasIndexedDbSupport();
        this.indexedDbExpected = this.indexedDbEnabled;
        this.invalidations = new Map();
        this.invalidationCounter = 0;
        this.persistenceTail = Promise.resolve();
    }

    generationFor(key) {
        let generation = 0;
        for (const [prefix, value] of this.invalidations) if (key.startsWith(prefix)) generation = Math.max(generation, value);
        return generation;
    }

    persistInOrder(operation) {
        const next = this.persistenceTail.then(operation);
        this.persistenceTail = next.catch(() => {});
        return next;
    }

    localStorageKeys(prefix = '') {
        const keys = [];
        for (let index = 0; index < localStorage.length; index++) {
            const storedKey = localStorage.key(index);
            if (storedKey?.startsWith(`${LOCAL_STORAGE_PREFIX}${prefix}`)) keys.push(storedKey.slice(LOCAL_STORAGE_PREFIX.length));
        }
        return keys;
    }

    async initialize() {
        if (this.initialized) return;

        this.initialized = true;

        if (this.indexedDbEnabled) {
            this.dbPromise = this.openDatabase().catch((error) => {
                logger.warn('LocalFirstCache: IndexedDB unavailable, falling back to localStorage', error);
                this.indexedDbEnabled = false;
                return null;
            });
        }
    }

    async openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'key' });
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
        });
    }

    async readFromIndexedDb(key) {
        if (!this.indexedDbEnabled) return null;
        const db = await this.dbPromise;
        if (!db) return null;

        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error || new Error('IndexedDB read failed'));
            tx.onabort = () => reject(tx.error || new Error('IndexedDB read aborted'));
        });
    }

    async writeToIndexedDb(entry) {
        if (!this.indexedDbEnabled || !isValidEntry(entry)) return false;
        const db = await this.dbPromise;
        if (!db) return false;

        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
            tx.onabort = () => reject(tx.error || new Error('IndexedDB write aborted'));

            tx.objectStore(STORE_NAME).put(entry);
        });
        return true;
    }

    async deleteFromIndexedDb(key) {
        if (!this.indexedDbEnabled) return;
        const db = await this.dbPromise;
        if (!db) return;

        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('IndexedDB delete failed'));
            tx.onabort = () => reject(tx.error || new Error('IndexedDB delete aborted'));

            tx.objectStore(STORE_NAME).delete(key);
        });
    }

    async getAllFromIndexedDb(prefix = '') {
        if (!this.indexedDbEnabled) return [];
        const db = await this.dbPromise;
        if (!db) return [];

        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const range = prefix ? IDBKeyRange.bound(prefix, `${prefix}\uffff`) : undefined;
            const request = store.getAll(range);

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error || new Error('IndexedDB getAll failed'));
            tx.onabort = () => reject(tx.error || new Error('IndexedDB getAll aborted'));
        });
    }

    readFromLocalStorage(key) {
        const storageKey = `${LOCAL_STORAGE_PREFIX}${key}`;
        return safeParse(localStorage.getItem(storageKey), null);
    }

    writeToLocalStorage(entry) {
        const storageKey = `${LOCAL_STORAGE_PREFIX}${entry.key}`;
        const serialized = safeStringify(entry);
        if (!serialized) return false;

        try {
            localStorage.setItem(storageKey, serialized);
            return true;
        } catch (error) {
            logger.warn('LocalFirstCache: localStorage write failed', error);
            return false;
        }
    }

    deleteFromLocalStorage(key) {
        try {
            localStorage.removeItem(`${LOCAL_STORAGE_PREFIX}${key}`);
        } catch (error) {
            logger.warn('LocalFirstCache: localStorage delete failed', error);
        }
    }

    needsIndexedDb() { return this.indexedDbExpected || this.indexedDbEnabled; }

    async invalidationRowsFromIndexedDb() {
        const entries = await this.getAllFromIndexedDb(INVALIDATION_PREFIX);
        return entries.filter(entry => entry?.key?.startsWith(INVALIDATION_PREFIX));
    }

    async readInvalidations(key) {
        const local = this.localStorageKeys(INVALIDATION_PREFIX).map(item => this.readFromLocalStorage(item)).filter(Boolean);
        let disk = [];
        if (this.needsIndexedDb()) {
            if (!this.indexedDbEnabled) throw persistenceError();
            disk = await this.invalidationRowsFromIndexedDb();
        }
        const records = new Map();
        for (const entry of [...local, ...disk]) {
            if (!entry?.value || (entry.value.exact ? key !== entry.value.prefix : !key.startsWith(entry.value.prefix))) continue;
            const existing = records.get(entry.key) || [];
            existing.push(entry.value); records.set(entry.key, existing);
        }
        const expectedCopies = this.needsIndexedDb() ? 2 : 1;
        const stamps = {};
        let blocked = false;
        for (const [entryKey, copies] of records) {
            const token = copies[0].token;
            if (copies.length !== expectedCopies || copies.some(copy => copy.token !== token || (copy.kind === 'mutation' && copy.pending))) blocked = true;
            stamps[entryKey] = token;
        }
        return { stamps, blocked };
    }

    entryMatchesInvalidations(entry, invalidation) {
        return isValidEntry(entry) && !invalidation.blocked
            && Object.entries(invalidation.stamps).every(([key, token]) => entry.cacheInvalidations?.[key] === token);
    }

    async getEntry(key, { requireVerified = false } = {}) {
        const generation = this.generationFor(key);
        await this.initialize();
        await this.persistenceTail;
        if (generation !== this.generationFor(key)) return null;
        let invalidation;
        try { invalidation = await this.readInvalidations(key); }
        catch (error) {
            if (requireVerified) throw error;
            return null;
        }
        if (invalidation.blocked) {
            if (requireVerified) throw persistenceError();
            return null;
        }
        if (generation !== this.generationFor(key)) return null;
        const memory = this.memoryCache.get(key);
        if (this.entryMatchesInvalidations(memory, invalidation)) return memory;
        this.memoryCache.delete(key);
        const local = this.readFromLocalStorage(key);
        let disk = null;
        if (this.needsIndexedDb()) disk = await this.readFromIndexedDb(key);
        if (generation !== this.generationFor(key)) return null;
        // Writes always update localStorage first. A failed mirror cannot restore
        // data invalidated by a verified barrier in either durable store.
        const entry = [local, disk].find(candidate => this.entryMatchesInvalidations(candidate, invalidation));
        if (entry) this.memoryCache.set(key, entry);
        return entry || null;
    }

    async get(key, options = {}) {
        const entry = await this.getEntry(key, options);
        if (!entry) return null;

        const maxAgeMs = options.maxAgeMs ?? null;
        const allowStale = options.allowStale ?? false;

        if (maxAgeMs !== null) {
            const age = Date.now() - (entry.updatedAt || 0);
            const isFresh = age <= maxAgeMs;

            if (!isFresh && !allowStale) {
                return null;
            }
        }

        return entry.value;
    }

    // Durable journals must observe other tabs, even when this instance has a
    // valid memory entry. Enumerate both stores directly and retain partial
    // writes after a crash; callers only acknowledge success after both writes.
    async getPersistedEntries(prefix) {
        await this.initialize();
        await this.persistenceTail;
        const local = this.localStorageKeys(prefix).map(key => this.readFromLocalStorage(key)).filter(Boolean);
        if (this.needsIndexedDb() && !this.indexedDbEnabled) throw persistenceError();
        const disk = this.needsIndexedDb() ? await this.getAllFromIndexedDb(prefix) : [];
        const entries = new Map();
        for (const entry of [...local, ...disk]) {
            if (!isValidEntry(entry) || !entry.key.startsWith(prefix)) continue;
            const invalidation = await this.readInvalidations(entry.key);
            if (invalidation.blocked) throw persistenceError();
            if (!this.entryMatchesInvalidations(entry, invalidation)) continue;
            const prior = entries.get(entry.key);
            if (prior && JSON.stringify(prior.value) !== JSON.stringify(entry.value)) throw persistenceError();
            entries.set(entry.key, entry);
        }
        return [...entries.values()];
    }

    async set(key, value, options = {}) {
        if (options.ifCurrent && !options.ifCurrent()) return null;
        this.invalidations.set(key, ++this.invalidationCounter);
        const generation = this.generationFor(key);
        await this.initialize();
        if (generation !== this.generationFor(key) || (options.ifCurrent && !options.ifCurrent())) return null;

        let invalidation;
        try { invalidation = await this.readInvalidations(key); }
        catch (error) {
            if (options.requireDurable) throw error;
            return null;
        }
        if (invalidation.blocked) {
            if (options.requireDurable) throw persistenceError();
            return null;
        }
        if (generation !== this.generationFor(key) || (options.ifCurrent && !options.ifCurrent())) return null;
        const entry = {
            key,
            value,
            metadata: options.metadata || {},
            updatedAt: Date.now(),
            cacheInvalidations: invalidation.stamps,
        };

        this.memoryCache.set(key, entry);
        const localDurable = this.writeToLocalStorage(entry);
        let diskDurable = !this.needsIndexedDb();

        if (this.indexedDbEnabled) {
            try {
                diskDurable = await this.persistInOrder(() => this.writeToIndexedDb(entry));
            } catch (error) {
                logger.warn('LocalFirstCache: IndexedDB write failed', error);
            }
        }

        if (options.requireDurable && (!localDurable || !diskDurable)) {
            const error = persistenceError(); error.message = 'Durable local storage unavailable'; throw error;
        }

        return entry;
    }

    invalidateMemory(prefix, exact = false) {
        this.invalidations.set(prefix, ++this.invalidationCounter);
        for (const key of this.memoryCache.keys()) if (exact ? key === prefix : key.startsWith(prefix)) this.memoryCache.delete(key);
    }

    async writeInvalidation(record) {
        const entry = { key: `${INVALIDATION_PREFIX}${record.exact ? 'exact:' : 'prefix:'}${encodeURIComponent(record.prefix)}`, value: record };
        const local = this.writeToLocalStorage(entry);
        let disk = !this.needsIndexedDb();
        if (this.needsIndexedDb() && this.indexedDbEnabled) disk = await this.writeToIndexedDb(entry);
        if (!local || !disk) throw persistenceError();
        // Verify actual durable values, not only put request completion.
        const localCopy = this.readFromLocalStorage(entry.key);
        const diskCopy = this.needsIndexedDb() ? await this.readFromIndexedDb(entry.key) : localCopy;
        if (localCopy?.value?.token !== record.token || diskCopy?.value?.token !== record.token
            || localCopy.value.pending !== record.pending || diskCopy.value.pending !== record.pending) throw persistenceError();
        return record;
    }

    async cleanInvalidatedData(prefix, exact = false) {
        const matches = key => !key.startsWith(INVALIDATION_PREFIX) && (exact ? key === prefix : key.startsWith(prefix));
        for (const key of this.localStorageKeys().filter(matches)) this.deleteFromLocalStorage(key);
        if (this.needsIndexedDb()) {
            const entries = await this.getAllFromIndexedDb(prefix);
            await Promise.all(entries.filter(entry => entry?.key && matches(entry.key)).map(entry => this.deleteFromIndexedDb(entry.key)));
        }
    }

    async invalidateDurably(prefix, { exact = false, pending = false, mutation, settlePending = false } = {}) {
        this.invalidateMemory(prefix, exact);
        await this.initialize();
        const record = { prefix, exact, token: createSecureId('invalidation'), kind: pending ? 'mutation' : 'evict', pending,
            ...(mutation ? { mutation } : {}) };
        await this.persistInOrder(async () => {
            if (!pending && !settlePending) {
                const key = `${INVALIDATION_PREFIX}${exact ? 'exact:' : 'prefix:'}${encodeURIComponent(prefix)}`;
                const copies = [this.readFromLocalStorage(key), ...(this.needsIndexedDb() ? [await this.readFromIndexedDb(key)] : [])];
                // Ordinary auth/refresh eviction must not settle an unknown RPC.
                // Keep its fail-closed barrier until a receipt proves completion.
                if (copies.some(copy => copy?.value?.kind === 'mutation' && copy.value.pending)) return;
            }
            await this.writeInvalidation(record);
            try { await this.cleanInvalidatedData(prefix, exact); }
            catch (error) { logger.warn('Cache cleanup failed; verified durable invalidation remains active:', error); }
        });
        return record;
    }

    async remove(key) {
        this.invalidateMemory(key, true);
        return withCacheMutationLock(cacheOwnerForPrefix(key), () => this.invalidateDurably(key, { exact: true }));
    }

    async clearByPrefix(prefix) {
        this.invalidateMemory(prefix);
        return withCacheMutationLock(cacheOwnerForPrefix(prefix), () => this.invalidateDurably(prefix));
    }

    async withSessionMutation(userId, operation, mutation) {
        const prefixes = [
            { prefix: `history:${userId}:` }, { prefix: `calendar:${userId}:` },
            { prefix: `progress:sessions:${userId}`, exact: true }, { prefix: `daily-hub:${userId}:` },
        ];
        prefixes.forEach(({ prefix, exact }) => this.invalidateMemory(prefix, exact));
        return withCacheMutationLock(`user:${userId}`, async () => {
            // Persist a pending barrier before any server write. If neither
            // durable path can prove invalidation, the backend is untouched.
            const tickets = [];
            for (const { prefix, exact } of prefixes) tickets.push(await this.invalidateDurably(prefix, { exact, pending: true, mutation }));
            const result = await operation();
            try {
                for (const ticket of tickets) await this.invalidateDurably(ticket.prefix, { exact: ticket.exact, settlePending: true });
            } catch (error) {
                // The backend accepted the write. Verified pending barriers (or
                // mismatched completion epochs) still reject every old entry.
                // Do not misreport this as a rejected save and invite a new ID.
                logger.warn('Session committed; durable cache remains conservatively blocked:', error);
            }
            return result;
        });
    }

    async recoverSessionInvalidations(userId, confirmMutation, ifCurrent = () => true) {
        await this.initialize();
        return withCacheMutationLock(`user:${userId}`, async () => {
            await this.persistenceTail;
            const readRows = async () => [
                ...this.localStorageKeys(INVALIDATION_PREFIX).map(key => this.readFromLocalStorage(key)).filter(Boolean),
                ...(this.needsIndexedDb() ? await this.invalidationRowsFromIndexedDb() : []),
            ];
            const candidates = new Map();
            for (const entry of await readRows()) {
                const record = entry.value;
                if (record?.pending && record.kind === 'mutation' && record.mutation?.sessionId
                    && cacheOwnerForPrefix(record.prefix) === `user:${userId}`) candidates.set(entry.key, record);
            }
            const confirmed = new Map(); let recovered = 0;
            for (const [key, record] of candidates) {
                if (!ifCurrent()) return recovered;
                const identity = JSON.stringify(record.mutation);
                if (!confirmed.has(identity)) confirmed.set(identity, await confirmMutation(record.mutation));
                if (!confirmed.get(identity) || !ifCurrent()) continue;
                // A different pending intent must never inherit an older proof.
                const current = (await readRows()).filter(entry => entry.key === key).map(entry => entry.value);
                if (!current.some(value => value.token === record.token)
                    || current.some(value => value.pending && value.token !== record.token)) continue;
                await this.invalidateDurably(record.prefix, { exact: record.exact, settlePending: true });
                recovered++;
            }
            return recovered;
        });
    }

    async clearAll() { return this.clearByPrefix(''); }

    isFresh(entry, maxAgeMs) {
        if (!entry || typeof maxAgeMs !== 'number') return false;
        return Date.now() - (entry.updatedAt || 0) <= maxAgeMs;
    }
}

export const localFirstCache = new LocalFirstCache();

export default localFirstCache;
