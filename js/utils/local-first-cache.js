import { logger } from './logger.js';

const DB_NAME = 'gym-tracker-local-cache';
const DB_VERSION = 1;
const STORE_NAME = 'entries';
const LOCAL_STORAGE_PREFIX = 'gym-tracker-local-cache:';

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
        });
    }

    async writeToIndexedDb(entry) {
        if (!this.indexedDbEnabled || !isValidEntry(entry)) return;
        const db = await this.dbPromise;
        if (!db) return;

        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));

            tx.objectStore(STORE_NAME).put(entry);
        });
    }

    async deleteFromIndexedDb(key) {
        if (!this.indexedDbEnabled) return;
        const db = await this.dbPromise;
        if (!db) return;

        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('IndexedDB delete failed'));

            tx.objectStore(STORE_NAME).delete(key);
        });
    }

    async getAllFromIndexedDb() {
        if (!this.indexedDbEnabled) return [];
        const db = await this.dbPromise;
        if (!db) return [];

        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error || new Error('IndexedDB getAll failed'));
        });
    }

    readFromLocalStorage(key) {
        const storageKey = `${LOCAL_STORAGE_PREFIX}${key}`;
        return safeParse(localStorage.getItem(storageKey), null);
    }

    writeToLocalStorage(entry) {
        const storageKey = `${LOCAL_STORAGE_PREFIX}${entry.key}`;
        const serialized = safeStringify(entry);
        if (!serialized) return;

        try {
            localStorage.setItem(storageKey, serialized);
        } catch (error) {
            logger.warn('LocalFirstCache: localStorage write failed', error);
        }
    }

    deleteFromLocalStorage(key) {
        try {
            localStorage.removeItem(`${LOCAL_STORAGE_PREFIX}${key}`);
        } catch (error) {
            logger.warn('LocalFirstCache: localStorage delete failed', error);
        }
    }

    async getEntry(key) {
        await this.initialize();

        if (this.memoryCache.has(key)) {
            return this.memoryCache.get(key);
        }

        let entry = null;

        if (this.indexedDbEnabled) {
            try {
                entry = await this.readFromIndexedDb(key);
            } catch (error) {
                logger.warn('LocalFirstCache: IndexedDB read failed', error);
            }
        }

        if (!entry) {
            entry = this.readFromLocalStorage(key);
        }

        if (isValidEntry(entry)) {
            this.memoryCache.set(key, entry);
            return entry;
        }

        return null;
    }

    async get(key, options = {}) {
        const entry = await this.getEntry(key);
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

    async set(key, value, options = {}) {
        await this.initialize();

        const entry = {
            key,
            value,
            metadata: options.metadata || {},
            updatedAt: Date.now()
        };

        this.memoryCache.set(key, entry);
        this.writeToLocalStorage(entry);

        if (this.indexedDbEnabled) {
            try {
                await this.writeToIndexedDb(entry);
            } catch (error) {
                logger.warn('LocalFirstCache: IndexedDB write failed', error);
            }
        }

        return entry;
    }

    async remove(key) {
        await this.initialize();

        this.memoryCache.delete(key);
        this.deleteFromLocalStorage(key);

        if (this.indexedDbEnabled) {
            try {
                await this.deleteFromIndexedDb(key);
            } catch (error) {
                logger.warn('LocalFirstCache: IndexedDB delete failed', error);
            }
        }
    }

    async clearByPrefix(prefix) {
        await this.initialize();

        const memoryKeys = Array.from(this.memoryCache.keys()).filter((key) => key.startsWith(prefix));
        memoryKeys.forEach((key) => {
            this.memoryCache.delete(key);
            this.deleteFromLocalStorage(key);
        });

        if (!this.indexedDbEnabled) return;

        try {
            const entries = await this.getAllFromIndexedDb();
            const keys = entries
                .filter((entry) => entry && typeof entry.key === 'string' && entry.key.startsWith(prefix))
                .map((entry) => entry.key);

            await Promise.all(keys.map((key) => this.deleteFromIndexedDb(key)));
        } catch (error) {
            logger.warn('LocalFirstCache: clearByPrefix failed', error);
        }
    }

    async clearAll() {
        await this.initialize();

        const keys = Array.from(this.memoryCache.keys());
        this.memoryCache.clear();
        keys.forEach((key) => this.deleteFromLocalStorage(key));

        if (!this.indexedDbEnabled) return;

        try {
            const db = await this.dbPromise;
            if (!db) return;

            await new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const request = tx.objectStore(STORE_NAME).clear();

                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error || new Error('IndexedDB clear failed'));
            });
        } catch (error) {
            logger.warn('LocalFirstCache: clearAll failed', error);
        }
    }

    isFresh(entry, maxAgeMs) {
        if (!entry || typeof maxAgeMs !== 'number') return false;
        return Date.now() - (entry.updatedAt || 0) <= maxAgeMs;
    }
}

export const localFirstCache = new LocalFirstCache();

export default localFirstCache;
