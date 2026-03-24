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

function resolveHostname() {
    if (typeof window === 'undefined' || !window.location) {
        return '';
    }
    return window.location.hostname || '';
}

// Determine log level based on environment
// In production (not localhost), only show warnings and errors
function getCurrentLogLevel(hostname = resolveHostname()) {
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    return isLocalhost ? LOG_LEVELS.DEBUG : LOG_LEVELS.WARN;
}

function getLevelName(level) {
    const levelNames = Object.keys(LOG_LEVELS);
    return levelNames.find((name) => LOG_LEVELS[name] === level) || 'UNKNOWN';
}

/**
 * Creates a logger instance.
 * Useful for tests where hostname can be controlled deterministically.
 * @param {Object} options - Logger options
 * @param {Function} options.hostnameResolver - Function that returns current hostname
 * @returns {Object} Logger instance
 */
export function createLogger(options = {}) {
    const hostnameResolver = typeof options.hostnameResolver === 'function'
        ? options.hostnameResolver
        : resolveHostname;

    const getLevel = () => getCurrentLogLevel(hostnameResolver());

    return {
        /**
         * Debug level logging - only shown in development
         * Use for detailed debugging information
         */
        debug: (...args) => {
            if (getLevel() <= LOG_LEVELS.DEBUG) {
                console.log('[DEBUG]', ...args);
            }
        },

        /**
         * Info level logging - only shown in development
         * Use for general information about app state/flow
         */
        info: (...args) => {
            if (getLevel() <= LOG_LEVELS.INFO) {
                console.log('[INFO]', ...args);
            }
        },

        /**
         * Warning level logging - always shown
         * Use for non-critical issues that should be addressed
         */
        warn: (...args) => {
            if (getLevel() <= LOG_LEVELS.WARN) {
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
        getLevel: () => getLevelName(getLevel())
    };
}

/**
 * Logger object with configurable log levels
 * Usage:
 *   import { logger } from './utils/logger.js';
 *   logger.debug('Debug message', data);
 *   logger.info('Info message');
 *   logger.warn('Warning message');
 *   logger.error('Error message', error);
 */
export const logger = createLogger();

export default logger;
