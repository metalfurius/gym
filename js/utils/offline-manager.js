/**
 * Offline Detection and Management
 * Detects offline state and provides user-friendly messaging.
 * Supports a durable queue for serializable operations.
 */

import { logger } from './logger.js';
import { toast } from './notifications.js';
import { DurableOutbox } from './durable-outbox.js';
import { t } from '../i18n.js';
import { createSecureId } from './secure-id.js';

const ACCOUNT_OPERATION_TYPES = new Set([
    'session.save', 'session.delete', 'quicklog.save', 'preferences.saveWeeklyTarget',
    'preferences.syncWeeklyState', 'routines.fetch',
]);
const isOwnerId = value => typeof value === 'string' && value.trim().length > 0;

function createQueueId() {
    return createSecureId('offline');
}

function isSerializableDescriptor(descriptor) {
    return !!descriptor
        && typeof descriptor === 'object'
        && typeof descriptor.type === 'string'
        && descriptor.type.trim().length > 0;
}

function migrateDescriptor(descriptor, queueId) {
    if (['session.save', 'quicklog.save'].includes(descriptor?.type)
        && descriptor.payload?.userId && !descriptor.payload.sessionId) {
        return { ...descriptor, payload: { ...descriptor.payload, sessionId: `legacy-${queueId}` } };
    }
    return descriptor;
}

export class OfflineManager {
    constructor({ outbox = new DurableOutbox() } = {}) {
        this.isOnline = navigator.onLine;
        this.pendingOperations = [];
        this.listeners = [];
        this.initialized = false;
        this.onlineHandler = null;
        this.offlineHandler = null;
        this.isProcessing = false;
        this.operationHandlers = new Map();
        this.operationScopes = new Map();
        this.pendingRestorePromise = null;
        this.queueRestored = false;
        this.queuePersistenceTail = Promise.resolve();
        this.outbox = outbox;
        this.pendingAcknowledgements = new Set();
        this.activeUserId = undefined;
        this.queueListeners = [];
        this.processingPromise = null;
    }

    /**
     * Initialize offline detection.
     */
    init() {
        if (this.initialized) return;

        this.onlineHandler = () => this.handleOnline();
        this.offlineHandler = () => this.handleOffline();

        window.addEventListener('online', this.onlineHandler);
        window.addEventListener('offline', this.offlineHandler);

        this.isOnline = navigator.onLine;
        if (!this.isOnline) {
            this.handleOffline();
        }

        this.restorePersistedQueue()
            .then(async () => {
                if (this.checkOnline() && !this.isProcessing && this.pendingOperations.length > 0) {
                    try {
                        await this.processPendingOperations();
                    } catch (error) {
                        logger.error('Failed to process restored offline queue on init:', error);
                    }
                }
            })
            .catch((error) => {
                logger.warn('Could not restore persisted offline queue:', error);
            });

        this.initialized = true;
        logger.info('OfflineManager initialized');
    }

    /**
     * Clean up event listeners and resources.
     */
    destroy() {
        if (this.onlineHandler) {
            window.removeEventListener('online', this.onlineHandler);
        }
        if (this.offlineHandler) {
            window.removeEventListener('offline', this.offlineHandler);
        }

        this.onlineHandler = null;
        this.offlineHandler = null;
        this.initialized = false;
        this.listeners = [];
        // Destruction is a lifecycle event, not authorization to erase durable work.
        this.pendingOperations = this.pendingOperations.filter(entry => isSerializableDescriptor(entry.descriptor));

        logger.info('OfflineManager destroyed');
    }

    /**
     * Register a durable queue operation handler.
     * @param {string} type - Descriptor type key.
     * @param {Function} handler - Async handler that receives descriptor payload.
     */
    registerOperationHandler(type, handler, { scope = 'account' } = {}) {
        if (typeof type !== 'string' || type.trim().length === 0 || typeof handler !== 'function') {
            throw new Error('registerOperationHandler requires a type and a handler function');
        }
        if (!['account', 'global'].includes(scope) || (scope === 'global' && ACCOUNT_OPERATION_TYPES.has(type))) {
            throw new Error('Account operations require an explicit owner UID');
        }

        this.operationHandlers.set(type, handler);
        this.operationScopes.set(type, scope);
    }

