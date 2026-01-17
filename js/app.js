/**
 * My Workout Tracker - Main Application
 * This is the main orchestrator that imports and initializes all modules
 */

import { db } from './firebase-config.js';
import { collection, addDoc, Timestamp, query, orderBy, getDocs, doc, getDoc, setDoc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getCurrentUser, handleLogout } from './auth.js';
import {
    showView, updateNav, formatDate, populateDaySelector, renderSessionView,
    renderManageRoutinesView, renderRoutineEditor, addExerciseToEditorForm,
    views, navButtons, dashboardElements, sessionElements, historyElements, sessionDetailModal,
    manageRoutinesElements, routineEditorElements, progressElements, showLoading, hideLoading,
    hideSessionDetail, registerViewInitializer
} from './ui.js';
import { storageManager } from './storage-manager.js';
import { initVersionControl, checkForBackupSession, forceAppUpdate, getCurrentVersion } from './version-manager.js';
import ThemeManager from './theme-manager.js';
import { initSetTimers, clearTimerData } from './timer.js';
import { initializeProgressView, loadExerciseList, updateChart, resetProgressView, invalidateProgressCache, handleExerciseChange } from './progress.js';

// Import new modules
import { logger } from './utils/logger.js';
import { toast } from './utils/notifications.js';
import { offlineManager } from './utils/offline-manager.js';
import { addViewListener, cleanupViewListeners } from './utils/event-manager.js';
import { initScrollToTop } from './modules/scroll-to-top.js';
import { initSettings } from './modules/settings.js';
import { initCalendar, updateCalendarView, hideCalendar } from './modules/calendar.js';
import { 
    saveInProgressSession, loadInProgressSession, clearInProgressSession,
    getCurrentRoutineForSession, setCurrentRoutineForSession,
    getSessionFormData, saveSessionData, checkAndOfferResumeSession,
    startSession, cancelSession, setupSessionAutoSave
} from './modules/session-manager.js';
import { initHistoryManager, fetchAndRenderHistory, getSessionsCache } from './modules/history-manager.js';

// Conditional loading of firebase diagnostics
let diagnosticsLoaded = false;
export async function loadFirebaseDiagnostics() {
    if (diagnosticsLoaded) return;
    try {
        await import('./firebase-diagnostics.js');
        diagnosticsLoaded = true;
        logger.info('Firebase diagnostics loaded due to connection issues');
    } catch (error) {
        logger.warn('Could not load firebase diagnostics:', error);
    }
}

// Initialize theme manager
let themeManager = null;

// State
let currentUserRoutines = [];

// --- App Initialization triggered by Auth ---
export async function initializeAppAfterAuth(user) {
    if (user) {
        // ThemeManager should already be initialized by DOMContentLoaded listener.
        // This is a fallback in case auth resolves before DOM is ready (rare edge case).
        if (!themeManager) {
            try {
                themeManager = new ThemeManager();
                logger.info('Theme manager initialized (auth fallback)');
            } catch (error) {
                logger.error('Theme manager initialization failed:', error);
            }
        }
        
        dashboardElements.currentDate.textContent = formatDate(new Date());
        await fetchUserRoutines(user);
        
        // Initialize exercise cache
        await initializeExerciseCache(user);
        
        // Initialize progress view
        initializeProgressView();
        
        checkAndOfferResumeSession(currentUserRoutines);
        
        // Initialize calendar with current month - with small delay to ensure DOM ready
        setTimeout(() => {
            updateCalendarView();
        }, 100);
    } else {
        setCurrentRoutineForSession(null);
        currentUserRoutines = [];
        populateDaySelector([]);
        sessionElements.form.reset();
        historyElements.list.innerHTML = '<li id="history-loading">Cargando historial...</li>';
        if (historyElements.paginationControls) historyElements.paginationControls.classList.add('hidden');
        manageRoutinesElements.list.innerHTML = '<li id="routines-loading">Cargando rutinas...</li>';
        hideCalendar();
    }
}

// Initializes exercise cache for the user
async function initializeExerciseCache(user) {
    if (!user) return;
    
    try {
        const { exerciseCache } = await import('./exercise-cache.js');
        
        // Clean old entries
        exerciseCache.cleanOldEntries();
        
        // Verify and rebuild cache automatically if necessary
        const wasRebuilt = await exerciseCache.validateAndRebuildCache(user.uid, db);
        
        if (!wasRebuilt) {
            // If not rebuilt, try to restore from Firebase backup if local cache is empty
            const stats = exerciseCache.getCacheStats();
            
            if (stats.exerciseCount === 0) {
                const restored = await exerciseCache.restoreFromFirebase(user.uid, db);
                
                if (!restored) {
                    // If no Firebase backup, build cache from existing history
                    await exerciseCache.buildCacheFromHistory(user.uid, db);
                }
            }
        }
        
        // Sync with Firebase in background (without blocking)
        exerciseCache.syncWithFirebase(user.uid, db).catch(error => {
            logger.warn('Error in initial cache sync:', error);
        });
        
    } catch (error) {
        logger.error('Error initializing exercise cache:', error);
    }
}

