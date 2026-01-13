/**
 * History Manager module
 * Handles fetching, displaying, and managing workout session history with pagination
 */

import { db } from '../firebase-config.js';
import { 
    collection, query, orderBy, getDocs, doc, getDoc, deleteDoc, 
    limit, startAfter 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getCurrentUser } from '../auth.js';
import { historyElements, renderHistoryList, showSessionDetail, showLoading, hideLoading } from '../ui.js';
import { logger } from '../utils/logger.js';
import { toast } from '../utils/notifications.js';

// Pagination constants
const HISTORY_PAGE_SIZE = 10;

// Pagination state
let historyPageFirstDocSnapshot = null;
let historyPageLastDocSnapshot = null;
let historyPageDocSnapshotsStack = [];
let currentHistoryPageNumber = 1;

// Cache for current page sessions
let allSessionsCache = [];

/**
 * Gets the current sessions cache
 * @returns {Array} Cached sessions for the current page
 */
export function getSessionsCache() {
    return allSessionsCache;
}

/**
 * Resets pagination state to initial values
 */
function resetPaginationState() {
    historyPageFirstDocSnapshot = null;
    historyPageLastDocSnapshot = null;
    historyPageDocSnapshotsStack = [];
    currentHistoryPageNumber = 1;
    allSessionsCache = [];
}

/**
 * Updates pagination button states
 * @param {number} queryResultsLength - Number of results from the query
 */
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

/**
 * Fetches and renders the workout history
 * @param {string} direction - Navigation direction: 'initial', 'next', or 'prev'
 */
