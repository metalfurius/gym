/**
 * History Manager module
 * Handles fetching, displaying, and managing workout session history with pagination.
 */

import { db } from '../firebase-config.js';
import {
    collection,
    query,
    orderBy,
    getDocs,
    doc,
    getDoc,
    deleteDoc,
    limit,
    startAfter
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { getCurrentUser } from '../auth.js';
import { historyElements, renderHistoryList, showSessionDetail, showLoading, hideLoading } from '../ui.js';
import { logger } from '../utils/logger.js';
import { toast } from '../utils/notifications.js';
import { addViewListener, cleanupViewListeners } from '../utils/event-manager.js';
import { offlineManager } from '../utils/offline-manager.js';
import { localFirstCache } from '../utils/local-first-cache.js';
import { firebaseUsageTracker } from '../utils/firebase-usage-tracker.js';
import { serializeSessionsForCache, deserializeSessionsFromCache } from '../utils/firestore-serialization.js';

const HISTORY_PAGE_SIZE = 10;
const HISTORY_CACHE_TTL_MS = 5 * 60 * 1000;

let historyPageLastDocSnapshot = null;
let historyPageDocSnapshotsStack = [];
let currentHistoryPageNumber = 1;
let lastHistoryFetchTimestamp = 0;

let allSessionsCache = [];

function getHistoryCacheKey(userId, page = 1) {
    return `history:${userId}:page:${page}`;
}

async function getCachedInitialHistory(userId) {
    try {
        const entry = await localFirstCache.getEntry(getHistoryCacheKey(userId, 1));
        if (!entry?.value?.sessions || !Array.isArray(entry.value.sessions)) {
            return { sessions: [], hasNext: false, isFresh: false };
        }

        return {
            sessions: deserializeSessionsFromCache(entry.value.sessions),
            hasNext: !!entry.value.hasNext,
            isFresh: localFirstCache.isFresh(entry, HISTORY_CACHE_TTL_MS)
        };
    } catch (error) {
        logger.warn('Could not read history cache:', error);
        return { sessions: [], hasNext: false, isFresh: false };
    }
}

export function getSessionsCache() {
    return allSessionsCache;
}

export function invalidateHistoryCache() {
    resetPaginationState();
}

function resetPaginationState() {
    historyPageLastDocSnapshot = null;
    historyPageDocSnapshotsStack = [];
    currentHistoryPageNumber = 1;
    allSessionsCache = [];
    lastHistoryFetchTimestamp = 0;
}

function updatePaginationButtons(queryResultsLength) {
    if (historyElements.prevPageBtn) {
        historyElements.prevPageBtn.disabled = currentHistoryPageNumber === 1 || historyPageDocSnapshotsStack.length <= 1;
    }

    if (historyElements.nextPageBtn) {
        historyElements.nextPageBtn.disabled = queryResultsLength < HISTORY_PAGE_SIZE || allSessionsCache.length === 0;
    }

    if (historyElements.pageInfo) {
        historyElements.pageInfo.textContent = `Pág. ${currentHistoryPageNumber}`;
    }
}

export async function fetchAndRenderHistory(direction = 'initial') {
    const user = getCurrentUser();
    if (!user) {
        historyElements.list.innerHTML = '<li>Debes iniciar sesión para ver tu historial.</li>';
        historyElements.loadingSpinner.classList.add('hidden');
        if (historyElements.paginationControls) historyElements.paginationControls.classList.add('hidden');
        return;
    }

    if (direction === 'initial' && allSessionsCache.length > 0 && (Date.now() - lastHistoryFetchTimestamp) <= HISTORY_CACHE_TTL_MS) {
        historyElements.loadingSpinner.classList.add('hidden');
        if (historyElements.paginationControls) historyElements.paginationControls.classList.remove('hidden');
        renderHistoryList(allSessionsCache);
        updatePaginationButtons(allSessionsCache.length);
        return;
    }

    if (!offlineManager.checkOnline()) {
        if (direction === 'initial') {
            const cached = await getCachedInitialHistory(user.uid);
            if (cached.sessions.length > 0) {
                allSessionsCache = [...cached.sessions];
                currentHistoryPageNumber = 1;
                renderHistoryList(cached.sessions);
                if (historyElements.paginationControls) historyElements.paginationControls.classList.remove('hidden');
                if (historyElements.prevPageBtn) historyElements.prevPageBtn.disabled = true;
                if (historyElements.nextPageBtn) historyElements.nextPageBtn.disabled = !cached.hasNext;
                if (historyElements.pageInfo) historyElements.pageInfo.textContent = 'Pág. 1 (cache)';
                historyElements.loadingSpinner.classList.add('hidden');
                toast.info('Mostrando historial desde caché local.');
                return;
            }
        }

        historyElements.list.innerHTML = '<li>Sin conexión. No se puede cargar el historial.</li>';
        historyElements.loadingSpinner.classList.add('hidden');
        if (historyElements.paginationControls) historyElements.paginationControls.classList.add('hidden');
        toast.warning('Estás sin conexión. No se pudo cargar el historial.');
        return;
    }

    historyElements.loadingSpinner.classList.remove('hidden');
    historyElements.list.innerHTML = '';
    if (historyElements.paginationControls) historyElements.paginationControls.classList.remove('hidden');

    const userSessionsCollectionRef = collection(db, 'users', user.uid, 'sesiones_entrenamiento');
    let q;

    try {
        if (direction === 'initial') {
            resetPaginationState();
            q = query(userSessionsCollectionRef, orderBy('fecha', 'desc'), limit(HISTORY_PAGE_SIZE));
        } else if (direction === 'next' && historyPageLastDocSnapshot) {
            q = query(userSessionsCollectionRef, orderBy('fecha', 'desc'), startAfter(historyPageLastDocSnapshot), limit(HISTORY_PAGE_SIZE));
            currentHistoryPageNumber++;
        } else if (direction === 'prev') {
            if (historyPageDocSnapshotsStack.length > 0) {
                historyPageDocSnapshotsStack.pop();
                const prevPageStartAfterDoc = historyPageDocSnapshotsStack.pop();

                if (prevPageStartAfterDoc) {
                    q = query(userSessionsCollectionRef, orderBy('fecha', 'desc'), startAfter(prevPageStartAfterDoc), limit(HISTORY_PAGE_SIZE));
                } else {
                    q = query(userSessionsCollectionRef, orderBy('fecha', 'desc'), limit(HISTORY_PAGE_SIZE));
                }

                currentHistoryPageNumber--;
            } else {
                historyElements.loadingSpinner.classList.add('hidden');
                if (historyElements.prevPageBtn) historyElements.prevPageBtn.disabled = true;
                return;
            }
        } else {
            historyElements.loadingSpinner.classList.add('hidden');
            if (direction === 'next' && historyElements.nextPageBtn) historyElements.nextPageBtn.disabled = true;
            return;
        }

        const querySnapshot = await getDocs(q);
        firebaseUsageTracker.trackRead(querySnapshot.docs.length || 1, 'history.pageFetch', {
            direction,
            page: currentHistoryPageNumber
        });

        const sessionsForList = [];
        querySnapshot.forEach((docSnap) => {
            sessionsForList.push({ id: docSnap.id, ...docSnap.data() });
        });

        if (querySnapshot.docs.length > 0) {
            const firstDocOfCurrentPage = querySnapshot.docs[0];

            if (direction === 'initial') {
                historyPageDocSnapshotsStack.push(null);
            }

            if (direction !== 'prev' || querySnapshot.docs.length > 0) {
                historyPageDocSnapshotsStack.push(firstDocOfCurrentPage);
            }

            historyPageLastDocSnapshot = querySnapshot.docs[querySnapshot.docs.length - 1];
        } else {
            if (direction === 'next') historyPageLastDocSnapshot = null;
            if (direction === 'prev' && historyPageDocSnapshotsStack.length <= 1) {
                historyPageDocSnapshotsStack = [null];
            }
        }

        allSessionsCache = [...sessionsForList];
        lastHistoryFetchTimestamp = Date.now();

        renderHistoryList(sessionsForList);
        updatePaginationButtons(querySnapshot.docs.length);

        if (direction === 'initial') {
            await localFirstCache.set(getHistoryCacheKey(user.uid, 1), {
                sessions: serializeSessionsForCache(sessionsForList),
                hasNext: querySnapshot.docs.length >= HISTORY_PAGE_SIZE
            }, {
                metadata: { page: 1 }
            });
        }
    } catch (error) {
        logger.error('Error fetching history:', error);
        historyElements.list.innerHTML = '<li>Error al cargar el historial.</li>';
        if (historyElements.paginationControls) historyElements.paginationControls.classList.add('hidden');

        if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('ERR_BLOCKED_BY_CLIENT'))) {
            const { loadFirebaseDiagnostics } = await import('../app.js');
            loadFirebaseDiagnostics();
        }
    } finally {
        historyElements.loadingSpinner.classList.add('hidden');
    }
}