    /**
     * Remove a registered durable queue operation handler.
     * @param {string} type - Descriptor type key.
     */
    removeOperationHandler(type) {
        this.operationHandlers.delete(type);
        this.operationScopes.delete(type);
    }

    /**
     * Restore persisted serializable operations from local-first storage.
     */
    async restorePersistedQueue() {
        if (this.pendingRestorePromise) {
            return this.pendingRestorePromise;
        }

        this.pendingRestorePromise = (async () => {
            const { entries: persistedQueue, acknowledged } = await this.outbox.read();
            this.pendingOperations = this.pendingOperations.filter(item => !acknowledged.has(item.id));

            const knownIds = new Set(this.pendingOperations.map((item) => item.id));
            for (const persistedItem of persistedQueue) {
                if (!persistedItem || typeof persistedItem !== 'object') continue;
                if (!persistedItem.id || this.pendingAcknowledgements.has(persistedItem.id)) continue;
                if (!isSerializableDescriptor(persistedItem.descriptor)) continue;

                if (knownIds.has(persistedItem.id)) {
                    const current = this.pendingOperations.find(item => item.id === persistedItem.id);
                    if (persistedItem.status === 'conflict') {
                        current.status = 'conflict'; current.conflict = persistedItem.conflict;
                    }
                    continue;
                }

                const entry = {
                    id: persistedItem.id,
                    operation: null,
                    description: persistedItem.description || t('offline.queued_when_online'),
                    timestamp: persistedItem.timestamp || Date.now(),
                    status: persistedItem.status,
                    conflict: persistedItem.conflict,
                    scope: persistedItem.scope,
                    ownerId: persistedItem.ownerId,
                    descriptor: migrateDescriptor(persistedItem.descriptor, persistedItem.id)
                };
                if (this.getOperationOwnership(entry).kind === 'unowned') entry.status = 'unowned';
                this.pendingOperations.push(entry);
                knownIds.add(persistedItem.id);
            }
        })();

        try {
            await this.pendingRestorePromise;
            this.queueRestored = true;
        } finally {
            this.pendingRestorePromise = null;
        }
    }

    getPersistableQueue() {
        return this.pendingOperations
            .filter((item) => isSerializableDescriptor(item.descriptor))
            .map((item) => ({
                id: item.id,
                description: item.description,
                timestamp: item.timestamp,
                ...(item.status ? { status: item.status } : {}),
                ...(item.conflict ? { conflict: item.conflict } : {}),
                ...(item.scope ? { scope: item.scope } : {}),
                ...(item.ownerId ? { ownerId: item.ownerId } : {}),
                descriptor: item.descriptor
            }));
    }

    async persistQueue() {
        const persist = async () => {
            await this.restorePersistedQueue();
            const acknowledgements = [...this.pendingAcknowledgements];
            await this.outbox.save(this.getPersistableQueue(), acknowledgements);
            for (const id of acknowledgements) this.pendingAcknowledgements.delete(id);
            await this.restorePersistedQueue();
        };
        const next = this.queuePersistenceTail.then(persist);
        this.queuePersistenceTail = next.catch(error => logger.warn('Failed to persist offline queue:', error));
        return next;
    }

    setActiveUser(userId) { this.activeUserId = userId || null; }

    getOperationOwnership(entry) {
        if (entry.descriptor) {
            const owner = entry.descriptor.payload?.userId;
            if (isOwnerId(owner) && (!entry.ownerId || entry.ownerId === owner)) return { kind: 'account', ownerId: owner };
            if (owner !== undefined || entry.ownerId || ACCOUNT_OPERATION_TYPES.has(entry.descriptor.type)) return { kind: 'unowned' };
            // A registered handler explicitly declares that this type never
            // accesses account data. Unknown legacy types are quarantined.
            if (this.operationScopes.get(entry.descriptor.type) === 'global') return { kind: 'global' };
            return { kind: 'unowned' };
        }
        if (isOwnerId(entry.ownerId)) return { kind: 'account', ownerId: entry.ownerId };
        return { kind: entry.scope === 'global' ? 'global' : 'unowned' };
    }