export async function fetchAndRenderHistory(direction = 'initial') {
    const user = getCurrentUser();
    if (!user) {
        historyElements.list.innerHTML = '<li>Debes iniciar sesión para ver tu historial.</li>';
        historyElements.loadingSpinner.classList.add('hidden');
        if (historyElements.paginationControls) historyElements.paginationControls.classList.add('hidden');
        return;
    }

    historyElements.loadingSpinner.classList.remove('hidden');
    historyElements.list.innerHTML = '';
    if (historyElements.paginationControls) historyElements.paginationControls.classList.remove('hidden');

    const userSessionsCollectionRef = collection(db, "users", user.uid, "sesiones_entrenamiento");
    let q;

    try {
        if (direction === 'initial') {
            resetPaginationState();
            q = query(userSessionsCollectionRef, orderBy("fecha", "desc"), limit(HISTORY_PAGE_SIZE));
        } else if (direction === 'next' && historyPageLastDocSnapshot) {
            q = query(userSessionsCollectionRef, orderBy("fecha", "desc"), startAfter(historyPageLastDocSnapshot), limit(HISTORY_PAGE_SIZE));
            currentHistoryPageNumber++;
        } else if (direction === 'prev') {
            if (historyPageDocSnapshotsStack.length > 0) {
                historyPageDocSnapshotsStack.pop();
                const prevPageStartAfterDoc = historyPageDocSnapshotsStack.pop();
                
                if (prevPageStartAfterDoc) {
                    q = query(userSessionsCollectionRef, orderBy("fecha", "desc"), startAfter(prevPageStartAfterDoc), limit(HISTORY_PAGE_SIZE));
                } else {
                    q = query(userSessionsCollectionRef, orderBy("fecha", "desc"), limit(HISTORY_PAGE_SIZE));
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
        const sessionsForList = [];
        querySnapshot.forEach((docSnap) => {
            sessionsForList.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Save pagination references
        if (querySnapshot.docs.length > 0) {
            const firstDocOfCurrentPage = querySnapshot.docs[0];
            
            if (direction === 'initial') {
                historyPageDocSnapshotsStack.push(null);
            }
            
            if (direction !== 'prev' || (direction === 'prev' && querySnapshot.docs.length > 0)) {
                historyPageDocSnapshotsStack.push(firstDocOfCurrentPage);
            }

            historyPageFirstDocSnapshot = firstDocOfCurrentPage;
            historyPageLastDocSnapshot = querySnapshot.docs[querySnapshot.docs.length - 1];
        } else {
            if (direction === 'next') historyPageLastDocSnapshot = null;
            if (direction === 'prev' && historyPageDocSnapshotsStack.length <= 1) {
                historyPageDocSnapshotsStack = [null];
            }
        }
        
        allSessionsCache = [...sessionsForList];
        renderHistoryList(sessionsForList);
        updatePaginationButtons(querySnapshot.docs.length);
        
    } catch (error) {
        logger.error("Error fetching history:", error);
        historyElements.list.innerHTML = '<li>Error al cargar el historial.</li>';
        if (historyElements.paginationControls) historyElements.paginationControls.classList.add('hidden');
        
        // Load diagnostics on Firestore errors
        if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('ERR_BLOCKED_BY_CLIENT'))) {
            const { loadFirebaseDiagnostics } = await import('../app.js');
            loadFirebaseDiagnostics();
        }
    } finally {
        historyElements.loadingSpinner.classList.add('hidden');
    }
}

/**
 * Deletes a session from the history
 * @param {string} sessionId - The ID of the session to delete
 * @param {HTMLElement} targetButton - The delete button element
 */
async function deleteSession(sessionId, targetButton) {
    const user = getCurrentUser();
    if (!user) return;

    const sessionFromCache = allSessionsCache.find(s => s.id === sessionId);
    const sessionName = sessionFromCache ? (sessionFromCache.nombreEntrenamiento || "esta sesión") : "esta sesión";

    if (!confirm(`¿Estás seguro de que quieres eliminar "${sessionName}"? Esta acción no se puede deshacer.`)) {
        return;
    }

    showLoading(targetButton, 'Eliminando...');
    
    try {
        const sessionDocRef = doc(db, "users", user.uid, "sesiones_entrenamiento", sessionId);
        await deleteDoc(sessionDocRef);
        
        // Reload the current page or go to previous if last item
        if (allSessionsCache.length === 1 && currentHistoryPageNumber > 1) {
            fetchAndRenderHistory('prev');
        } else {
            await reloadCurrentPage(user);
        }
        
        toast.success("Sesión eliminada correctamente");
    } catch (error) {
        logger.error("Error deleting session:", error);
        toast.error("Error al eliminar la sesión.");
        hideLoading(targetButton);
        
        // Load diagnostics on Firestore errors
        if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('ERR_BLOCKED_BY_CLIENT'))) {
            const { loadFirebaseDiagnostics } = await import('../app.js');
            loadFirebaseDiagnostics();
        }
    }
}

/**
 * Reloads the current page of history
 * @param {Object} user - The current user
 */
async function reloadCurrentPage(user) {
    const startAfterDocForReload = historyPageDocSnapshotsStack.length > 1 
        ? historyPageDocSnapshotsStack[historyPageDocSnapshotsStack.length - 2] 
        : null;

    let qReload;
    const userSessionsRef = collection(db, "users", user.uid, "sesiones_entrenamiento");
    
    if (startAfterDocForReload) {
        qReload = query(userSessionsRef, orderBy("fecha", "desc"), startAfter(startAfterDocForReload), limit(HISTORY_PAGE_SIZE));
    } else {
        qReload = query(userSessionsRef, orderBy("fecha", "desc"), limit(HISTORY_PAGE_SIZE));
    }
    
    const snapshot = await getDocs(qReload);
    const reloadedSessions = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    
    allSessionsCache = [...reloadedSessions];
    renderHistoryList(reloadedSessions);

    if (snapshot.docs.length > 0) {
        historyPageFirstDocSnapshot = snapshot.docs[0];
        historyPageLastDocSnapshot = snapshot.docs[snapshot.docs.length - 1];
    } else {
        historyPageLastDocSnapshot = null;
    }
    
    updatePaginationButtons(snapshot.docs.length);
}

/**
 * Views the details of a session
 * @param {string} sessionId - The ID of the session to view
 */
async function viewSessionDetails(sessionId) {
    const user = getCurrentUser();
    if (!user) return;

    let sessionData = allSessionsCache.find(s => s.id === sessionId);
    
    if (!sessionData) {
        historyElements.loadingSpinner.classList.remove('hidden');
        try {
            const docRef = doc(db, "users", user.uid, "sesiones_entrenamiento", sessionId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                sessionData = { id: docSnap.id, ...docSnap.data() };
            } else {
                toast.error("No se encontraron los detalles.");
                return;
            }
        } catch (err) {
            logger.error("Error fetching session detail:", err);
            toast.error("Error al cargar detalles.");
            return;
        } finally {
            historyElements.loadingSpinner.classList.add('hidden');
        }
    }
    
    if (sessionData) {
        showSessionDetail(sessionData);
    }
}

/**
 * Handles clicks on the history list
 * @param {Event} event - The click event
 */
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

/**
 * Initializes the history manager
 * Sets up event listeners for history list and pagination
 */
export function initHistoryManager() {
    // History list click handler
    if (historyElements.list) {
        historyElements.list.addEventListener('click', handleHistoryListClick);
    }

    // Pagination button listeners
    if (historyElements.prevPageBtn) {
        historyElements.prevPageBtn.addEventListener('click', () => fetchAndRenderHistory('prev'));
    }
    if (historyElements.nextPageBtn) {
        historyElements.nextPageBtn.addEventListener('click', () => fetchAndRenderHistory('next'));
    }

    logger.debug('History manager initialized');
}

/**
 * Cleans up history manager
 */
export function destroyHistoryManager() {
    if (historyElements.list) {
        historyElements.list.removeEventListener('click', handleHistoryListClick);
    }
    
    resetPaginationState();
    logger.debug('History manager destroyed');
}

/**
 * Gets the current page number
 * @returns {number} Current page number
 */
export function getCurrentPageNumber() {
    return currentHistoryPageNumber;
}

/**
 * Gets the page size
 * @returns {number} Number of items per page
 */
export function getPageSize() {
    return HISTORY_PAGE_SIZE;
}

export default {
    fetchAndRenderHistory,
    getSessionsCache,
    getCurrentPageNumber,
    getPageSize,
    init: initHistoryManager,
    destroy: destroyHistoryManager
};