async function fetchUserRoutines(user) {
    if (!user) {
        currentUserRoutines = [];
        populateDaySelector([]);
        return;
    }

    if (!offlineManager.checkOnline()) {
        logger.warn('Offline: cannot load routines right now');
        toast.warning('Sin conexión. No se pueden cargar tus rutinas.');
        currentUserRoutines = [];
        populateDaySelector([]);
        return;
    }
    const routinesCollectionRef = collection(db, "users", user.uid, "routines");
    const q = query(routinesCollectionRef, orderBy("createdAt", "asc"));
    
    try {
        const querySnapshot = await getDocs(q);
        currentUserRoutines = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        populateDaySelector(currentUserRoutines);
        // If manage routines view is active, refresh it too
        if (!views.manageRoutines.classList.contains('hidden')) {
            renderManageRoutinesView(currentUserRoutines);
        }
    } catch (error) {
        logger.error("Error fetching user routines:", error);
        currentUserRoutines = [];
        populateDaySelector([]);
        // Load diagnostics on Firestore errors
        if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('ERR_BLOCKED_BY_CLIENT'))) {
            loadFirebaseDiagnostics();
        }
    }
}

// --- View-specific listener setup ---

function setupDashboardViewListeners() {
    cleanupViewListeners('dashboard');

    // Ensure calendar navigation handlers are attached for this view
    initCalendar();

    if (dashboardElements.daySelect) {
        addViewListener('dashboard', dashboardElements.daySelect, 'change', () => {
            if (dashboardElements.startSessionBtn) {
                dashboardElements.startSessionBtn.disabled = !dashboardElements.daySelect.value;
            }
        });
    } else {
        logger.error('Dashboard day select element not found');
    }

    if (dashboardElements.manageRoutinesLinkBtn) {
        addViewListener('dashboard', dashboardElements.manageRoutinesLinkBtn, 'click', () => {
            navButtons.manageRoutines?.click();
        });
    } else {
        logger.error('Manage routines link button not found');
    }

    if (dashboardElements.startSessionBtn) {
        addViewListener('dashboard', dashboardElements.startSessionBtn, 'click', () => {
            const selectedRoutineId = dashboardElements.daySelect?.value;
            if (selectedRoutineId) {
                startSession(selectedRoutineId, currentUserRoutines);
            }
        });
    } else {
        logger.error('Start session button not found');
    }
}

function setupSessionViewListeners() {
    cleanupViewListeners('session');

    if (sessionElements.saveBtn) {
        addViewListener('session', sessionElements.saveBtn, 'click', () => {
            saveSessionData(() => {
                fetchAndRenderHistory();
            });
        });
    } else {
        logger.error('Session save button not found');
    }

    if (sessionElements.cancelBtn) {
        addViewListener('session', sessionElements.cancelBtn, 'click', cancelSession);
    } else {
        logger.error('Session cancel button not found');
    }
}

