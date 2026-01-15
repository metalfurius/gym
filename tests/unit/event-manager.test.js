/**
 * Tests for Event Manager
 * Tests event listener tracking and cleanup functionality
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { eventManager, addViewListener, cleanupViewListeners } from '../../js/utils/event-manager.js';

describe('EventManager', () => {
    let mockElement;
    let mockHandler;

    beforeEach(() => {
        // Create a mock DOM element
        mockElement = {
            addEventListener: jest.fn(),
            removeEventListener: jest.fn()
        };

        // Create a mock handler
        mockHandler = jest.fn();

        // Clear any existing listeners
        eventManager.cleanupAll();
    });

    afterEach(() => {
        eventManager.cleanupAll();
    });

    describe('add()', () => {
        it('should add event listener to element', () => {
            eventManager.add('test-view', mockElement, 'click', mockHandler);

            expect(mockElement.addEventListener).toHaveBeenCalledWith('click', mockHandler, {});
        });

        it('should track listener for the view', () => {
            eventManager.add('test-view', mockElement, 'click', mockHandler);

            expect(eventManager.getListenerCount('test-view')).toBe(1);
        });

        it('should handle multiple listeners for same view', () => {
            const handler2 = jest.fn();

            eventManager.add('test-view', mockElement, 'click', mockHandler);
            eventManager.add('test-view', mockElement, 'input', handler2);

            expect(eventManager.getListenerCount('test-view')).toBe(2);
        });

        it('should handle listeners for different views', () => {
            eventManager.add('view1', mockElement, 'click', mockHandler);
            eventManager.add('view2', mockElement, 'click', mockHandler);

            expect(eventManager.getListenerCount('view1')).toBe(1);
            expect(eventManager.getListenerCount('view2')).toBe(1);
            expect(eventManager.getListenerCount()).toBe(2);
        });

        it('should pass options to addEventListener', () => {
            const options = { passive: true, capture: true };

            eventManager.add('test-view', mockElement, 'scroll', mockHandler, options);

            expect(mockElement.addEventListener).toHaveBeenCalledWith('scroll', mockHandler, options);
        });

        it('should handle null element gracefully', () => {
            expect(() => {
                eventManager.add('test-view', null, 'click', mockHandler);
            }).not.toThrow();

            expect(eventManager.getListenerCount('test-view')).toBe(0);
        });
    });

    describe('cleanup()', () => {
        it('should remove all listeners for a view', () => {
            eventManager.add('test-view', mockElement, 'click', mockHandler);
            eventManager.add('test-view', mockElement, 'input', mockHandler);

            eventManager.cleanup('test-view');

            expect(mockElement.removeEventListener).toHaveBeenCalledTimes(2);
            expect(eventManager.getListenerCount('test-view')).toBe(0);
        });

        it('should only remove listeners for specified view', () => {
            eventManager.add('view1', mockElement, 'click', mockHandler);
            eventManager.add('view2', mockElement, 'click', mockHandler);

            eventManager.cleanup('view1');

            expect(eventManager.getListenerCount('view1')).toBe(0);
            expect(eventManager.getListenerCount('view2')).toBe(1);
        });

        it('should handle cleanup of non-existent view', () => {
            expect(() => {
                eventManager.cleanup('non-existent-view');
            }).not.toThrow();
        });

        it('should pass correct options to removeEventListener', () => {
            const options = { passive: true };

            eventManager.add('test-view', mockElement, 'scroll', mockHandler, options);
            eventManager.cleanup('test-view');

            expect(mockElement.removeEventListener).toHaveBeenCalledWith('scroll', mockHandler, options);
        });
    });

    describe('cleanupAll()', () => {
        it('should remove all listeners from all views', () => {
            const element2 = {
                addEventListener: jest.fn(),
                removeEventListener: jest.fn()
            };

            eventManager.add('view1', mockElement, 'click', mockHandler);
            eventManager.add('view2', element2, 'click', mockHandler);

            eventManager.cleanupAll();

            expect(mockElement.removeEventListener).toHaveBeenCalled();
            expect(element2.removeEventListener).toHaveBeenCalled();
            expect(eventManager.getListenerCount()).toBe(0);
        });

        it('should handle cleanup when no listeners exist', () => {
            expect(() => {
                eventManager.cleanupAll();
            }).not.toThrow();
        });
    });

    describe('getListenerCount()', () => {
        it('should return 0 for view with no listeners', () => {
            expect(eventManager.getListenerCount('empty-view')).toBe(0);
        });

        it('should return correct count for view with listeners', () => {
            eventManager.add('test-view', mockElement, 'click', mockHandler);
            eventManager.add('test-view', mockElement, 'input', mockHandler);

            expect(eventManager.getListenerCount('test-view')).toBe(2);
        });

        it('should return total count when no view specified', () => {
            eventManager.add('view1', mockElement, 'click', mockHandler);
            eventManager.add('view2', mockElement, 'click', mockHandler);
            eventManager.add('view2', mockElement, 'input', mockHandler);

            expect(eventManager.getListenerCount()).toBe(3);
        });

        it('should update count after cleanup', () => {
            eventManager.add('test-view', mockElement, 'click', mockHandler);
            expect(eventManager.getListenerCount('test-view')).toBe(1);

            eventManager.cleanup('test-view');
            expect(eventManager.getListenerCount('test-view')).toBe(0);
        });
    });

    describe('Helper functions', () => {
        describe('addViewListener()', () => {
            it('should add listener using eventManager', () => {
                addViewListener('test-view', mockElement, 'click', mockHandler);

                expect(mockElement.addEventListener).toHaveBeenCalledWith('click', mockHandler, expect.any(Object));
                expect(eventManager.getListenerCount('test-view')).toBe(1);
            });

            it('should pass options correctly', () => {
                const options = { once: true };
                addViewListener('test-view', mockElement, 'click', mockHandler, options);

                expect(mockElement.addEventListener).toHaveBeenCalledWith('click', mockHandler, options);
            });
        });

        describe('cleanupViewListeners()', () => {
            it('should cleanup listeners using eventManager', () => {
                addViewListener('test-view', mockElement, 'click', mockHandler);

                cleanupViewListeners('test-view');

                expect(mockElement.removeEventListener).toHaveBeenCalled();
                expect(eventManager.getListenerCount('test-view')).toBe(0);
            });
        });
    });

    describe('Real-world usage patterns', () => {
        it('should handle view navigation cleanup pattern', () => {
            // Simulate adding listeners when entering a view
            const button1 = { addEventListener: jest.fn(), removeEventListener: jest.fn() };
            const button2 = { addEventListener: jest.fn(), removeEventListener: jest.fn() };
            const input = { addEventListener: jest.fn(), removeEventListener: jest.fn() };

            addViewListener('session', button1, 'click', mockHandler);
            addViewListener('session', button2, 'click', mockHandler);
            addViewListener('session', input, 'input', mockHandler);

            expect(eventManager.getListenerCount('session')).toBe(3);

            // Simulate leaving the view
            cleanupViewListeners('session');

            expect(button1.removeEventListener).toHaveBeenCalled();
            expect(button2.removeEventListener).toHaveBeenCalled();
            expect(input.removeEventListener).toHaveBeenCalled();
            expect(eventManager.getListenerCount('session')).toBe(0);
        });

        it('should handle multiple view transitions', () => {
            // View 1
            addViewListener('dashboard', mockElement, 'click', mockHandler);
            expect(eventManager.getListenerCount('dashboard')).toBe(1);

            // Navigate to View 2
            cleanupViewListeners('dashboard');
            addViewListener('session', mockElement, 'click', mockHandler);
            expect(eventManager.getListenerCount('dashboard')).toBe(0);
            expect(eventManager.getListenerCount('session')).toBe(1);

            // Navigate to View 3
            cleanupViewListeners('session');
            addViewListener('history', mockElement, 'click', mockHandler);
            expect(eventManager.getListenerCount('session')).toBe(0);
            expect(eventManager.getListenerCount('history')).toBe(1);
        });
    });
});
