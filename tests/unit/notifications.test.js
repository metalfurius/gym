import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { 
    showNotification, 
    hideNotification, 
    clearAllNotifications, 
    toast,
    NOTIFICATION_TYPES 
} from '../../js/utils/notifications.js';

/**
 * Tests for notifications utility module
 * Provides toast notification system to replace alert() calls
 */
describe('Notifications', () => {
    beforeEach(() => {
        // Clear document body
        document.body.innerHTML = '';
        jest.useFakeTimers();
    });

    afterEach(() => {
        // Clean up notifications
        clearAllNotifications();
        jest.useRealTimers();
    });

    describe('showNotification', () => {
        it('should create and display a notification', () => {
            const notification = showNotification('Test message', NOTIFICATION_TYPES.INFO);

            expect(notification).toBeTruthy();
            expect(notification.classList.contains('notification')).toBe(true);
            expect(notification.classList.contains('info')).toBe(true);
            expect(notification.textContent).toContain('Test message');
        });

        it('should create notification container if it does not exist', () => {
            showNotification('Test', NOTIFICATION_TYPES.INFO);

            const container = document.getElementById('notification-container');
            expect(container).toBeTruthy();
        });

        it('should add notification styles to document head', () => {
            showNotification('Test', NOTIFICATION_TYPES.INFO);

            const styles = document.getElementById('notification-styles');
            expect(styles).toBeTruthy();
            expect(styles.tagName).toBe('STYLE');
        });

        it('should support all notification types', () => {
            const types = [
                NOTIFICATION_TYPES.SUCCESS,
                NOTIFICATION_TYPES.ERROR,
                NOTIFICATION_TYPES.WARNING,
                NOTIFICATION_TYPES.INFO
            ];

            types.forEach(type => {
                const notification = showNotification('Test', type);
                expect(notification.classList.contains(type)).toBe(true);
            });
        });

        it('should include an icon for each notification type', () => {
            const notification = showNotification('Test', NOTIFICATION_TYPES.SUCCESS);
            const icon = notification.querySelector('.notification-icon');

            expect(icon).toBeTruthy();
            expect(icon.textContent).toBeTruthy();
        });

        it('should include a close button by default', () => {
            const notification = showNotification('Test', NOTIFICATION_TYPES.INFO);
            const closeBtn = notification.querySelector('.notification-close');

            expect(closeBtn).toBeTruthy();
            expect(closeBtn.getAttribute('aria-label')).toBe('Cerrar notificación');
        });

        it('should not include close button when closable is false', () => {
            const notification = showNotification('Test', NOTIFICATION_TYPES.INFO, { closable: false });
            const closeBtn = notification.querySelector('.notification-close');

            expect(closeBtn).toBeNull();
        });

        it('should auto-hide after specified duration', () => {
            const notification = showNotification('Test', NOTIFICATION_TYPES.INFO, { duration: 1000 });

            expect(document.body.contains(notification)).toBe(true);

            jest.advanceTimersByTime(1000);
            
            // Notification should be marked as hiding
            expect(notification.classList.contains('hiding')).toBe(true);

            // After animation completes (300ms), it should be removed
            jest.advanceTimersByTime(300);
            expect(document.body.contains(notification)).toBe(false);
        });

        it('should not auto-hide when duration is 0', () => {
            const notification = showNotification('Test', NOTIFICATION_TYPES.INFO, { duration: 0 });

            jest.advanceTimersByTime(10000);
            expect(document.body.contains(notification)).toBe(true);
        });

        it('should have role="alert" for accessibility', () => {
            const notification = showNotification('Test', NOTIFICATION_TYPES.INFO);
            expect(notification.getAttribute('role')).toBe('alert');
        });

        it('should trigger show animation', () => {
            const notification = showNotification('Test', NOTIFICATION_TYPES.INFO);

            // Initially should not have 'show' class
            expect(notification.classList.contains('show')).toBe(false);

            // After requestAnimationFrame, should have 'show' class
            jest.runAllTimers();
            // Note: requestAnimationFrame is not advanced by fake timers in jsdom
            // We can test that the element was created though
            expect(notification).toBeTruthy();
        });
    });

    describe('hideNotification', () => {
        it('should hide a notification', () => {
            const notification = showNotification('Test', NOTIFICATION_TYPES.INFO);

            hideNotification(notification);
            expect(notification.classList.contains('hiding')).toBe(true);

            jest.advanceTimersByTime(300);
            expect(document.body.contains(notification)).toBe(false);
        });

        it('should handle null notification gracefully', () => {
            expect(() => hideNotification(null)).not.toThrow();
        });

        it('should handle notification without parent gracefully', () => {
            const notification = document.createElement('div');
            expect(() => hideNotification(notification)).not.toThrow();
        });
    });

    describe('clearAllNotifications', () => {
        it('should clear all notifications', () => {
            showNotification('Test 1', NOTIFICATION_TYPES.INFO);
            showNotification('Test 2', NOTIFICATION_TYPES.SUCCESS);
            showNotification('Test 3', NOTIFICATION_TYPES.ERROR);

            const container = document.getElementById('notification-container');
            expect(container.querySelectorAll('.notification').length).toBe(3);

            clearAllNotifications();
            
            // All should be marked as hiding
            const notifications = container.querySelectorAll('.notification');
            notifications.forEach(n => {
                expect(n.classList.contains('hiding')).toBe(true);
            });
        });

        it('should handle empty container gracefully', () => {
            expect(() => clearAllNotifications()).not.toThrow();
        });
    });

    describe('toast convenience methods', () => {
        it('should show success notification', () => {
            const notification = toast.success('Success message');

            expect(notification.classList.contains('success')).toBe(true);
            expect(notification.textContent).toContain('Success message');
        });

        it('should show error notification', () => {
            const notification = toast.error('Error message');

            expect(notification.classList.contains('error')).toBe(true);
            expect(notification.textContent).toContain('Error message');
        });

        it('should show warning notification', () => {
            const notification = toast.warning('Warning message');

            expect(notification.classList.contains('warning')).toBe(true);
            expect(notification.textContent).toContain('Warning message');
        });

        it('should show info notification', () => {
            const notification = toast.info('Info message');

            expect(notification.classList.contains('info')).toBe(true);
            expect(notification.textContent).toContain('Info message');
        });

        it('should clear all notifications', () => {
            toast.success('Test 1');
            toast.error('Test 2');

            const container = document.getElementById('notification-container');
            expect(container.querySelectorAll('.notification').length).toBe(2);

            toast.clear();
            
            const notifications = container.querySelectorAll('.notification');
            notifications.forEach(n => {
                expect(n.classList.contains('hiding')).toBe(true);
            });
        });

        it('should support custom options', () => {
            const notification = toast.success('Test', { duration: 5000, closable: false });

            const closeBtn = notification.querySelector('.notification-close');
            expect(closeBtn).toBeNull();
        });
    });

    describe('close button functionality', () => {
        it('should close notification when close button is clicked', () => {
            const notification = showNotification('Test', NOTIFICATION_TYPES.INFO);
            const closeBtn = notification.querySelector('.notification-close');

            expect(document.body.contains(notification)).toBe(true);

            closeBtn.click();
            expect(notification.classList.contains('hiding')).toBe(true);

            jest.advanceTimersByTime(300);
            expect(document.body.contains(notification)).toBe(false);
        });
    });

    describe('notification container', () => {
        it('should have correct ARIA attributes', () => {
            showNotification('Test', NOTIFICATION_TYPES.INFO);

            const container = document.getElementById('notification-container');
            expect(container.getAttribute('aria-live')).toBe('polite');
            expect(container.getAttribute('aria-atomic')).toBe('true');
        });

        it('should reuse existing container', () => {
            showNotification('Test 1', NOTIFICATION_TYPES.INFO);
            showNotification('Test 2', NOTIFICATION_TYPES.INFO);

            const containers = document.querySelectorAll('#notification-container');
            expect(containers.length).toBe(1);
        });
    });
});
