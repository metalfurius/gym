import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

/**
 * Tests for logger utility module
 * Logger provides configurable logging with levels that suppress debug/info in production
 */
describe('Logger', () => {
    let defaultLogger;
    let createLogger;
    let consoleSpy;

    beforeEach(async () => {
        // Clear module cache to ensure clean logger instances
        jest.resetModules();

        const module = await import('../../js/utils/logger.js');
        defaultLogger = module.logger;
        createLogger = module.createLogger;

        // Mock console methods
        consoleSpy = {
            log: jest.spyOn(console, 'log').mockImplementation(() => {}),
            warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
            error: jest.spyOn(console, 'error').mockImplementation(() => {})
        };
    });

    afterEach(() => {
        // Restore console methods
        consoleSpy.log.mockRestore();
        consoleSpy.warn.mockRestore();
        consoleSpy.error.mockRestore();
    });

    describe('in development (localhost)', () => {
        it('should log debug messages in development', () => {
            defaultLogger.debug('Debug message', { data: 'test' });
            expect(consoleSpy.log).toHaveBeenCalledWith('[DEBUG]', 'Debug message', { data: 'test' });
        });

        it('should log info messages in development', () => {
            defaultLogger.info('Info message');
            expect(consoleSpy.log).toHaveBeenCalledWith('[INFO]', 'Info message');
        });

        it('should log warn messages in development', () => {
            defaultLogger.warn('Warning message');
            expect(consoleSpy.warn).toHaveBeenCalledWith('[WARN]', 'Warning message');
        });

        it('should log error messages in development', () => {
            defaultLogger.error('Error message', new Error('test'));
            expect(consoleSpy.error).toHaveBeenCalled();
            expect(consoleSpy.error.mock.calls[0][0]).toBe('[ERROR]');
            expect(consoleSpy.error.mock.calls[0][1]).toBe('Error message');
        });

        it('should return DEBUG level in development', () => {
            const level = defaultLogger.getLevel();
            expect(level).toBe('DEBUG');
        });
    });

    describe('in production (not localhost)', () => {
        it('should NOT log debug messages in production', () => {
            const logger = createLogger({ hostnameResolver: () => 'app.example.com' });
            logger.debug('Debug message');
            expect(consoleSpy.log).not.toHaveBeenCalled();
        });

        it('should NOT log info messages in production', () => {
            const logger = createLogger({ hostnameResolver: () => 'app.example.com' });
            logger.info('Info message');
            expect(consoleSpy.log).not.toHaveBeenCalled();
        });

        it('should log warn messages in production', () => {
            const logger = createLogger({ hostnameResolver: () => 'app.example.com' });
            logger.warn('Warning message');
            expect(consoleSpy.warn).toHaveBeenCalledWith('[WARN]', 'Warning message');
        });

        it('should log error messages in production', () => {
            const logger = createLogger({ hostnameResolver: () => 'app.example.com' });
            logger.error('Error message');
            expect(consoleSpy.error).toHaveBeenCalledWith('[ERROR]', 'Error message');
        });

        it('should return WARN level in production', () => {
            const logger = createLogger({ hostnameResolver: () => 'app.example.com' });
            const level = logger.getLevel();
            expect(level).toBe('WARN');
        });
    });

    describe('with 127.0.0.1 hostname', () => {
        it('should log debug messages on 127.0.0.1', () => {
            const logger = createLogger({ hostnameResolver: () => '127.0.0.1' });
            logger.debug('Debug message');
            expect(consoleSpy.log).toHaveBeenCalledWith('[DEBUG]', 'Debug message');
        });

        it('should return DEBUG level on 127.0.0.1', () => {
            const logger = createLogger({ hostnameResolver: () => '127.0.0.1' });
            const level = logger.getLevel();
            expect(level).toBe('DEBUG');
        });
    });
});
