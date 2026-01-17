// Storage manager for handling persistent storage in a modern way
// This replaces the deprecated StorageType.persistent API

import { logger } from './utils/logger.js';

export class StorageManager {
    constructor() {
        this.isSupported = 'storage' in navigator && 'estimate' in navigator.storage;
    }

    /**
     * Request persistent storage using the modern API
     * @returns {Promise<boolean>} Whether persistent storage was granted
     */
    async requestPersistentStorage() {
        if (!this.isSupported) {
            logger.warn('Storage API not supported in this browser');
            return false;
        }

        try {
            // Check if we already have persistent storage
            const isPersistent = await navigator.storage.persisted();
            if (isPersistent) {
                logger.info('Storage is already persistent');
                return true;
            }

            // Request persistent storage
            const granted = await navigator.storage.persist();
            if (granted) {
                logger.info('Persistent storage granted');
            } else {
                logger.warn('Persistent storage denied');
            }
            return granted;
        } catch (error) {
            logger.error('Error requesting persistent storage:', error);
            return false;
        }
    }

    /**
     * Get storage quota and usage information
     * @returns {Promise<Object|null>} Storage estimate or null if not supported
     */
    async getStorageEstimate() {
        if (!this.isSupported) {
            return null;
        }

        try {
            const estimate = await navigator.storage.estimate();
            return {
                quota: estimate.quota,
                usage: estimate.usage,
                usagePercentage: estimate.quota ? (estimate.usage / estimate.quota * 100).toFixed(2) : 0
            };
        } catch (error) {
            logger.error('Error getting storage estimate:', error);
            return null;
        }
    }

    /**
     * Check if storage is persistent
     * @returns {Promise<boolean>} Whether storage is persistent
     */
    async isPersistent() {
        if (!this.isSupported) {
            return false;
        }

        try {
            return await navigator.storage.persisted();
        } catch (error) {
            logger.error('Error checking storage persistence:', error);
            return false;
        }
    }

    /**
     * Initialize storage management for the app
     * This should be called early in the app lifecycle
     */
    async initialize() {
        if (!this.isSupported) {
            logger.warn('Modern Storage API not supported. Some features may not work optimally.');
            return;
        }

        // Check current storage status
        const isPersistent = await this.isPersistent();
        const estimate = await this.getStorageEstimate();

        logger.info('Storage status:', {
            isPersistent,
            estimate
        });

        // Only request persistent storage if not already granted
        // and if the app seems to be used regularly (you can add more conditions)
        if (!isPersistent) {
            // You might want to show a user-friendly prompt here
            // For now, we'll just request it automatically
            await this.requestPersistentStorage();
        }
    }
}

// Create a singleton instance
export const storageManager = new StorageManager();