function setupManageRoutinesViewListeners() {
    cleanupViewListeners('manageRoutines');

    if (manageRoutinesElements.addNewBtn) {
        addViewListener('manageRoutines', manageRoutinesElements.addNewBtn, 'click', () => {
            renderRoutineEditor(null);
        });
    } else {
        logger.error('Add new routine button not found');
    }

    if (manageRoutinesElements.exportRoutinesBtn) {
        addViewListener('manageRoutines', manageRoutinesElements.exportRoutinesBtn, 'click', async () => {
            const user = getCurrentUser();
            if (!user) {
                toast.error('Debes iniciar sesión para realizar esta acción.');
                return;
            }

            if (!confirm('¿Deseas exportar todas tus rutinas al portapapeles? Se copiará un JSON con todas tus rutinas.')) {
                return;
            }

            showLoading(manageRoutinesElements.exportRoutinesBtn, 'Exportando...');
            try {
                if (currentUserRoutines.length === 0) {
                    toast.warning('No tienes rutinas para exportar.');
                    return;
                }

                const exportData = {
                    exportDate: new Date().toISOString(),
                    totalRoutines: currentUserRoutines.length,
                    routines: currentUserRoutines.map(routine => ({
                        id: routine.id,
                        name: routine.name,
                        exercises: routine.exercises,
                        createdAt: routine.createdAt?.toDate?.()?.toISOString() || null,
                        updatedAt: routine.updatedAt?.toDate?.()?.toISOString() || null
                    }))
                };

                const jsonString = JSON.stringify(exportData, null, 2);
                await navigator.clipboard.writeText(jsonString);
                toast.success(`${currentUserRoutines.length} rutina(s) exportadas al portapapeles exitosamente!`);
                
            } catch (error) {
                logger.error('Error exporting routines:', error);
                if (error.name === 'NotAllowedError') {
                    toast.error('Error: No se pudo acceder al portapapeles. Verifica los permisos del navegador.');
                } else {
                    toast.error('Error al exportar las rutinas.');
                }
            } finally {
                hideLoading(manageRoutinesElements.exportRoutinesBtn);
            }
        });
    } else {
        logger.error('Export routines button not found for attaching event listener.');
    }

    if (manageRoutinesElements.deleteAllRoutinesBtn) {
        addViewListener('manageRoutines', manageRoutinesElements.deleteAllRoutinesBtn, 'click', async () => {
            const user = getCurrentUser();
            if (!user) {
                toast.error('Debes iniciar sesión para realizar esta acción.');
                return;
            }

            if (currentUserRoutines.length === 0) {
                toast.warning('No tienes rutinas para borrar.');
                return;
            }

            const confirmMessage = `⚠️ ATENCIÓN: Vas a borrar TODAS tus ${currentUserRoutines.length} rutina(s) permanentemente.\n\n¿Estás completamente seguro? Esta acción NO se puede deshacer.`;
            
            if (!confirm(confirmMessage)) {
                return;
            }

            const finalConfirm = prompt('Para confirmar, escribe "BORRAR TODO" (en mayúsculas):');
            if (finalConfirm !== 'BORRAR TODO') {
                toast.info('Cancelado. No se borraron las rutinas.');
                return;
            }

            showLoading(manageRoutinesElements.deleteAllRoutinesBtn, 'Borrando...');
            try {
                const batch = writeBatch(db);
                let routinesDeletedCount = 0;

                for (const routine of currentUserRoutines) {
                    const routineDocRef = doc(db, 'users', user.uid, 'routines', routine.id);
                    batch.delete(routineDocRef);
                    routinesDeletedCount++;
                }

                if (routinesDeletedCount > 0) {
                    await batch.commit();
                    toast.success(`${routinesDeletedCount} rutina(s) borradas exitosamente.`);
                    
                    await fetchUserRoutines(user);
                    if (!views.manageRoutines.classList.contains('hidden')) {
                        renderManageRoutinesView(currentUserRoutines);
                    }
                }
            } catch (error) {
                logger.error('Error deleting all routines:', error);
                toast.error('Error al borrar las rutinas.');
                if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('ERR_BLOCKED_BY_CLIENT'))) {
                    loadFirebaseDiagnostics();
                }
            } finally {
                hideLoading(manageRoutinesElements.deleteAllRoutinesBtn);
            }
        });
    } else {
        logger.error('Delete all routines button not found for attaching event listener.');
    }
}

