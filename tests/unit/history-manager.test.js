import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { __firestoreState, __resetMockFirebase } from '../mocks/firebase-state.js';

const mockGetCurrentUser = jest.fn();
const mockRenderHistoryList = jest.fn();
const mockShowSessionDetail = jest.fn();
const mockShowLoading = jest.fn();
const mockHideLoading = jest.fn();
const mockAddViewListener = jest.fn();
const mockCleanupViewListeners = jest.fn();
const mockCheckOnline = jest.fn();
const mockCacheGetEntry = jest.fn();
const mockCacheSet = jest.fn();
const mockCacheClearByPrefix = jest.fn();
const mockCacheIsFresh = jest.fn();
const mockTrackRead = jest.fn();
const mockTrackWrite = jest.fn();
const mockSerializeSessionsForCache = jest.fn((sessions) => sessions);
const mockDeserializeSessionsFromCache = jest.fn((sessions) => sessions);
const mockToastInfo = jest.fn();
const mockToastWarning = jest.fn();
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();

const historyElements = {
    list: null,
    loadingSpinner: null,
    paginationControls: null,
    prevPageBtn: null,
    nextPageBtn: null,
    pageInfo: null
};

jest.unstable_mockModule('../../js/firebase-config.js', () => ({
    db: { __isMockDb: true }
}));

jest.unstable_mockModule('../../js/auth.js', () => ({
    getCurrentUser: mockGetCurrentUser
}));

jest.unstable_mockModule('../../js/ui.js', () => ({
    historyElements,
    renderHistoryList: mockRenderHistoryList,
    showSessionDetail: mockShowSessionDetail,
    showLoading: mockShowLoading,
    hideLoading: mockHideLoading
}));

jest.unstable_mockModule('../../js/utils/logger.js', () => ({
    logger: {
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }
}));

jest.unstable_mockModule('../../js/utils/notifications.js', () => ({
    toast: {
        info: mockToastInfo,
        warning: mockToastWarning,
        success: mockToastSuccess,
        error: mockToastError
    }
}));

jest.unstable_mockModule('../../js/utils/event-manager.js', () => ({
    addViewListener: mockAddViewListener,
    cleanupViewListeners: mockCleanupViewListeners
}));

jest.unstable_mockModule('../../js/utils/offline-manager.js', () => ({
    offlineManager: {
        checkOnline: mockCheckOnline
    }
}));

jest.unstable_mockModule('../../js/utils/local-first-cache.js', () => ({
    localFirstCache: {
        getEntry: mockCacheGetEntry,
        set: mockCacheSet,
        clearByPrefix: mockCacheClearByPrefix,
        isFresh: mockCacheIsFresh
    }
}));

jest.unstable_mockModule('../../js/utils/firebase-usage-tracker.js', () => ({
    firebaseUsageTracker: {
        trackRead: mockTrackRead,
        trackWrite: mockTrackWrite
    }
}));

jest.unstable_mockModule('../../js/utils/firestore-serialization.js', () => ({
    serializeSessionsForCache: mockSerializeSessionsForCache,
    deserializeSessionsFromCache: mockDeserializeSessionsFromCache
}));

jest.unstable_mockModule('../../js/app.js', () => ({
    loadFirebaseDiagnostics: jest.fn()
}));

const historyManagerModule = await import('../../js/modules/history-manager.js');

const {
    fetchAndRenderHistory,
    getSessionsCache,
    getCurrentPageNumber,
    getPageSize,
    initHistoryManager,
    destroyHistoryManager
} = historyManagerModule;

function setupHistoryDom() {
    document.body.innerHTML = `
        <ul id="history-list"></ul>
        <div id="history-loading-spinner" class="hidden"></div>
        <div id="history-pagination-controls" class="hidden"></div>
        <button id="history-prev"></button>
        <button id="history-next"></button>
        <span id="history-page-info"></span>
    `;

    historyElements.list = document.getElementById('history-list');
    historyElements.loadingSpinner = document.getElementById('history-loading-spinner');
    historyElements.paginationControls = document.getElementById('history-pagination-controls');
    historyElements.prevPageBtn = document.getElementById('history-prev');
    historyElements.nextPageBtn = document.getElementById('history-next');
    historyElements.pageInfo = document.getElementById('history-page-info');
}

function seedHistorySessions(uid, fechas) {
    fechas.forEach((fecha, index) => {
        __firestoreState.documents.set(
            `users/${uid}/sesiones_entrenamiento/session-${index + 1}`,
            {
                fecha,
                nombreEntrenamiento: `Session ${index + 1}`
            }
        );
    });
}