    belongsToActiveUser(entry) {
        const ownership = this.getOperationOwnership(entry);
        return ownership.kind === 'global' || (ownership.kind === 'account' && ownership.ownerId === this.activeUserId);
    }

    async acknowledgeOperation(id) {
        this.pendingAcknowledgements.add(id);
        this.pendingOperations = this.pendingOperations.filter(entry => entry.id !== id);
        await this.persistQueue();
        await this.notifyQueueChange();
    }

    async markConflict(id, error) {
        const entry = this.pendingOperations.find(item => item.id === id);
        if (entry) {
            entry.status = 'conflict';
            entry.conflict = { code: 'sync/conflict', currentRevision: error.result?.currentRevision ?? null };
            await this.persistQueue();
            await this.notifyQueueChange();
        }
    }

    async resolveConflicts(userId, weekKey) {
        for (const entry of this.pendingOperations) {
            if (entry.status === 'conflict' && entry.descriptor?.payload?.userId === userId
                && entry.descriptor?.payload?.weekKey === weekKey) this.pendingAcknowledgements.add(entry.id);
        }
        this.pendingOperations = this.pendingOperations.filter(entry => !(entry.status === 'conflict'
            && entry.descriptor?.payload?.userId === userId && entry.descriptor?.payload?.weekKey === weekKey));
        await this.persistQueue();
        await this.notifyQueueChange();
    }

    addQueueListener(listener) { this.queueListeners.push(listener); }

    notifyQueueChange() {
        return Promise.allSettled(this.queueListeners.map(listener => Promise.resolve().then(listener)));
    }

    /**
     * Handle going offline.
     */
    handleOffline() {
        this.isOnline = false;
        logger.warn('App is now offline');
        try {
            toast.warning(t('offline.limited_features'), { duration: 5000 });
        } catch (e) {
            logger.debug('Toast not available', e);
        }

        this.notifyListeners(false);
    }

    /**
     * Handle coming back online.
     */
    async handleOnline() {
        this.isOnline = true;
        logger.info('App is now online');
        try {
            toast.success(t('offline.connection_restored'), { duration: 3000 });
        } catch (e) {
            logger.debug('Toast not available', e);
        }

        await this.notifyListeners(true);

        await this.restorePersistedQueue();

        if (!this.isProcessing && this.pendingOperations.length > 0) {
            try {
                await this.processPendingOperations();
            } catch (error) {
                logger.error('Failed to process pending operations:', error);
            }
        }
    }

    /**
     * Check if currently online.
     * @returns {boolean}
     */
    checkOnline() {
        return navigator.onLine;
    }

