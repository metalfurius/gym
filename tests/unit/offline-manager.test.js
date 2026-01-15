/**
 * Tests for Offline Manager
 * Tests offline detection and operation queueing
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { offlineManager } from '../../js/utils/offline-manager.js';

describe('OfflineManager', () => {
    let originalOnLine;
    let onlineCallback;
    let offlineCallback;

    beforeEach(() => {
        // Save original navigator.onLine
        originalOnLine = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');

        // Mock navigator.onLine
        Object.defineProperty(Navigator.prototype, 'onLine', {
            configurable: true,
            get: () => true
        });

        // Mock window event listeners
        onlineCallback = null;
        offlineCallback = null;
        window.addEventListener = jest.fn((event, callback) => {
            if (event === 'online') onlineCallback = callback;
            if (event === 'offline') offlineCallback = callback;
        });

        // Reset manager state
        offlineManager.isOnline = true;
        offlineManager.initialized = false;
        offlineManager.clearPending();
    });

    afterEach(() => {
        // Restore original navigator.onLine
        if (originalOnLine) {
            Object.defineProperty(Navigator.prototype, 'onLine', originalOnLine);
        }
        offlineManager.clearPending();
    });

    describe('init()', () => {
        it('should initialize and set up event listeners', () => {
            offlineManager.init();

            expect(window.addEventListener).toHaveBeenCalledWith('online', expect.any(Function));
            expect(window.addEventListener).toHaveBeenCalledWith('offline', expect.any(Function));
            expect(offlineManager.initialized).toBe(true);
        });

        it('should not initialize twice', () => {
            offlineManager.init();
            const firstInit = offlineManager.initialized;

            offlineManager.init();

            expect(offlineManager.initialized).toBe(firstInit);
        });
    });

    describe('checkOnline()', () => {
        it('should return true when online', () => {
            Object.defineProperty(Navigator.prototype, 'onLine', {
                configurable: true,
                get: () => true
            });

            expect(offlineManager.checkOnline()).toBe(true);
        });

        it('should return false when offline', () => {
            Object.defineProperty(Navigator.prototype, 'onLine', {
                configurable: true,
                get: () => false
            });

            expect(offlineManager.checkOnline()).toBe(false);
        });
    });

    describe('executeWithOfflineHandling()', () => {
        it('should execute operation when online', async () => {
            const mockOperation = jest.fn(async () => 'success');

            const result = await offlineManager.executeWithOfflineHandling(mockOperation);

            expect(mockOperation).toHaveBeenCalled();
            expect(result).toBe('success');
        });

        it('should throw error when offline', async () => {
            Object.defineProperty(Navigator.prototype, 'onLine', {
                configurable: true,
                get: () => false
            });

            const mockOperation = jest.fn(async () => 'success');

            try {
                await offlineManager.executeWithOfflineHandling(mockOperation, 'Custom error');
                expect(true).toBe(false); // Should not reach here
            } catch (error) {
                // Expected to throw
                expect(error.message).toContain('Offline');
            }

            expect(mockOperation).not.toHaveBeenCalled();
        });

        it('should queue operation when offline and queueIfOffline is true', async () => {
            Object.defineProperty(Navigator.prototype, 'onLine', {
                configurable: true,
                get: () => false
            });

            const mockOperation = jest.fn(async () => 'success');

            try {
                await offlineManager.executeWithOfflineHandling(
                    mockOperation,
                    'Operation failed',
                    true
                );
            } catch (error) {
                // Expected to throw
            }

            expect(offlineManager.getPendingCount()).toBe(1);
        });

        it('should not queue operation when queueIfOffline is false', async () => {
            Object.defineProperty(Navigator.prototype, 'onLine', {
                configurable: true,
                get: () => false
            });

            const mockOperation = jest.fn(async () => 'success');

            try {
                await offlineManager.executeWithOfflineHandling(
                    mockOperation,
                    'Operation failed',
                    false
                );
            } catch (error) {
                // Expected to throw
            }

            expect(offlineManager.getPendingCount()).toBe(0);
        });
    });

    describe('isNetworkError()', () => {
        it('should detect network errors', () => {
            const networkErrors = [
                new Error('Network request failed'),
                new Error('Failed to fetch'),
                new Error('NetworkError occurred'),
                new Error('Connection timeout'),
                new Error('Service unavailable')
            ];

            for (const error of networkErrors) {
                expect(offlineManager.isNetworkError(error)).toBe(true);
            }
        });

        it('should not detect non-network errors', () => {
            const nonNetworkErrors = [
                new Error('Invalid input'),
                new Error('Permission denied'),
                new Error('File not found')
            ];

            for (const error of nonNetworkErrors) {
                expect(offlineManager.isNetworkError(error)).toBe(false);
            }
        });

        it('should handle null/undefined errors', () => {
            expect(offlineManager.isNetworkError(null)).toBe(false);
            expect(offlineManager.isNetworkError(undefined)).toBe(false);
        });
    });

    describe('queueOperation()', () => {
        it('should add operation to queue', () => {
            const mockOperation = jest.fn();

            offlineManager.queueOperation(mockOperation, 'Test operation');

            expect(offlineManager.getPendingCount()).toBe(1);
        });

        it('should queue multiple operations', () => {
            const op1 = jest.fn();
            const op2 = jest.fn();
            const op3 = jest.fn();

            offlineManager.queueOperation(op1, 'Operation 1');
            offlineManager.queueOperation(op2, 'Operation 2');
            offlineManager.queueOperation(op3, 'Operation 3');

            expect(offlineManager.getPendingCount()).toBe(3);
        });
    });

    describe('processPendingOperations()', () => {
        it('should process all pending operations', async () => {
            const op1 = jest.fn(async () => 'result1');
            const op2 = jest.fn(async () => 'result2');

            offlineManager.queueOperation(op1, 'Op 1');
            offlineManager.queueOperation(op2, 'Op 2');

            await offlineManager.processPendingOperations();

            expect(op1).toHaveBeenCalled();
            expect(op2).toHaveBeenCalled();
            expect(offlineManager.getPendingCount()).toBe(0);
        });

        it('should handle failed operations', async () => {
            const successOp = jest.fn(async () => 'success');
            const failOp = jest.fn(async () => {
                throw new Error('Operation failed');
            });

            offlineManager.queueOperation(successOp, 'Success op');
            offlineManager.queueOperation(failOp, 'Fail op');

            await offlineManager.processPendingOperations();

            expect(successOp).toHaveBeenCalled();
            expect(failOp).toHaveBeenCalled();
            // Failed operation should be re-queued
            expect(offlineManager.getPendingCount()).toBe(1);
        });

        it('should do nothing when no pending operations', async () => {
            offlineManager.clearPending();
            
            await expect(
                offlineManager.processPendingOperations()
            ).resolves.not.toThrow();

            expect(offlineManager.getPendingCount()).toBe(0);
        });
    });

    describe('Listener management', () => {
        it('should add listener', () => {
            const callback = jest.fn();

            offlineManager.addListener(callback);

            // Trigger a state change
            offlineManager.notifyListeners(false);

            expect(callback).toHaveBeenCalledWith(false);
        });

        it('should remove listener', () => {
            const callback = jest.fn();

            offlineManager.addListener(callback);
            offlineManager.removeListener(callback);

            offlineManager.notifyListeners(true);

            expect(callback).not.toHaveBeenCalled();
        });

        it('should notify multiple listeners', () => {
            const callback1 = jest.fn();
            const callback2 = jest.fn();

            offlineManager.addListener(callback1);
            offlineManager.addListener(callback2);

            offlineManager.notifyListeners(true);

            expect(callback1).toHaveBeenCalledWith(true);
            expect(callback2).toHaveBeenCalledWith(true);
        });

        it('should handle listener errors gracefully', () => {
            const badCallback = jest.fn(() => {
                throw new Error('Listener error');
            });
            const goodCallback = jest.fn();

            offlineManager.addListener(badCallback);
            offlineManager.addListener(goodCallback);

            expect(() => {
                offlineManager.notifyListeners(true);
            }).not.toThrow();

            expect(goodCallback).toHaveBeenCalled();
        });
    });

    describe('clearPending()', () => {
        it('should clear all pending operations', () => {
            offlineManager.queueOperation(jest.fn(), 'Op 1');
            offlineManager.queueOperation(jest.fn(), 'Op 2');

            expect(offlineManager.getPendingCount()).toBe(2);

            offlineManager.clearPending();

            expect(offlineManager.getPendingCount()).toBe(0);
        });
    });

    describe('Integration scenarios', () => {
        it('should handle offline to online transition', async () => {
            const listener = jest.fn();
            offlineManager.addListener(listener);

            // Simulate going offline
            offlineManager.isOnline = false;
            offlineManager.handleOffline();

            expect(listener).toHaveBeenCalledWith(false);

            // Queue an operation
            const mockOp = jest.fn(async () => 'success');
            offlineManager.queueOperation(mockOp, 'Test op');
            expect(offlineManager.getPendingCount()).toBe(1);

            // Simulate coming back online
            offlineManager.isOnline = true;
            await offlineManager.handleOnline();

            expect(listener).toHaveBeenCalledWith(true);
            expect(mockOp).toHaveBeenCalled();
            // After processing, expect 0 pending (or 1 if had error)
            expect(offlineManager.getPendingCount()).toBeLessThanOrEqual(1);
        });

        it('should handle rapid state changes', () => {
            const listener = jest.fn();
            offlineManager.addListener(listener);

            offlineManager.handleOffline();
            offlineManager.handleOnline();
            offlineManager.handleOffline();
            offlineManager.handleOnline();

            expect(listener).toHaveBeenCalledTimes(4);
        });
    });
});