function setupRoutineEditorViewListeners() {
    cleanupViewListeners('routineEditor');

    if (routineEditorElements.addExerciseBtn) {
        addViewListener('routineEditor', routineEditorElements.addExerciseBtn, 'click', () => {
            addExerciseToEditorForm(null);
        });
    }

    if (routineEditorElements.form) {
        addViewListener('routineEditor', routineEditorElements.form, 'submit', async (event) => {
            event.preventDefault();
            const user = getCurrentUser();
            if (!user) {
                toast.error('Debes iniciar sesión para guardar rutinas.');
                return;
            }

            const routineId = routineEditorElements.routineIdInput.value;
            const routineName = routineEditorElements.routineNameInput.value.trim();
            if (!routineName) {
                toast.warning('El nombre de la rutina no puede estar vacío.');
                return;
            }

            const exercises = [];
            const exerciseEditors = routineEditorElements.exercisesContainer.querySelectorAll('.routine-exercise-editor');
            exerciseEditors.forEach(editor => {
                const name = editor.querySelector('input[name="ex-name"]').value.trim();
                const type = editor.querySelector('select[name="ex-type"]').value;
                const notes = editor.querySelector('textarea[name="ex-notes"]').value.trim();
                let sets = '', reps = '', duration = '';

                if (type === 'strength') {
                    sets = parseInt(editor.querySelector('input[name="ex-sets"]').value) || 0;
                    reps = editor.querySelector('input[name="ex-reps"]').value.trim();
                } else if (type === 'cardio') {
                    duration = editor.querySelector('input[name="ex-duration"]').value.trim();
                }
                if (name) {
                    exercises.push({ name, type, sets, reps, duration, notes });
                }
            });

            if (exercises.length === 0) {
                toast.warning('Debes añadir al menos un ejercicio a la rutina.');
                return;
            }

            const routineData = {
                name: routineName,
                exercises: exercises,
                updatedAt: Timestamp.now()
            };

            showLoading(routineEditorElements.saveRoutineBtn, 'Guardando rutina...');
            try {
                if (routineId) {
                    await setDoc(doc(db, 'users', user.uid, 'routines', routineId), routineData, { merge: true });
                } else {
                    routineData.createdAt = Timestamp.now();
                    await addDoc(collection(db, 'users', user.uid, 'routines'), routineData);
                }
                toast.success('Rutina guardada con éxito!');
                await fetchUserRoutines(user);
                showView('manageRoutines');
                renderManageRoutinesView(currentUserRoutines);
            } catch (error) {
                logger.error('Error saving routine:', error);
                toast.error('Error al guardar la rutina.');
                if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('ERR_BLOCKED_BY_CLIENT'))) {
                    loadFirebaseDiagnostics();
                }
            } finally {
                hideLoading(routineEditorElements.saveRoutineBtn);
            }
        });
    }

    if (routineEditorElements.cancelEditRoutineBtn) {
        addViewListener('routineEditor', routineEditorElements.cancelEditRoutineBtn, 'click', () => {
            if (confirm('¿Cancelar edición? Los cambios no guardados se perderán.')) {
                showView('manageRoutines');
            }
        });
    }

    if (routineEditorElements.deleteRoutineBtn) {
        addViewListener('routineEditor', routineEditorElements.deleteRoutineBtn, 'click', async () => {
            const routineId = routineEditorElements.deleteRoutineBtn.dataset.routineId;
            const user = getCurrentUser();
            if (!routineId || !user) return;

            const routineToDelete = currentUserRoutines.find(r => r.id === routineId);
            if (!routineToDelete) {
                toast.error('Rutina no encontrada para eliminar.');
                return;
            }

            if (confirm(`¿Estás seguro de que quieres eliminar la rutina "${routineToDelete.name}"? Esta acción no se puede deshacer.`)) {
                showLoading(routineEditorElements.deleteRoutineBtn, 'Eliminando...');
                try {
                    await deleteDoc(doc(db, 'users', user.uid, 'routines', routineId));
                    toast.success('Rutina eliminada con éxito.');
                    await fetchUserRoutines(user);
                    showView('manageRoutines');
                    renderManageRoutinesView(currentUserRoutines);
                } catch (error) {
                    logger.error('Error deleting routine:', error);
                    toast.error('Error al eliminar la rutina.');
                    if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('ERR_BLOCKED_BY_CLIENT'))) {
                        loadFirebaseDiagnostics();
                    }
                } finally {
                    hideLoading(routineEditorElements.deleteRoutineBtn);
                }
            }
        });
    }
}

function setupHistoryViewListeners() {
    // Ensure clean slate for history listeners
    cleanupViewListeners('history');
    initHistoryManager();
}

function setupProgressViewListeners() {
    cleanupViewListeners('progress');
    
    // Add event listeners using the event manager
    if (progressElements.exerciseSelect) {
        addViewListener('progress', progressElements.exerciseSelect, 'change', handleExerciseChange);
    }
    
    if (progressElements.metricSelect) {
        addViewListener('progress', progressElements.metricSelect, 'change', updateChart);
    }
    
    if (progressElements.periodSelect) {
        addViewListener('progress', progressElements.periodSelect, 'change', updateChart);
    }
}

// Register view initializers so they run whenever a view is shown
registerViewInitializer('dashboard', setupDashboardViewListeners);
registerViewInitializer('session', setupSessionViewListeners);
registerViewInitializer('manageRoutines', setupManageRoutinesViewListeners);
registerViewInitializer('routineEditor', setupRoutineEditorViewListeners);
registerViewInitializer('history', setupHistoryViewListeners);
registerViewInitializer('progress', setupProgressViewListeners);

// --- Event Listeners ---

