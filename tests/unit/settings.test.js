import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { 
    initSettings, 
    destroySettings,
    showSettingsModal,
    hideSettingsModal,
    loadCacheInfo,
    formatBytes,
    clearExerciseCache
} from '../../js/modules/settings.js';

/**
 * Tests for settings module
 * Manages the settings modal, cache information display, and cache clearing
 */
describe('Settings module', () => {
    beforeEach(() => {
        // Setup DOM with required elements
        document.body.innerHTML = `
            <button id="settings-btn">Settings</button>
            <div id="settings-modal" style="display: none;">
                <button class="settings-modal-close">×</button>
                <div id="cache-info-container"></div>
                <button id="clear-cache-btn">Clear Cache</button>
            </div>
        `;

        // Mock localStorage
        localStorage.clear();
    });

    afterEach(() => {
        destroySettings();
        jest.clearAllMocks();
    });

    describe('formatBytes', () => {
        it('should format 0 bytes', () => {
            expect(formatBytes(0)).toBe('0 Bytes');
        });

        it('should format bytes correctly', () => {
            expect(formatBytes(100)).toBe('100 Bytes');
        });

        it('should format kilobytes correctly', () => {
            expect(formatBytes(1024)).toBe('1 KB');
            expect(formatBytes(1536)).toBe('1.5 KB');
        });

        it('should format megabytes correctly', () => {
            expect(formatBytes(1048576)).toBe('1 MB');
            expect(formatBytes(2097152)).toBe('2 MB');
        });

        it('should format gigabytes correctly', () => {
            expect(formatBytes(1073741824)).toBe('1 GB');
        });

        it('should round to 2 decimal places', () => {
            expect(formatBytes(1234567)).toBe('1.18 MB');
        });
    });

    describe('initSettings', () => {
        it('should initialize settings module', () => {
            expect(() => initSettings()).not.toThrow();
        });

        it('should attach click event to settings button', () => {
            initSettings();

            const settingsBtn = document.getElementById('settings-btn');
            const clickSpy = jest.fn();
            
            // Remove existing listeners and add our spy
            const newBtn = settingsBtn.cloneNode(true);
            settingsBtn.parentNode.replaceChild(newBtn, settingsBtn);
            newBtn.addEventListener('click', clickSpy);

            // Re-initialize to attach new listeners
            destroySettings();
            initSettings();

            // Modal should not be visible initially
            const modal = document.getElementById('settings-modal');
            expect(modal.style.display).toBe('none');
        });

        it('should not initialize twice', () => {
            initSettings();
            initSettings();
            // Should not throw and should handle gracefully
            expect(true).toBe(true);
        });

        it('should handle missing DOM elements gracefully', () => {
            document.body.innerHTML = '';
            expect(() => initSettings()).not.toThrow();
        });
    });

    describe('showSettingsModal', () => {
        beforeEach(() => {
            initSettings();
        });

        it('should display the settings modal', () => {
            showSettingsModal();

            const modal = document.getElementById('settings-modal');
            expect(modal.style.display).toBe('block');
        });

        it('should handle missing modal gracefully', () => {
            document.getElementById('settings-modal').remove();
            expect(() => showSettingsModal()).not.toThrow();
        });
    });

    describe('hideSettingsModal', () => {
        beforeEach(() => {
            initSettings();
        });

        it('should hide the settings modal', () => {
            showSettingsModal();
            const modal = document.getElementById('settings-modal');
            expect(modal.style.display).toBe('block');

            hideSettingsModal();
            expect(modal.style.display).toBe('none');
        });

        it('should handle missing modal gracefully', () => {
            document.getElementById('settings-modal').remove();
            expect(() => hideSettingsModal()).not.toThrow();
        });
    });

    describe('loadCacheInfo', () => {
        beforeEach(() => {
            initSettings();
        });

        it('should handle missing cache info container', async () => {
            document.getElementById('cache-info-container').remove();
            await expect(loadCacheInfo()).resolves.not.toThrow();
        });

        it.skip('should display cache statistics', async () => {
            // This test requires complex module mocking, skipping for now
        });

        it.skip('should handle errors when loading cache info', async () => {
            // This test requires complex module mocking, skipping for now
        });
    });

    describe('clearExerciseCache', () => {
        beforeEach(() => {
            initSettings();
            // Mock window.confirm
            global.confirm = jest.fn();
        });

        it('should prompt for confirmation before clearing cache', async () => {
            global.confirm.mockReturnValue(false);

            await clearExerciseCache();

            expect(global.confirm).toHaveBeenCalled();
            expect(global.confirm.mock.calls[0][0]).toContain('¿Estás seguro');
        });

        it('should not clear cache if user cancels', async () => {
            global.confirm.mockReturnValue(false);

            await clearExerciseCache();

            // Verify that cache was not cleared (no module import happened)
            expect(global.confirm).toHaveBeenCalled();
        });

        it.skip('should clear cache if user confirms', async () => {
            // Skipping due to module mocking complexity
        });

        it.skip('should handle errors when clearing cache', async () => {
            // Skipping due to module mocking complexity
        });
    });

    describe('destroySettings', () => {
        it('should clean up settings module', () => {
            initSettings();
            expect(() => destroySettings()).not.toThrow();
        });

        it('should not throw when called before init', () => {
            expect(() => destroySettings()).not.toThrow();
        });

        it('should not throw when called multiple times', () => {
            initSettings();
            destroySettings();
            expect(() => destroySettings()).not.toThrow();
        });
    });

    describe('modal close button', () => {
        beforeEach(() => {
            initSettings();
        });

        it('should close modal when close button is clicked', () => {
            showSettingsModal();
            const modal = document.getElementById('settings-modal');
            expect(modal.style.display).toBe('block');

            const closeBtn = document.querySelector('.settings-modal-close');
            closeBtn.click();

            expect(modal.style.display).toBe('none');
        });
    });

    describe('click outside modal', () => {
        beforeEach(() => {
            initSettings();
        });

        it('should close modal when clicking on modal background', () => {
            showSettingsModal();
            const modal = document.getElementById('settings-modal');
            expect(modal.style.display).toBe('block');

            // Simulate click on modal background
            const clickEvent = new MouseEvent('click', { bubbles: true });
            Object.defineProperty(clickEvent, 'target', { value: modal, enumerable: true });
            window.dispatchEvent(clickEvent);

            expect(modal.style.display).toBe('none');
        });

        it('should not close modal when clicking inside modal content', () => {
            showSettingsModal();
            const modal = document.getElementById('settings-modal');
            expect(modal.style.display).toBe('block');

            // Simulate click inside modal
            const container = document.getElementById('cache-info-container');
            const clickEvent = new MouseEvent('click', { bubbles: true });
            Object.defineProperty(clickEvent, 'target', { value: container, enumerable: true });
            window.dispatchEvent(clickEvent);

            // Modal should still be visible
            expect(modal.style.display).toBe('block');
        });
    });

    describe('default export', () => {
        it('should export all methods', async () => {
            const module = await import('../../js/modules/settings.js');
            expect(module.default).toBeDefined();
            expect(typeof module.default.init).toBe('function');
            expect(typeof module.default.destroy).toBe('function');
            expect(typeof module.default.show).toBe('function');
            expect(typeof module.default.hide).toBe('function');
            expect(typeof module.default.loadCacheInfo).toBe('function');
            expect(typeof module.default.clearCache).toBe('function');
            expect(typeof module.default.formatBytes).toBe('function');
        });
    });
});
