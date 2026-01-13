/**
 * Configurable logging system with log levels
 * Disables debug/info logs in production for cleaner console output
 */

const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

// Determine log level based on environment
// In production (not localhost), only show warnings and errors
function getCurrentLogLevel() {
    const isLocalhost = window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1';
    return isLocalhost ? LOG_LEVELS.DEBUG : LOG_LEVELS.WARN;
}

const currentLevel = getCurrentLogLevel();

/**
 * Logger object with configurable log levels
 * Usage:
 *   import { logger } from './utils/logger.js';
 *   logger.debug('Debug message', data);
 *   logger.info('Info message');
 *   logger.warn('Warning message');
 *   logger.error('Error message', error);
 */
export const logger = {
    /**
     * Debug level logging - only shown in development
     * Use for detailed debugging information
     */
    debug: (...args) => {
        if (currentLevel <= LOG_LEVELS.DEBUG) {
            console.log('[DEBUG]', ...args);
        }
    },

    /**
     * Info level logging - only shown in development
     * Use for general information about app state/flow
     */
    info: (...args) => {
        if (currentLevel <= LOG_LEVELS.INFO) {
            console.log('[INFO]', ...args);
        }
    },

    /**
     * Warning level logging - always shown
     * Use for non-critical issues that should be addressed
     */
    warn: (...args) => {
        if (currentLevel <= LOG_LEVELS.WARN) {
            console.warn('[WARN]', ...args);
        }
    },

    /**
     * Error level logging - always shown
     * Use for errors and exceptions
     */
    error: (...args) => {
        console.error('[ERROR]', ...args);
    },

    /**
     * Get current log level name (for debugging the logger itself)
     */
    getLevel: () => {
        const levelNames = Object.keys(LOG_LEVELS);
        return levelNames.find(name => LOG_LEVELS[name] === currentLevel) || 'UNKNOWN';
    }
};

export default logger;