    /**
     * Execute operation with offline handling.
     * @param {Function} operation - Async operation to execute.
     * @param {string} errorMessage - User-friendly error message.
     * @param {boolean} queueIfOffline - Whether to queue operation for retry.
     * @param {Object|null} queueDescriptor - Serializable descriptor for durable queue.
     * @returns {Promise<*>}
     */
    async executeWithOfflineHandling(operation, errorMessage = undefined, queueIfOffline = false, queueDescriptor = null, queueOptions = {}) {
        if (typeof operation !== 'function') {
            throw new Error('Operation must be a function');
        }

        const resolvedErrorMessage = errorMessage ?? t('offline.default_error');

        if (!this.checkOnline()) {
            logger.warn('Operation attempted while offline');
            try {
                toast.error(resolvedErrorMessage, { duration: 4000 });
            } catch (e) {
                logger.debug('Toast not available', e);
            }

            if (queueIfOffline) {
                const queueOperationFn = isSerializableDescriptor(queueDescriptor) ? null : operation;
                this.queueOperation(queueOperationFn, resolvedErrorMessage, { ...queueOptions, descriptor: queueDescriptor });
                if (isSerializableDescriptor(queueDescriptor)) await this.persistQueue();
                try {
                    toast.info(t('offline.queued_when_online'), { duration: 3000 });
                } catch (e) {
                    logger.debug('Toast not available', e);
                }
            }

            throw new Error(`Offline: ${resolvedErrorMessage}`);
        }

        try {
            return await operation();
        } catch (error) {
            if (error.code === 'sync/retry-exhausted' && queueIfOffline && isSerializableDescriptor(queueDescriptor)
                && isOwnerId(error.userId) && queueDescriptor.payload?.userId === error.userId) {
                this.queueOperation(null, resolvedErrorMessage, { ...queueOptions, descriptor: queueDescriptor });
                await this.persistQueue();
                const queued = new Error(`Offline: ${resolvedErrorMessage}`, { cause: error });
                queued.code = 'sync/queued';
                throw queued;
            }
            if (this.isNetworkError(error)) {
                logger.error('Network error during operation:', error);
                try {
                    toast.error(t('offline.connection_error_retry'), { duration: 5000 });
                } catch (e) {
                    logger.debug('Toast not available', e);
                }

                if (queueIfOffline) {
                    const queueOperationFn = isSerializableDescriptor(queueDescriptor) ? null : operation;
                    this.queueOperation(queueOperationFn, resolvedErrorMessage, { ...queueOptions, descriptor: queueDescriptor });
                    if (isSerializableDescriptor(queueDescriptor)) await this.persistQueue();
                }
            }
            throw error;
        }
    }

    /**
     * Check if error is network-related.
     * @param {Error} error
     * @returns {boolean}
     */
    isNetworkError(error) {
        const networkErrors = [
            'network',
            'fetch',
            'timeout',
            'unavailable',
            'Failed to fetch',
            'NetworkError',
            'ERR_INTERNET_DISCONNECTED',
            'ERR_NETWORK_CHANGED'
        ];

        const errorString = error?.toString().toLowerCase() || '';
        return networkErrors.some((term) => errorString.includes(term.toLowerCase()));
    }

    /**
     * Queue operation for retry when online.
     * @param {Function|null} operation
     * @param {string} description
     * @param {Object} options
     * @param {Object|null} options.descriptor - Optional serializable descriptor.
     */
    queueOperation(operation, description, options = {}) {
        const descriptor = isSerializableDescriptor(options.descriptor) ? options.descriptor : null;
        const queueEntry = {
            id: options.id || createQueueId(),
            operation: typeof operation === 'function' ? operation : null,
            description,
            timestamp: Date.now(),
            ...(options.scope ? { scope: options.scope } : {}),
            ...(options.ownerId ? { ownerId: options.ownerId } : {}),
            descriptor
        };
        if (descriptor) queueEntry.descriptor = migrateDescriptor(descriptor, queueEntry.id);
        if (this.getOperationOwnership(queueEntry).kind === 'unowned') queueEntry.status = 'unowned';

        this.pendingOperations.push(queueEntry);
        logger.info(`Queued operation: ${description}`);

        if (descriptor) {
            this.persistQueue().catch((error) => {
                logger.warn('Could not persist queued operation:', error);
            });
        }
        return queueEntry.id;
    }

    resolveOperation(entry) {
        if (isSerializableDescriptor(entry.descriptor)) {
            const handler = this.operationHandlers.get(entry.descriptor.type);
            if (typeof handler === 'function') {
                return () => handler(entry.descriptor.payload);
            }
        }

        if (typeof entry.operation === 'function') {
            return entry.operation;
        }

        return null;
    }

    /**
     * Process all pending operations.
     */
    async processPendingOperations() {
        if (this.processingPromise) return this.processingPromise;
        const processing = this.processPendingOperationsInternal();
        this.processingPromise = processing;
        try { return await processing; }
        finally { if (this.processingPromise === processing) this.processingPromise = null; }
    }

