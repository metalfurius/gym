/**
 * Offline Detection and Management
 * Detects offline state and provides user-friendly messaging
 */

import { logger } from './logger.js';
import { toast } from './notifications.js';

class OfflineManager {
    constructor() {
        this.isOnline = navigator.onLine;
        this.pendingOperations = [];
        this.listeners = [];
        this.initialized = false;
        this.onlineHandler = null;
        this.offlineHandler = null;
        this.isProcessing = false;
    }

    /**
     * Initialize offline detection
     */
    init() {
        if (this.initialized) return;

        // Create bound handlers for later removal
        this.onlineHandler = () => this.handleOnline();
        this.offlineHandler = () => this.handleOffline();

        // Listen for online/offline events
        window.addEventListener('online', this.onlineHandler);
        window.addEventListener('offline', this.offlineHandler);

        // Check initial state
        if (!this.isOnline) {
            this.handleOffline();
        }

        this.initialized = true;
        logger.info('OfflineManager initialized');
    }

    /**
     * Clean up event listeners and resources
     */
    destroy() {
        // Remove event listeners even if not officially initialized
        if (this.onlineHandler) {
            window.removeEventListener('online', this.onlineHandler);
        }
        if (this.offlineHandler) {
            window.removeEventListener('offline', this.offlineHandler);
        }

        // Clear state
        this.onlineHandler = null;
        this.offlineHandler = null;
        this.initialized = false;
        this.listeners = [];
        this.clearPending();

        logger.info('OfflineManager destroyed');
    }

    /**
     * Handle going offline
     */
    handleOffline() {
        this.isOnline = false;
        logger.warn('App is now offline');
        try {
            toast.warning('Sin conexión a Internet. Algunas funciones estarán limitadas.', { duration: 5000 });
        } catch (e) {
            // Toast may not be available in test environment
            logger.debug('Toast not available', e);
        }
        
        // Notify listeners
        this.notifyListeners(false);
    }

    /**
     * Handle coming back online
     */
    async handleOnline() {
        this.isOnline = true;
        logger.info('App is now online');
        try {
            toast.success('Conexión restablecida', { duration: 3000 });
        } catch (e) {
            // Toast may not be available in test environment
            logger.debug('Toast not available', e);
        }
        
        // Notify listeners
        this.notifyListeners(true);
        
        // Process pending operations with error handling
        // Prevent concurrent processing with a flag
        if (!this.isProcessing && this.pendingOperations.length > 0) {
            try {
                await this.processPendingOperations();
            } catch (error) {
                logger.error('Failed to process pending operations:', error);
            }
        }
    }

    /**
     * Check if currently online
     * @returns {boolean}
     */
    checkOnline() {
        return navigator.onLine;
    }

    /**
     * Execute operation with offline handling
     * @param {Function} operation - Async operation to execute
     * @param {string} errorMessage - User-friendly error message
     * @param {boolean} queueIfOffline - Whether to queue operation for retry
     * @returns {Promise}
     */
    async executeWithOfflineHandling(operation, errorMessage = 'Esta operación requiere conexión a Internet', queueIfOffline = false) {
        if (!this.checkOnline()) {
            logger.warn('Operation attempted while offline');
            try {
                toast.error(errorMessage, { duration: 4000 });
            } catch (e) {
                logger.debug('Toast not available', e);
            }
            
            if (queueIfOffline) {
                this.queueOperation(operation, errorMessage);
                try {
                    toast.info('La operación se guardará para cuando haya conexión', { duration: 3000 });
                } catch (e) {
                    logger.debug('Toast not available', e);
                }
            }
            
            throw new Error('Offline: ' + errorMessage);
        }

        try {
            return await operation();
        } catch (error) {
            // Check if error is due to network issues
            if (this.isNetworkError(error)) {
                logger.error('Network error during operation:', error);
                try {
                    toast.error('Error de conexión. Verifica tu Internet e intenta de nuevo.', { duration: 5000 });
                } catch (e) {
                    logger.debug('Toast not available', e);
                }
                
                if (queueIfOffline) {
                    this.queueOperation(operation, errorMessage);
                }
            }
            throw error;
        }
    }

    /**
     * Check if error is network-related
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
        return networkErrors.some(term => errorString.includes(term.toLowerCase()));
    }

    /**
     * Queue operation for retry when online
     * @param {Function} operation
     * @param {string} description
     */
    queueOperation(operation, description) {
        this.pendingOperations.push({
            operation,
            description,
            timestamp: Date.now()
        });
        logger.info(`Queued operation: ${description}`);
    }

    /**
     * Process all pending operations
     */
    async processPendingOperations() {
        if (this.pendingOperations.length === 0) return;
        if (this.isProcessing) {
            logger.debug('Already processing pending operations, skipping');
            return;
        }

        this.isProcessing = true;
        logger.info(`Processing ${this.pendingOperations.length} pending operations`);
        
        const operations = [...this.pendingOperations];
        this.pendingOperations = [];

        let successCount = 0;
        let failureCount = 0;

        for (const { operation, description } of operations) {
            try {
                await operation();
                successCount++;
                logger.info(`Completed queued operation: ${description}`);
            } catch (error) {
                failureCount++;
                logger.error(`Failed queued operation: ${description}`, error);
                // Re-queue if still failing
                this.pendingOperations.push({ operation, description, timestamp: Date.now() });
            }
        }

        this.isProcessing = false;

        if (successCount > 0) {
            try {
                toast.success(`${successCount} operación(es) completada(s)`, { duration: 3000 });
            } catch (e) {
                logger.debug('Toast not available', e);
            }
        }
        
        if (failureCount > 0) {
            try {
                toast.warning(`${failureCount} operación(es) fallida(s)`, { duration: 4000 });
            } catch (e) {
                logger.debug('Toast not available', e);
            }
        }
    }

    /**
     * Register a listener for online/offline changes
     * @param {Function} callback - Called with boolean (true = online, false = offline)
     */
    addListener(callback) {
        this.listeners.push(callback);
    }

    /**
     * Remove a listener
     * @param {Function} callback
     */
    removeListener(callback) {
        this.listeners = this.listeners.filter(cb => cb !== callback);
    }

    /**
     * Notify all listeners of state change
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
     * Get pending operations count
     * @returns {number}
     */
    getPendingCount() {
        return this.pendingOperations.length;
    }

    /**
     * Clear all pending operations
     */
    clearPending() {
        this.pendingOperations = [];
        logger.info('Cleared all pending operations');
    }
}

// Singleton instance
export const offlineManager = new OfflineManager();