describe('History Manager', () => {
    const user = { uid: 'history-user-1' };

    beforeEach(() => {
        __resetMockFirebase();
        setupHistoryDom();

        mockGetCurrentUser.mockReturnValue(user);
        mockCheckOnline.mockReturnValue(true);
        mockCacheGetEntry.mockResolvedValue(null);
        mockCacheSet.mockResolvedValue(undefined);
        mockCacheClearByPrefix.mockResolvedValue(undefined);
        mockCacheIsFresh.mockReturnValue(true);
        mockSerializeSessionsForCache.mockImplementation((sessions) => sessions);
        mockDeserializeSessionsFromCache.mockImplementation((sessions) => sessions);

        jest.clearAllMocks();
        destroyHistoryManager();
    });

    afterEach(() => {
        destroyHistoryManager();
    });

    describe('module exports', () => {
        it('returns an array from getSessionsCache', () => {
            expect(Array.isArray(getSessionsCache())).toBe(true);
            expect(getSessionsCache()).toEqual([]);
        });

        it('returns expected pagination constants', () => {
            expect(getPageSize()).toBe(10);
            expect(getCurrentPageNumber()).toBe(1);
        });
    });

    describe('fetchAndRenderHistory', () => {
        it('handles unauthenticated user', async () => {
            mockGetCurrentUser.mockReturnValue(null);

            await fetchAndRenderHistory('initial');

            expect(historyElements.list.innerHTML).toContain('Debes iniciar sesi');
            expect(historyElements.loadingSpinner.classList.contains('hidden')).toBe(true);
            expect(historyElements.paginationControls.classList.contains('hidden')).toBe(true);
            expect(mockRenderHistoryList).not.toHaveBeenCalled();
        });

        it('fetches first page, renders list, updates cache and pagination UI', async () => {
            seedHistorySessions(user.uid, [500, 400, 300]);

            await fetchAndRenderHistory('initial');

            expect(mockRenderHistoryList).toHaveBeenCalledTimes(1);
            const renderedSessions = mockRenderHistoryList.mock.calls[0][0];
            expect(renderedSessions).toHaveLength(3);
            expect(renderedSessions.map((entry) => entry.fecha)).toEqual([500, 400, 300]);
            expect(getSessionsCache()).toHaveLength(3);
            expect(getCurrentPageNumber()).toBe(1);
            expect(historyElements.pageInfo.textContent).toContain('1');
            expect(historyElements.prevPageBtn.disabled).toBe(true);
            expect(historyElements.nextPageBtn.disabled).toBe(true);
            expect(mockTrackRead).toHaveBeenCalledWith(3, 'history.pageFetch', {
                direction: 'initial',
                page: 1
            });
            expect(mockCacheSet).toHaveBeenCalledTimes(1);
        });

        it('reuses in-memory cache on repeated initial load within TTL', async () => {
            seedHistorySessions(user.uid, [900, 800]);

            await fetchAndRenderHistory('initial');
            expect(mockTrackRead).toHaveBeenCalledTimes(1);
            expect(mockCacheSet).toHaveBeenCalledTimes(1);

            mockRenderHistoryList.mockClear();
            await fetchAndRenderHistory('initial');

            expect(mockRenderHistoryList).toHaveBeenCalledTimes(1);
            expect(mockTrackRead).toHaveBeenCalledTimes(1);
            expect(mockCacheSet).toHaveBeenCalledTimes(1);
        });

        it('uses local cache when offline on initial load', async () => {
            mockCheckOnline.mockReturnValue(false);
            mockCacheGetEntry.mockResolvedValue({
                value: {
                    sessions: [{ id: 'cached-session-1', fecha: 321 }],
                    hasNext: true
                },
                updatedAt: Date.now()
            });
            mockCacheIsFresh.mockReturnValue(true);

            await fetchAndRenderHistory('initial');

            expect(mockCacheGetEntry).toHaveBeenCalledWith(`history:${user.uid}:page:1`);
            expect(mockDeserializeSessionsFromCache).toHaveBeenCalled();
            expect(mockRenderHistoryList).toHaveBeenCalledWith([{ id: 'cached-session-1', fecha: 321 }]);
            expect(historyElements.prevPageBtn.disabled).toBe(true);
            expect(historyElements.nextPageBtn.disabled).toBe(false);
            expect(historyElements.pageInfo.textContent).toContain('1');
            expect(mockToastInfo).toHaveBeenCalled();
        });

        it('shows offline message when offline and cache is empty', async () => {
            mockCheckOnline.mockReturnValue(false);
            mockCacheGetEntry.mockResolvedValue(null);

            await fetchAndRenderHistory('initial');

            expect(historyElements.list.innerHTML).toContain('Sin conexi');
            expect(historyElements.paginationControls.classList.contains('hidden')).toBe(true);
            expect(mockToastWarning).toHaveBeenCalled();
            expect(mockRenderHistoryList).not.toHaveBeenCalled();
        });

        it('navigates to next page when more than one page exists', async () => {
            seedHistorySessions(
                user.uid,
                Array.from({ length: 12 }, (_, index) => 1200 - index)
            );

            await fetchAndRenderHistory('initial');
            await fetchAndRenderHistory('next');

            expect(getCurrentPageNumber()).toBe(2);
            expect(historyElements.prevPageBtn.disabled).toBe(false);
            expect(mockTrackRead).toHaveBeenCalledWith(2, 'history.pageFetch', {
                direction: 'next',
                page: 2
            });
        });

        it('does not crash when navigating prev without pagination history', async () => {
            await fetchAndRenderHistory('prev');
            expect(historyElements.prevPageBtn.disabled).toBe(true);
            expect(getCurrentPageNumber()).toBe(1);
        });
    });

    describe('lifecycle', () => {
        it('registers history listeners on init', () => {
            initHistoryManager();

            expect(mockCleanupViewListeners).toHaveBeenCalledWith('history');
            expect(mockAddViewListener).toHaveBeenCalledWith(
                'history',
                historyElements.list,
                'click',
                expect.any(Function)
            );
            expect(mockAddViewListener).toHaveBeenCalledWith(
                'history',
                historyElements.prevPageBtn,
                'click',
                expect.any(Function)
            );
            expect(mockAddViewListener).toHaveBeenCalledWith(
                'history',
                historyElements.nextPageBtn,
                'click',
                expect.any(Function)
            );
        });

        it('resets state on destroy', async () => {
            seedHistorySessions(user.uid, [500, 400]);
            await fetchAndRenderHistory('initial');

            expect(getSessionsCache()).toHaveLength(2);

            destroyHistoryManager();

            expect(getSessionsCache()).toEqual([]);
            expect(getCurrentPageNumber()).toBe(1);
        });
    });
});
