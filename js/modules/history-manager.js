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
    limit,
    startAfter
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { captureAccountScope, isAccountScopeCurrent } from '../utils/account-scope.js';
import { publishSessionMutation, registerSessionMutationInvalidator } from '../utils/session-mutations.js';
import { writeSessionDocument } from '../utils/session-store.js';
import { getCurrentUser } from '../auth.js';
import { historyElements, renderHistoryList, showSessionDetail, showLoading, hideLoading } from '../ui.js';
import { logger } from '../utils/logger.js';
import { toast } from '../utils/notifications.js';
import { addViewListener, cleanupViewListeners } from '../utils/event-manager.js';
import { offlineManager } from '../utils/offline-manager.js';
import { localFirstCache } from '../utils/local-first-cache.js';
import { firebaseUsageTracker } from '../utils/firebase-usage-tracker.js';
import { serializeSessionsForCache, deserializeSessionsFromCache } from '../utils/firestore-serialization.js';
import { t } from '../i18n.js';

const HISTORY_PAGE_SIZE = 10;
const HISTORY_CACHE_TTL_MS = 5 * 60 * 1000;

let currentHistoryPageNumber = 1;
let ownerId = null;
let requestId = 0;
let detailRequestId = 0;
let pageCursors = [null];
let allSessionsCache = [];
let lastHistoryFetchTimestamp = 0;
let currentHasNext = false;
let historyDataScope = null;

function getHistoryCacheKey(userId, page = 1) { return `history:${userId}:page:${page}`; }

export function getSessionsCache() {
    return ownerId === getCurrentUser()?.uid && isAccountScopeCurrent(historyDataScope, ownerId) ? allSessionsCache : [];
}

function resetPaginationState() {
    ++requestId; ++detailRequestId;
    currentHistoryPageNumber = 1; pageCursors = [null]; allSessionsCache = [];
    lastHistoryFetchTimestamp = 0; currentHasNext = false;
    historyDataScope = null;
}

export function invalidateHistoryCache() { resetPaginationState(); }

function updatePaginationButtons(hasNext = currentHasNext, offline = false) {
    if (historyElements.prevPageBtn) historyElements.prevPageBtn.disabled = currentHistoryPageNumber === 1;
    if (historyElements.nextPageBtn) historyElements.nextPageBtn.disabled = !hasNext;
    if (historyElements.pageInfo) historyElements.pageInfo.textContent = t(offline ? 'history.page_cached' : 'history.page', { page: currentHistoryPageNumber });
}

export async function fetchAndRenderHistory(direction = 'initial') {
    const user = getCurrentUser();
    if (ownerId !== user?.uid) { resetPaginationState(); ownerId = user?.uid || null; }
    const request = ++requestId;
    const scope = user ? captureAccountScope(user.uid) : null;
    const isCurrent = () => request === requestId && isAccountScopeCurrent(scope, getCurrentUser()?.uid);
    if (!user) {
        historyElements.list.innerHTML = `<li>${t('history.login_required')}</li>`;
        historyElements.loadingSpinner.classList.add('hidden');
        historyElements.paginationControls?.classList.add('hidden');
        return;
    }
    const page = direction === 'next' ? currentHistoryPageNumber + 1 : direction === 'prev' ? Math.max(1, currentHistoryPageNumber - 1) : 1;
    if (page === 1 && currentHistoryPageNumber === 1 && direction === 'initial' && allSessionsCache.length
        && isAccountScopeCurrent(historyDataScope, user.uid)
        && Date.now() - lastHistoryFetchTimestamp <= HISTORY_CACHE_TTL_MS) {
        renderHistoryList(allSessionsCache); updatePaginationButtons();
        historyElements.loadingSpinner.classList.add('hidden');
        historyElements.paginationControls?.classList.remove('hidden');
        return;
    }
    historyElements.loadingSpinner.classList.remove('hidden');
    historyElements.paginationControls?.classList.remove('hidden');
    try {
        if (!offlineManager.checkOnline()) {
            const entry = await localFirstCache.getEntry(getHistoryCacheKey(user.uid, page));
            if (!isCurrent()) return;
            if (Array.isArray(entry?.value?.sessions) && (!entry.value.ownerId || entry.value.ownerId === user.uid)) {
                allSessionsCache = deserializeSessionsFromCache(entry.value.sessions);
                historyDataScope = scope;
                currentHistoryPageNumber = page; currentHasNext = entry.value.hasNext === true;
                renderHistoryList(allSessionsCache); updatePaginationButtons(currentHasNext, true);
                toast.info(t('history.cache_notice'));
            } else {
                historyElements.list.innerHTML = `<li>${t('history.no_connection')}</li>`;
                historyElements.paginationControls?.classList.add('hidden');
                toast.warning(t('history.no_connection_warning'));
            }
            return;
        }
        const cursor = pageCursors[page - 1];
        // A durable offline page has no live cursor. Restart deterministically.
        if (page > 1 && !cursor) {
            if (historyElements.nextPageBtn) historyElements.nextPageBtn.disabled = true;
            return;
        }
        const constraints = [orderBy('fecha', 'desc')];
        if (cursor) constraints.push(startAfter(cursor));
        constraints.push(limit(HISTORY_PAGE_SIZE + 1));
        const snapshot = await getDocs(query(collection(db, 'users', user.uid, 'sesiones_entrenamiento'), ...constraints));
        if (!isCurrent()) return;
        firebaseUsageTracker.trackRead(snapshot.docs.length || 1, 'history.pageFetch', { direction, page });
        const docs = snapshot.docs.slice(0, HISTORY_PAGE_SIZE);
        // A deleted last page can disappear between requests. Show its predecessor.
        if (!docs.length && page > 1) {
            currentHistoryPageNumber = page;
            await fetchAndRenderHistory('prev');
            return;
        }
        const sessions = docs.map(item => ({ ...item.data(), id: item.id }));
        currentHistoryPageNumber = page; allSessionsCache = sessions;
        historyDataScope = scope;
        currentHasNext = snapshot.docs.length > HISTORY_PAGE_SIZE;
        pageCursors[page] = docs.at(-1) || null;
        pageCursors.length = page + 1;
        lastHistoryFetchTimestamp = Date.now();
        renderHistoryList(sessions); updatePaginationButtons();
        await localFirstCache.set(getHistoryCacheKey(user.uid, page), {
            ownerId: user.uid, sessions: serializeSessionsForCache(sessions), hasNext: currentHasNext,
            complete: page === 1 && !currentHasNext && snapshot.metadata?.fromCache !== true,
        }, { metadata: { page, ownerId: user.uid, source: 'page' }, ifCurrent: isCurrent });
    } catch (error) {
        if (!isCurrent()) return;
        logger.error('Error fetching history:', error);
        historyElements.list.innerHTML = `<li>${t('history.load_error')}</li>`;
        historyElements.paginationControls?.classList.add('hidden');
    } finally {
        if (isCurrent()) historyElements.loadingSpinner.classList.add('hidden');
    }
}