async function deleteSession(sessionId, targetButton) {
    const user = getCurrentUser();
    if (!user) return;

    const sessionFromCache = allSessionsCache.find((session) => session.id === sessionId);
    const sessionName = sessionFromCache ? (sessionFromCache.nombreEntrenamiento || 'esta sesión') : 'esta sesión';

    if (!confirm(`¿Estás seguro de que quieres eliminar "${sessionName}"? Esta acción no se puede deshacer.`)) {
        return;
    }

    showLoading(targetButton, 'Eliminando...');

    try {
        const sessionDocRef = doc(db, 'users', user.uid, 'sesiones_entrenamiento', sessionId);
        await deleteDoc(sessionDocRef);
        firebaseUsageTracker.trackWrite(1, 'history.deleteSession');

        localFirstCache.clearByPrefix(`history:${user.uid}:`).catch((cacheError) => {
            logger.warn('Could not invalidate history cache after delete:', cacheError);
        });

        if (allSessionsCache.length === 1 && currentHistoryPageNumber > 1) {
            fetchAndRenderHistory('prev');
        } else {
            await reloadCurrentPage(user);
        }

        toast.success('Sesión eliminada correctamente');
    } catch (error) {
        logger.error('Error deleting session:', error);
        toast.error('Error al eliminar la sesión.');
        hideLoading(targetButton);

        if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('ERR_BLOCKED_BY_CLIENT'))) {
            const { loadFirebaseDiagnostics } = await import('../app.js');
            loadFirebaseDiagnostics();
        }
    }
}

