import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerDebug = jest.fn();
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
const mockGetStorageEstimate = jest.fn();
const mockFormatDate = jest.fn((date) => date.toISOString().slice(0, 10));
const mockGetUsageSummary = jest.fn();
const mockResetUsage = jest.fn();
const mockExerciseCacheStats = jest.fn();
const mockExerciseCacheClear = jest.fn();

jest.unstable_mockModule('../../js/utils/logger.js', () => ({
    logger: {
        warn: mockLoggerWarn,
        error: mockLoggerError,
        debug: mockLoggerDebug
    }
}));

jest.unstable_mockModule('../../js/utils/notifications.js', () => ({
    toast: {
        success: mockToastSuccess,
        error: mockToastError
    }
}));

jest.unstable_mockModule('../../js/storage-manager.js', () => ({
    storageManager: {
        getStorageEstimate: mockGetStorageEstimate
    }
}));

jest.unstable_mockModule('../../js/ui.js', () => ({
    formatDate: mockFormatDate
}));

jest.unstable_mockModule('../../js/utils/firebase-usage-tracker.js', () => ({
    firebaseUsageTracker: {
        getSummary: mockGetUsageSummary,
        reset: mockResetUsage
    }
}));

jest.unstable_mockModule('../../js/exercise-cache.js', () => ({
    exerciseCache: {
        getCacheStats: mockExerciseCacheStats,
        clearCache: mockExerciseCacheClear
    }
}));

const settingsModule = await import('../../js/modules/settings.js');

const {
    initSettings,
    destroySettings,
    formatBytes,
    loadCacheInfo,
    clearExerciseCache,
    showSettingsModal,
    hideSettingsModal,
    resetFirebaseUsageMetrics
} = settingsModule;

function setupDom({ includeCacheContainer = true } = {}) {
    document.body.innerHTML = `
        <button id="settings-btn">Settings</button>
        <div id="settings-modal" style="display: none;">
            <div id="settings-content">
                <button class="settings-modal-close">x</button>
                ${includeCacheContainer ? '<div id="cache-info-container"></div>' : ''}
                <button id="clear-cache-btn">Clear Cache</button>
                <button id="reset-firebase-usage-btn">Reset Firebase</button>
            </div>
        </div>
    `;
}

function setDefaultCacheMocks() {
    mockExerciseCacheStats.mockReturnValue({
        exerciseCount: 2,
        totalEntries: 5,
        cacheSize: 2048,
        newestEntry: new Date('2026-03-10T10:00:00.000Z'),
        oldestEntry: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    });

    mockGetStorageEstimate.mockResolvedValue({
        usage: 1024,
        quota: 4096,
        usagePercentage: 25
    });

    mockGetUsageSummary.mockReturnValue({
        reads: 12,
        writes: 4,
        sessionDurationMs: 65_000,
        estimatedCostUsd: 0.0123,
        topOperations: [
            { type: 'read', operation: 'history.pageFetch', total: 7 }
        ]
    });
}

