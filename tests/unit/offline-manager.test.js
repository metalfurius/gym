/**
 * Tests for Offline Manager
 * Tests offline detection and operation queueing
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { offlineManager } from '../../js/utils/offline-manager.js';
import { localFirstCache } from '../../js/utils/local-first-cache.js';
import { setLanguage } from '../../js/i18n.js';

describe('OfflineManager', () => {
    let originalOnLine;
    let originalAddEventListener;

    beforeEach(async () => {
        // Save original navigator.onLine
        originalOnLine = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');

        // Mock navigator.onLine
        Object.defineProperty(Navigator.prototype, 'onLine', {
            configurable: true,
            get: () => true
        });

        // Save and mock window event listeners
        originalAddEventListener = window.addEventListener;
        window.addEventListener = jest.fn((event, _callback) => {
            if (event === 'online') return;
            if (event === 'offline') return;
        });

        // Reset manager state
        offlineManager.isOnline = true;
        offlineManager.initialized = false;
        offlineManager.clearPending();
        setLanguage('es', { persist: false, apply: false });
        await localFirstCache.clearAll();
    });

    afterEach(async () => {
        // Restore original navigator.onLine
        if (originalOnLine) {
            Object.defineProperty(Navigator.prototype, 'onLine', originalOnLine);
        }
        
        // Restore original window.addEventListener
        if (originalAddEventListener) {
            window.addEventListener = originalAddEventListener;
        }
        
        offlineManager.clearPending();
        await localFirstCache.clearAll();
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

        it('should process restored persisted queue on init when online', async () => {
            const replayHandler = jest.fn(async () => 'replayed');
            offlineManager.registerOperationHandler('init.replay', replayHandler);

            await localFirstCache.set('offline:pending-operations:v1', [
                {
                    id: 'persisted-1',
                    description: 'Init replay',
                    timestamp: Date.now(),
                    descriptor: {
                        type: 'init.replay',
                        payload: { source: 'init' }
                    }
                }
            ]);

            offlineManager.init();

            await new Promise((resolve) => setTimeout(resolve, 20));

            expect(replayHandler).toHaveBeenCalledWith({ source: 'init' });
            expect(offlineManager.getPendingCount()).toBe(0);

            offlineManager.removeOperationHandler('init.replay');
        });
    });

    describe('destroy()', () => {
        it('should remove event listeners and clean up state', () => {
            // Mock removeEventListener
            const originalRemoveEventListener = window.removeEventListener;
            window.removeEventListener = jest.fn();

            offlineManager.init();
            const onlineHandler = offlineManager.onlineHandler;
            const offlineHandler = offlineManager.offlineHandler;

            offlineManager.destroy();

            expect(window.removeEventListener).toHaveBeenCalledWith('online', onlineHandler);
            expect(window.removeEventListener).toHaveBeenCalledWith('offline', offlineHandler);
            expect(offlineManager.initialized).toBe(false);
            expect(offlineManager.onlineHandler).toBe(null);
            expect(offlineManager.offlineHandler).toBe(null);

            // Restore
            window.removeEventListener = originalRemoveEventListener;
        });

        it('should not throw when called without initialization', () => {
            expect(() => {
                offlineManager.destroy();
            }).not.toThrow();
        });

        it('should clear pending operations', () => {
            offlineManager.init();
            offlineManager.queueOperation(jest.fn(), 'Test operation');
            expect(offlineManager.getPendingCount()).toBe(1);

            offlineManager.destroy();

            expect(offlineManager.getPendingCount()).toBe(0);
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

            await expect(
                offlineManager.executeWithOfflineHandling(mockOperation, 'Custom error')
            ).rejects.toThrow('Offline');

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

        it('should resolve the default offline message using the current language at call time', async () => {
            Object.defineProperty(Navigator.prototype, 'onLine', {
                configurable: true,
                get: () => false
            });

            setLanguage('en', { persist: false, apply: false });
            await expect(
                offlineManager.executeWithOfflineHandling(async () => 'success')
            ).rejects.toThrow('Offline: This operation requires an Internet connection');

            setLanguage('es', { persist: false, apply: false });
            await expect(
                offlineManager.executeWithOfflineHandling(async () => 'success')
            ).rejects.toThrow('Offline: Esta operación requiere conexión a Internet');
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

        it('should persist descriptor-based queued operations and replay after restore', async () => {
            Object.defineProperty(Navigator.prototype, 'onLine', {
                configurable: true,
                get: () => false
            });

            const replayHandler = jest.fn(async () => 'replayed');
            offlineManager.registerOperationHandler('test.persist', replayHandler);

            await expect(
                offlineManager.executeWithOfflineHandling(
                    jest.fn(async () => 'ok'),
                    'Persist this operation',
                    true,
                    {
                        type: 'test.persist',
                        payload: { id: 123 }
                    }
                )
            ).rejects.toThrow('Offline');

            expect(offlineManager.getPendingCount()).toBe(1);
            expect(offlineManager.pendingOperations[0]?.operation).toBeNull();

            // Simulate app reload by clearing in-memory queue, then restoring persisted queue.
            offlineManager.pendingOperations = [];
            await offlineManager.restorePersistedQueue();
            expect(offlineManager.getPendingCount()).toBe(1);

            Object.defineProperty(Navigator.prototype, 'onLine', {
                configurable: true,
                get: () => true
            });

            await offlineManager.processPendingOperations();
            expect(replayHandler).toHaveBeenCalledWith({ id: 123 });
            expect(offlineManager.getPendingCount()).toBe(0);

            offlineManager.removeOperationHandler('test.persist');
        });

        it('should prefer descriptor handlers over inline operation closures when both are present', async () => {
            const inlineOperation = jest.fn(async () => 'inline');
            const replayHandler = jest.fn(async () => 'handler');

            offlineManager.registerOperationHandler('test.prefer.handler', replayHandler);
            offlineManager.queueOperation(inlineOperation, 'Prefer handler', {
                descriptor: {
                    type: 'test.prefer.handler',
                    payload: { value: 1 }
                }
            });

            await offlineManager.processPendingOperations();

            expect(replayHandler).toHaveBeenCalledWith({ value: 1 });
            expect(inlineOperation).not.toHaveBeenCalled();
            expect(offlineManager.getPendingCount()).toBe(0);

            offlineManager.removeOperationHandler('test.prefer.handler');
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
            // After processing, expect 0 pending operations for successful scenario
            expect(offlineManager.getPendingCount()).toBe(0);
        });

        it('should handle rapid state changes', async () => {
            const listener = jest.fn();
            offlineManager.addListener(listener);

            offlineManager.handleOffline();
            await offlineManager.handleOnline();
            offlineManager.handleOffline();
            await offlineManager.handleOnline();

            expect(listener).toHaveBeenCalledTimes(4);
        });
    });
});