    async processPendingOperationsInternal() {
        await this.restorePersistedQueue();

        if (!this.checkOnline()) return;
        if (this.pendingOperations.length === 0) return;
        if (this.isProcessing) {
            logger.debug('Already processing pending operations, skipping');
            return;
        }

        this.isProcessing = true;

        try {
            logger.info(`Processing ${this.pendingOperations.length} pending operations`);

            const operations = [...this.pendingOperations];

            let successCount = 0;
            let failureCount = 0;

            for (const queueEntry of operations) {
                if (!this.belongsToActiveUser(queueEntry) || queueEntry.status === 'conflict') continue;
                const operationToRun = this.resolveOperation(queueEntry);
                if (!operationToRun) {
                    failureCount++;
                    logger.warn(`No handler found for queued operation: ${queueEntry.description}`);
                    continue;
                }

                try {
                    await operationToRun();
                    if (isSerializableDescriptor(queueEntry.descriptor)) this.pendingAcknowledgements.add(queueEntry.id);
                    this.pendingOperations = this.pendingOperations.filter(entry => entry.id !== queueEntry.id);
                    successCount++;
                    logger.info(`Completed queued operation: ${queueEntry.description}`);
                } catch (error) {
                    failureCount++;
                    logger.error(`Failed queued operation: ${queueEntry.description}`, error);
                    if (error.code === 'sync/conflict') {
                        queueEntry.status = 'conflict';
                        queueEntry.conflict = { code: error.code, currentRevision: error.result?.currentRevision ?? null };
                    }
                }
                // Keep in-flight work durable until each individual acknowledgement.
                await this.persistQueue();
            }

            await this.persistQueue();

            if (successCount > 0) {
                try {
                    toast.success(t('offline.operations_completed', { count: successCount }), { duration: 3000 });
                } catch (e) {
                    logger.debug('Toast not available', e);
                }
            }

            if (failureCount > 0) {
                try {
                    toast.warning(t('offline.operations_failed', { count: failureCount }), { duration: 4000 });
                } catch (e) {
                    logger.debug('Toast not available', e);
                }
            }
        } finally {
            this.isProcessing = false;
            await this.notifyQueueChange();
        }
    }

    /**
     * Register a listener for online/offline changes.
     * @param {Function} callback - Called with boolean (true = online, false = offline).
     */
    addListener(callback) {
        this.listeners.push(callback);
    }

    /**
     * Remove a listener.
     * @param {Function} callback
     */
    removeListener(callback) {
        this.listeners = this.listeners.filter((cb) => cb !== callback);
    }

    /**
     * Notify all listeners of state change.
     * @param {boolean} isOnline
     */
    async notifyListeners(isOnline) {
        const pending = [];
        for (const callback of this.listeners) {
            try {
                const result = callback(isOnline);
                if (result?.then) pending.push(result);
            } catch (error) {
                logger.error('Error in offline listener:', error);
            }
        }
        const results = await Promise.allSettled(pending);
        results.filter(result => result.status === 'rejected').forEach(result => logger.warn('Async offline listener failed:', result.reason));
    }

    /**
     * Get pending operations count.
     * @returns {number}
     */
    getPendingCount() {
        return this.pendingOperations.filter(entry => this.belongsToActiveUser(entry)).length;
    }

    getConflictCount() {
        return this.pendingOperations.filter(entry => this.belongsToActiveUser(entry) && entry.status === 'conflict').length;
    }

    getUnownedCount() {
        return this.pendingOperations.filter(entry => this.getOperationOwnership(entry).kind === 'unowned').length;
    }

    /**
     * Clear all pending operations.
     */
    clearPending() {
        for (const entry of this.pendingOperations) if (isSerializableDescriptor(entry.descriptor)) this.pendingAcknowledgements.add(entry.id);
        this.pendingOperations = [];
        this.queueRestored = true;
        this.persistQueue().catch((error) => {
            logger.warn('Could not clear persisted offline queue:', error);
        });
        logger.info('Cleared all pending operations');
    }
}

export const offlineManager = new OfflineManager();