describe('Settings module', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setupDom();
        global.confirm = jest.fn(() => true);
        setDefaultCacheMocks();
    });

    afterEach(() => {
        destroySettings();
    });

    describe('formatBytes', () => {
        it('formats bytes correctly', () => {
            expect(formatBytes(0)).toBe('0 Bytes');
            expect(formatBytes(100)).toBe('100 Bytes');
            expect(formatBytes(1024)).toBe('1 KB');
            expect(formatBytes(1048576)).toBe('1 MB');
        });
    });

    describe('loadCacheInfo', () => {
        it('handles missing cache container gracefully', async () => {
            setupDom({ includeCacheContainer: false });

            await loadCacheInfo();

            expect(mockLoggerWarn).toHaveBeenCalledWith('Cache info container not found');
        });

        it('renders cache, storage and Firebase usage statistics', async () => {
            await loadCacheInfo();
            const html = document.getElementById('cache-info-container').innerHTML;

            expect(html).toContain('Ejercicios en cache');
            expect(html).toContain('Total de registros');
            expect(html).toContain('Almacenamiento usado');
            expect(html).toContain('Lecturas Firebase (sesión)');
            expect(html).toContain('history.pageFetch');
            expect(html).toContain('$0.0123');
        });

        it('renders an error message when cache loading fails', async () => {
            mockExerciseCacheStats.mockImplementationOnce(() => {
                throw new Error('cache error');
            });

            await loadCacheInfo();

            const html = document.getElementById('cache-info-container').innerHTML;
            expect(html).toContain('Error al cargar la información del cache');
            expect(mockLoggerError).toHaveBeenCalled();
        });
    });

    describe('clearExerciseCache', () => {
        it('does nothing when user cancels confirmation', async () => {
            global.confirm = jest.fn(() => false);

            await clearExerciseCache();

            expect(global.confirm).toHaveBeenCalled();
            expect(mockExerciseCacheClear).not.toHaveBeenCalled();
        });

        it('clears cache and refreshes cache info on confirmation', async () => {
            await clearExerciseCache();

            expect(mockExerciseCacheClear).toHaveBeenCalled();
            expect(mockToastSuccess).toHaveBeenCalledWith('Cache eliminado correctamente');
        });

        it('shows an error toast if clear cache fails', async () => {
            mockExerciseCacheClear.mockImplementationOnce(() => {
                throw new Error('clear failed');
            });

            await clearExerciseCache();

            expect(mockToastError).toHaveBeenCalledWith('Error al eliminar el cache');
        });
    });

    describe('modal visibility and lifecycle', () => {
        it('initializes settings and opens modal from settings button', () => {
            initSettings();
            document.getElementById('settings-btn').click();
            expect(document.getElementById('settings-modal').style.display).toBe('block');
        });

        it('hides modal from close button click', () => {
            initSettings();
            showSettingsModal();
            document.querySelector('.settings-modal-close').click();
            expect(document.getElementById('settings-modal').style.display).toBe('none');
        });

        it('closes modal when clicking outside content', () => {
            initSettings();
            showSettingsModal();

            document.getElementById('settings-modal').dispatchEvent(
                new MouseEvent('click', { bubbles: true })
            );

            expect(document.getElementById('settings-modal').style.display).toBe('none');
        });

        it('keeps modal open when clicking inside content', () => {
            initSettings();
            showSettingsModal();

            document.getElementById('settings-content').dispatchEvent(
                new MouseEvent('click', { bubbles: true })
            );

            expect(document.getElementById('settings-modal').style.display).toBe('block');
        });

        it('supports destroy before init and multiple destroy calls', () => {
            expect(() => destroySettings()).not.toThrow();

            initSettings();
            expect(() => destroySettings()).not.toThrow();
            expect(() => destroySettings()).not.toThrow();
        });

        it('supports re-init after destroy', () => {
            initSettings();
            destroySettings();
            initSettings();

            document.getElementById('settings-btn').click();
            expect(document.getElementById('settings-modal').style.display).toBe('block');
        });

        it('removes window listeners on destroy and re-registers cleanly on re-init', () => {
            const addSpy = jest.spyOn(window, 'addEventListener');
            const removeSpy = jest.spyOn(window, 'removeEventListener');

            initSettings();
            destroySettings();
            initSettings();

            const addedFirebaseUsageHandler = addSpy.mock.calls.find(
                ([eventName]) => eventName === 'firebaseUsageUpdated'
            )?.[1];
            const removedFirebaseUsageHandler = removeSpy.mock.calls.find(
                ([eventName]) => eventName === 'firebaseUsageUpdated'
            )?.[1];

            const addedClickHandler = addSpy.mock.calls.find(
                ([eventName]) => eventName === 'click'
            )?.[1];
            const removedClickHandler = removeSpy.mock.calls.find(
                ([eventName]) => eventName === 'click'
            )?.[1];

            expect(addedFirebaseUsageHandler).toBeDefined();
            expect(removedFirebaseUsageHandler).toBe(addedFirebaseUsageHandler);
            expect(addedClickHandler).toBeDefined();
            expect(removedClickHandler).toBe(addedClickHandler);

            addSpy.mockRestore();
            removeSpy.mockRestore();
        });
    });

    describe('additional actions', () => {
        it('resetFirebaseUsageMetrics resets tracker and refreshes info', async () => {
            resetFirebaseUsageMetrics();

            expect(mockResetUsage).toHaveBeenCalled();
            expect(mockToastSuccess).toHaveBeenCalledWith('Métricas de Firebase reiniciadas');
        });

        it('showSettingsModal and hideSettingsModal are safe without DOM references', () => {
            expect(() => showSettingsModal()).not.toThrow();
            expect(() => hideSettingsModal()).not.toThrow();
        });
    });

    describe('default export', () => {
        it('exports the expected API', () => {
            expect(settingsModule.default).toBeDefined();
            expect(typeof settingsModule.default.init).toBe('function');
            expect(typeof settingsModule.default.destroy).toBe('function');
            expect(typeof settingsModule.default.show).toBe('function');
            expect(typeof settingsModule.default.hide).toBe('function');
            expect(typeof settingsModule.default.loadCacheInfo).toBe('function');
            expect(typeof settingsModule.default.clearCache).toBe('function');
            expect(typeof settingsModule.default.formatBytes).toBe('function');
        });
    });
});
