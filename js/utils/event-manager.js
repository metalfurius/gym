/**
 * Event Listener Manager
 * Tracks and cleans up event listeners to prevent memory leaks
 */

import { logger } from './logger.js';

class EventManager {
    constructor() {
        this.listeners = new Map(); // viewName -> Array of { element, event, handler, options }
    }

    /**
     * Add a tracked event listener
     * @param {string} viewName - Name of the view (e.g., 'session', 'history', 'dashboard')
     * @param {HTMLElement} element - DOM element to attach listener to
     * @param {string} event - Event type (e.g., 'click', 'input')
     * @param {Function} handler - Event handler function
     * @param {Object} options - Event listener options
     */
    add(viewName, element, event, handler, options = {}) {
        if (!element) {
            logger.warn(`EventManager: Cannot add listener to null element for view ${viewName}`);
            return;
        }

        if (!this.listeners.has(viewName)) {
            this.listeners.set(viewName, []);
        }

        element.addEventListener(event, handler, options);
        this.listeners.get(viewName).push({ element, event, handler, options });
        
        logger.debug(`EventManager: Added ${event} listener for view ${viewName}`);
    }

    /**
     * Remove all event listeners for a specific view
     * @param {string} viewName - Name of the view to clean up
     */
    cleanup(viewName) {
        const viewListeners = this.listeners.get(viewName);
        if (!viewListeners || viewListeners.length === 0) {
            return;
        }

        let removedCount = 0;
        for (const { element, event, handler, options } of viewListeners) {
            try {
                element.removeEventListener(event, handler, options);
                removedCount++;
            } catch (error) {
                logger.warn(`EventManager: Failed to remove ${event} listener:`, error);
            }
        }

        this.listeners.delete(viewName);
        logger.debug(`EventManager: Cleaned up ${removedCount} listeners for view ${viewName}`);
    }

    /**
     * Remove all tracked event listeners
     */
    cleanupAll() {
        const viewNames = Array.from(this.listeners.keys());
        for (const viewName of viewNames) {
            this.cleanup(viewName);
        }
        logger.info('EventManager: Cleaned up all event listeners');
    }

    /**
     * Get count of active listeners for debugging
     * @param {string} viewName - Optional view name to get count for
     * @returns {number} Number of active listeners
     */
    getListenerCount(viewName = null) {
        if (viewName) {
            return this.listeners.get(viewName)?.length || 0;
        }
        
        let total = 0;
        for (const listeners of this.listeners.values()) {
            total += listeners.length;
        }
        return total;
    }
}

// Singleton instance
export const eventManager = new EventManager();

/**
 * Helper function to add tracked event listener
 * @param {string} viewName - Name of the view
 * @param {HTMLElement} element - DOM element
 * @param {string} event - Event type
 * @param {Function} handler - Event handler
 * @param {Object} options - Event listener options
 */
export function addViewListener(viewName, element, event, handler, options) {
    eventManager.add(viewName, element, event, handler, options);
}

/**
 * Helper function to cleanup view listeners
 * @param {string} viewName - Name of the view to clean up
 */
export function cleanupViewListeners(viewName) {
    eventManager.cleanup(viewName);
}