async function reloadCurrentPage(user) {
    const startAfterDocForReload = historyPageDocSnapshotsStack.length > 1
        ? historyPageDocSnapshotsStack[historyPageDocSnapshotsStack.length - 2]
        : null;

    let qReload;
    const userSessionsRef = collection(db, 'users', user.uid, 'sesiones_entrenamiento');

    if (startAfterDocForReload) {
        qReload = query(userSessionsRef, orderBy('fecha', 'desc'), startAfter(startAfterDocForReload), limit(HISTORY_PAGE_SIZE));
    } else {
        qReload = query(userSessionsRef, orderBy('fecha', 'desc'), limit(HISTORY_PAGE_SIZE));
    }

    const snapshot = await getDocs(qReload);
    firebaseUsageTracker.trackRead(snapshot.docs.length || 1, 'history.reloadPage', {
        page: currentHistoryPageNumber
    });

    const reloadedSessions = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));

    allSessionsCache = [...reloadedSessions];
    lastHistoryFetchTimestamp = Date.now();
    renderHistoryList(reloadedSessions);

    if (snapshot.docs.length > 0) {
        historyPageLastDocSnapshot = snapshot.docs[snapshot.docs.length - 1];
    } else {
        historyPageLastDocSnapshot = null;
    }

    updatePaginationButtons(snapshot.docs.length);

    if (currentHistoryPageNumber === 1) {
        await localFirstCache.set(getHistoryCacheKey(user.uid, 1), {
            sessions: serializeSessionsForCache(reloadedSessions),
            hasNext: snapshot.docs.length >= HISTORY_PAGE_SIZE
        }, {
            metadata: { page: 1, refreshed: true }
        });
    }
}

async function viewSessionDetails(sessionId) {
    const user = getCurrentUser();
    if (!user) return;

    let sessionData = allSessionsCache.find((session) => session.id === sessionId);

    if (!sessionData) {
        historyElements.loadingSpinner.classList.remove('hidden');
        try {
            const docRef = doc(db, 'users', user.uid, 'sesiones_entrenamiento', sessionId);
            const docSnap = await getDoc(docRef);
            firebaseUsageTracker.trackRead(docSnap.exists() ? 1 : 0, 'history.sessionDetail');

            if (docSnap.exists()) {
                sessionData = { id: docSnap.id, ...docSnap.data() };
            } else {
                toast.error('No se encontraron los detalles.');
                return;
            }
        } catch (error) {
            logger.error('Error fetching session detail:', error);
            toast.error('Error al cargar detalles.');
            return;
        } finally {
            historyElements.loadingSpinner.classList.add('hidden');
        }
    }

    if (sessionData) {
        showSessionDetail(sessionData);
    }
}

async function handleHistoryListClick(event) {
    const user = getCurrentUser();
    if (!user) return;

    const targetButton = event.target.closest('button[data-action="delete-session"]');
    const listItem = event.target.closest('li[data-session-id]');

    if (targetButton) {
        event.stopPropagation();
        const sessionIdToDelete = targetButton.dataset.sessionId;
        await deleteSession(sessionIdToDelete, targetButton);
    } else if (listItem) {
        const sessionId = listItem.dataset.sessionId;
        await viewSessionDetails(sessionId);
    }
}

export function initHistoryManager() {
    cleanupViewListeners('history');

    if (historyElements.list) {
        addViewListener('history', historyElements.list, 'click', handleHistoryListClick);
    }

    if (historyElements.prevPageBtn) {
        addViewListener('history', historyElements.prevPageBtn, 'click', () => fetchAndRenderHistory('prev'));
    }

    if (historyElements.nextPageBtn) {
        addViewListener('history', historyElements.nextPageBtn, 'click', () => fetchAndRenderHistory('next'));
    }

    logger.debug('History manager initialized');
}

export function destroyHistoryManager() {
    cleanupViewListeners('history');
    resetPaginationState();
    logger.debug('History manager destroyed');
}

export function getCurrentPageNumber() {
    return currentHistoryPageNumber;
}

export function getPageSize() {
    return HISTORY_PAGE_SIZE;
}

export default {
    fetchAndRenderHistory,
    invalidateHistoryCache,
    getSessionsCache,
    getCurrentPageNumber,
    getPageSize,
    init: initHistoryManager,
    destroy: destroyHistoryManager
};
