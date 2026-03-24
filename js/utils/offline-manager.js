/**
 * Offline Detection and Management
 * Detects offline state and provides user-friendly messaging.
 * Supports a durable queue for serializable operations.
 */

import { logger } from './logger.js';
import { toast } from './notifications.js';
import { localFirstCache } from './local-first-cache.js';

const PERSISTED_QUEUE_KEY = 'offline:pending-operations:v1';
const DEFAULT_ERROR_MESSAGE = 'Esta operacion requiere conexion a Internet';

function createQueueId() {
    return `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isSerializableDescriptor(descriptor) {
    return !!descriptor
        && typeof descriptor === 'object'
        && typeof descriptor.type === 'string'
        && descriptor.type.trim().length > 0;
}

class OfflineManager {
    constructor() {
        this.isOnline = navigator.onLine;
        this.pendingOperations = [];
        this.listeners = [];
        this.initialized = false;
        this.onlineHandler = null;
        this.offlineHandler = null;
        this.isProcessing = false;
        this.operationHandlers = new Map();
        this.pendingRestorePromise = null;
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
        this.clearPending();

        logger.info('OfflineManager destroyed');
    }

    /**
     * Register a durable queue operation handler.
     * @param {string} type - Descriptor type key.
     * @param {Function} handler - Async handler that receives descriptor payload.
     */
    registerOperationHandler(type, handler) {
        if (typeof type !== 'string' || type.trim().length === 0 || typeof handler !== 'function') {
            throw new Error('registerOperationHandler requires a type and a handler function');
        }

        this.operationHandlers.set(type, handler);
    }

    /**
     * Remove a registered durable queue operation handler.
     * @param {string} type - Descriptor type key.
     */
    removeOperationHandler(type) {
        this.operationHandlers.delete(type);
    }

    /**
     * Restore persisted serializable operations from local-first storage.
     */
    async restorePersistedQueue() {
        if (this.pendingRestorePromise) {
            return this.pendingRestorePromise;
        }

        this.pendingRestorePromise = (async () => {
            const persistedQueue = await localFirstCache.get(PERSISTED_QUEUE_KEY, { allowStale: true });
            if (!Array.isArray(persistedQueue) || persistedQueue.length === 0) {
                return;
            }

            const knownIds = new Set(this.pendingOperations.map((item) => item.id));
            for (const persistedItem of persistedQueue) {
                if (!persistedItem || typeof persistedItem !== 'object') continue;
                if (!persistedItem.id || knownIds.has(persistedItem.id)) continue;
                if (!isSerializableDescriptor(persistedItem.descriptor)) continue;

                this.pendingOperations.push({
                    id: persistedItem.id,
                    operation: null,
                    description: persistedItem.description || 'Operacion en cola',
                    timestamp: persistedItem.timestamp || Date.now(),
                    descriptor: persistedItem.descriptor
                });
                knownIds.add(persistedItem.id);
            }
        })();

        try {
            await this.pendingRestorePromise;
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
                descriptor: item.descriptor
            }));
    }

    async persistQueue() {
        try {
            const persistableQueue = this.getPersistableQueue();
            if (persistableQueue.length === 0) {
                await localFirstCache.remove(PERSISTED_QUEUE_KEY);
                return;
            }

            await localFirstCache.set(PERSISTED_QUEUE_KEY, persistableQueue, {
                metadata: {
                    count: persistableQueue.length,
                    updatedAt: Date.now()
                }
            });
        } catch (error) {
            logger.warn('Failed to persist offline queue:', error);
        }
    }

    /**
     * Handle going offline.
     */
    handleOffline() {
        this.isOnline = false;
        logger.warn('App is now offline');
        try {
            toast.warning('Sin conexion a Internet. Algunas funciones estaran limitadas.', { duration: 5000 });
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
            toast.success('Conexion restablecida', { duration: 3000 });
        } catch (e) {
            logger.debug('Toast not available', e);
        }

        this.notifyListeners(true);

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
    async executeWithOfflineHandling(operation, errorMessage = DEFAULT_ERROR_MESSAGE, queueIfOffline = false, queueDescriptor = null) {
        if (typeof operation !== 'function') {
            throw new Error('Operation must be a function');
        }

        if (!this.checkOnline()) {
            logger.warn('Operation attempted while offline');
            try {
                toast.error(errorMessage, { duration: 4000 });
            } catch (e) {
                logger.debug('Toast not available', e);
            }

            if (queueIfOffline) {
                this.queueOperation(operation, errorMessage, { descriptor: queueDescriptor });
                try {
                    toast.info('La operacion se guardara para cuando haya conexion', { duration: 3000 });
                } catch (e) {
                    logger.debug('Toast not available', e);
                }
            }

            throw new Error(`Offline: ${errorMessage}`);
        }

        try {
            return await operation();
        } catch (error) {
            if (this.isNetworkError(error)) {
                logger.error('Network error during operation:', error);
                try {
                    toast.error('Error de conexion. Verifica tu Internet e intenta de nuevo.', { duration: 5000 });
                } catch (e) {
                    logger.debug('Toast not available', e);
                }

                if (queueIfOffline) {
                    this.queueOperation(operation, errorMessage, { descriptor: queueDescriptor });
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
            descriptor
        };

        this.pendingOperations.push(queueEntry);
        logger.info(`Queued operation: ${description}`);

        if (descriptor) {
            this.persistQueue().catch((error) => {
                logger.warn('Could not persist queued operation:', error);
            });
        }
    }

    resolveOperation(entry) {
        if (typeof entry.operation === 'function') {
            return entry.operation;
        }

        if (isSerializableDescriptor(entry.descriptor)) {
            const handler = this.operationHandlers.get(entry.descriptor.type);
            if (typeof handler === 'function') {
                return () => handler(entry.descriptor.payload);
            }
        }

        return null;
    }

    /**
     * Process all pending operations.
     */
    async processPendingOperations() {
        await this.restorePersistedQueue();

        if (this.pendingOperations.length === 0) return;
        if (this.isProcessing) {
            logger.debug('Already processing pending operations, skipping');
            return;
        }

        this.isProcessing = true;

        try {
            logger.info(`Processing ${this.pendingOperations.length} pending operations`);

            const operations = [...this.pendingOperations];
            this.pendingOperations = [];

            let successCount = 0;
            let failureCount = 0;

            for (const queueEntry of operations) {
                const operationToRun = this.resolveOperation(queueEntry);
                if (!operationToRun) {
                    failureCount++;
                    logger.warn(`No handler found for queued operation: ${queueEntry.description}`);
                    this.pendingOperations.push({
                        ...queueEntry,
                        timestamp: Date.now()
                    });
                    continue;
                }

                try {
                    await operationToRun();
                    successCount++;
                    logger.info(`Completed queued operation: ${queueEntry.description}`);
                } catch (error) {
                    failureCount++;
                    logger.error(`Failed queued operation: ${queueEntry.description}`, error);
                    this.pendingOperations.push({
                        ...queueEntry,
                        timestamp: Date.now()
                    });
                }
            }

            await this.persistQueue();

            if (successCount > 0) {
                try {
                    toast.success(`${successCount} operacion(es) completada(s)`, { duration: 3000 });
                } catch (e) {
                    logger.debug('Toast not available', e);
                }
            }

            if (failureCount > 0) {
                try {
                    toast.warning(`${failureCount} operacion(es) fallida(s)`, { duration: 4000 });
                } catch (e) {
                    logger.debug('Toast not available', e);
                }
            }
        } finally {
            this.isProcessing = false;
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
    notifyListeners(isOnline) {
        for (const callback of this.listeners) {
            try {
                callback(isOnline);
            } catch (error) {
                logger.error('Error in offline listener:', error);
            }
        }
    }

    /**
     * Get pending operations count.
     * @returns {number}
     */
    getPendingCount() {
        return this.pendingOperations.length;
    }

    /**
     * Clear all pending operations.
     */
    clearPending() {
        this.pendingOperations = [];
        this.persistQueue().catch((error) => {
            logger.warn('Could not clear persisted offline queue:', error);
        });
        logger.info('Cleared all pending operations');
    }
}

export const offlineManager = new OfflineManager();