async function deleteSession(sessionId, targetButton) {
    const user = getCurrentUser();
    if (!user) return;
    const scope = captureAccountScope(user.uid, { mutations: false });
    const isCurrent = () => isAccountScopeCurrent(scope, getCurrentUser()?.uid);
    const cached = getSessionsCache().find(session => session.id === sessionId);
    const name = cached?.nombreEntrenamiento || t('history.this_session');
    if (!confirm(t('history.delete_confirm', { name }))) return;
    showLoading(targetButton, t('routines.delete_loading'));
    try {
        await writeSessionDocument(db, user.uid, sessionId, null, { remove: true });
        await publishSessionMutation({ userId: user.uid, sessionId, source: 'history', kind: 'delete' });
        if (!isCurrent()) return;
        invalidateHistoryCache();
        await fetchAndRenderHistory('initial');
        if (isCurrent()) toast.success(t('history.delete_success'));
    } catch (error) {
        if (isCurrent()) { logger.error('Error deleting session:', error); toast.error(t('history.delete_error')); }
    } finally {
        if (isCurrent()) hideLoading(targetButton);
    }
}

async function viewSessionDetails(sessionId) {
    const user = getCurrentUser();
    if (!user) return;
    const request = ++detailRequestId;
    const scope = captureAccountScope(user.uid);
    const isCurrent = () => request === detailRequestId && isAccountScopeCurrent(scope, getCurrentUser()?.uid);
    let sessionData = getSessionsCache().find(session => session.id === sessionId);
    if (!sessionData) {
        historyElements.loadingSpinner.classList.remove('hidden');
        try {
            const snapshot = await getDoc(doc(db, 'users', user.uid, 'sesiones_entrenamiento', sessionId));
            if (!isCurrent()) return;
            firebaseUsageTracker.trackRead(snapshot.exists() ? 1 : 0, 'history.sessionDetail');
            if (!snapshot.exists()) { toast.error(t('history.details_not_found')); return; }
            sessionData = { ...snapshot.data(), id: snapshot.id };
        } catch (error) {
            if (isCurrent()) { logger.error('Error fetching session detail:', error); toast.error(t('history.details_error')); }
            return;
        } finally {
            if (isCurrent()) historyElements.loadingSpinner.classList.add('hidden');
        }
    }
    if (sessionData && isCurrent()) showSessionDetail(sessionData);
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

registerSessionMutationInvalidator(({ userId }) => {
    if (ownerId === userId) invalidateHistoryCache();
});

export default {
    fetchAndRenderHistory,
    invalidateHistoryCache,
    getSessionsCache,
    getCurrentPageNumber,
    getPageSize,
    init: initHistoryManager,
    destroy: destroyHistoryManager
};