// Navigation
navButtons.dashboard.addEventListener('click', () => {
    showView('dashboard');
    fetchUserRoutines(getCurrentUser());
    checkAndOfferResumeSession(currentUserRoutines);
    updateCalendarView();
});
navButtons.manageRoutines.addEventListener('click', () => {
    showView('manageRoutines');
    renderManageRoutinesView(currentUserRoutines);
});
navButtons.history.addEventListener('click', () => {
    showView('history');
    fetchAndRenderHistory();
});
navButtons.progress.addEventListener('click', () => {
    showView('progress');
    loadProgressData();
});
navButtons.logout.addEventListener('click', handleLogout);

// Set up auto-save for session form
setupSessionAutoSave();

// Session detail modal
if (sessionDetailModal.closeBtn) {
    sessionDetailModal.closeBtn.addEventListener('click', hideSessionDetail);
} else {
    logger.error('Session detail modal close button not found');
}

if (sessionDetailModal.modal) {
    window.addEventListener('click', (event) => {
        if (event.target === sessionDetailModal.modal) hideSessionDetail();
    });
} else {
    logger.error('Session detail modal not found');
}

// Event listener for edit clicks bubbled up from ui.js
document.addEventListener('editRoutineClicked', (event) => {
    const routineId = event.detail.routineId;
    const routineToEdit = currentUserRoutines.find(r => r.id === routineId);
    if (routineToEdit) {
        renderRoutineEditor(routineToEdit);
    } else {
        toast.error("No se pudo encontrar la rutina para editar.");
    }
});

// Manage Routines - duplicate listener removed (already exists above)


// PWA Service Worker and Storage Manager Initialization
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        // Initialize version control first - this handles app updates and cache management
        try {
            const versionResult = await initVersionControl();
            logger.info('Version control initialized:', versionResult);
            
            // Check for backup session that might need restoration after update
            checkForBackupSession();
        } catch (error) {
            logger.error('Version control initialization failed:', error);
        }

        // Initialize modern storage management
        try {
            await storageManager.initialize();
        } catch (error) {
            logger.error('Storage manager initialization failed:', error);
        }

        // Use a relative path that works regardless of deployment location
        const swPath = new URL('sw.js', window.location.href).pathname;
        navigator.serviceWorker.register(swPath)
            .then(reg => logger.info('ServiceWorker registered.', reg))
            .catch(err => {
                logger.error('ServiceWorker registration failed:', err);
                if (err.name === 'TypeError' && err.message.includes('Failed to register') && err.message.includes('404')) {
                    logger.warn('This may be due to a missing service worker file or an ad blocker.');
                }
            });
    });
    
    // Add an error handler for Firestore connection errors
    window.addEventListener('error', function(event) {
        const errorText = event.message || '';
        if (errorText.includes('ERR_BLOCKED_BY_CLIENT') || 
            (event.filename && event.filename.includes('firestore.googleapis.com'))) {
            logger.warn('Detected possible content blocker interfering with Firebase connections. ' +
                        'This may affect app functionality.');
            loadFirebaseDiagnostics();
        }
    });
}

// --- Version Management UI ---
const versionInfoElement = document.getElementById('app-version-info');
const forceUpdateBtn = document.getElementById('force-update-btn');

if (versionInfoElement) {
    (async () => {
        try {
            const version = await getCurrentVersion();
            versionInfoElement.textContent = `v${version}`;
        } catch (error) {
            logger.error('Error getting version for UI:', error);
            versionInfoElement.textContent = 'v1.1.0';
        }
    })();
}

if (forceUpdateBtn) {
    forceUpdateBtn.addEventListener('click', async () => {
        if (confirm('¿Estás seguro de que quieres forzar la actualización de la aplicación? Esto limpiará el caché y recargará la página.')) {
            await forceAppUpdate();
        }
    });
}

// SINGLE POINT OF INITIALIZATION for ThemeManager
document.addEventListener('DOMContentLoaded', () => {
    if (!themeManager) {
        try {
            themeManager = new ThemeManager();
            logger.info('Theme manager initialized');
        } catch (error) {
            logger.error('Theme manager initialization failed:', error);
        }
    }
    
    // Initialize offline detection
    offlineManager.init();
    
    // Initialize modules
    initScrollToTop();
    initSettings();
});

showView('auth');

// --- Progress Functions ---

/**
 * Loads data for the progress view
 */
async function loadProgressData() {
    try {
        await loadExerciseList();
    } catch (error) {
        logger.error('Error loading progress data:', error);
        resetProgressView();
    }
}

// Export for module compatibility
export { currentUserRoutines, fetchUserRoutines };
