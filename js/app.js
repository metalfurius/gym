import { db } from './firebase-config.js'; // auth is handled in auth.js
import { collection, addDoc, Timestamp, query, orderBy, getDocs, doc, getDoc, setDoc, deleteDoc, writeBatch, where,
    limit, startAfter } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getCurrentUser, handleLogout } from './auth.js'; // Removed login/signup handlers, they are in auth.js
import {
    showView, updateNav, formatDate, populateDaySelector, renderSessionView,
    renderHistoryList, showSessionDetail, hideSessionDetail, renderManageRoutinesView,
    renderRoutineEditor, addExerciseToEditorForm,
    views, navButtons, authElements, dashboardElements, sessionElements, historyElements, sessionDetailModal,
    manageRoutinesElements, routineEditorElements, progressElements, showLoading, hideLoading,
    calendarElements, applyHistoryFilters 
} from './ui.js';
import { storageManager } from './storage-manager.js';
import { initVersionControl, checkForBackupSession, forceAppUpdate, getCurrentVersion } from './version-manager.js';
import ThemeManager from './theme-manager.js';
import { initSetTimers, clearTimerData } from './timer.js';
import { initializeProgressView, loadExerciseList, updateChart, resetProgressView, invalidateProgressCache } from './progress.js';

// Conditional loading of firebase diagnostics
let diagnosticsLoaded = false;
export async function loadFirebaseDiagnostics() {
    if (diagnosticsLoaded) return;
    try {
        await import('./firebase-diagnostics.js');
        diagnosticsLoaded = true;
        console.log('Firebase diagnostics loaded due to connection issues');
    } catch (error) {
        console.warn('Could not load firebase diagnostics:', error);
    }
}

// Inicializar el gestor de temas
let themeManager = null;

// --- Session Storage Functions (moved from store.js) ---
const IN_PROGRESS_SESSION_KEY = 'gymTracker_inProgressSession';

export function saveInProgressSession(routineId, data) {
    const sessionToStore = {
        routineId: routineId,
        data: data,
        timestamp: Date.now()
    };
    localStorage.setItem(IN_PROGRESS_SESSION_KEY, JSON.stringify(sessionToStore));
}

export function loadInProgressSession() {
    const storedSession = localStorage.getItem(IN_PROGRESS_SESSION_KEY);
    if (storedSession) {
        const parsed = JSON.parse(storedSession);
        return parsed;
    }
    return null;
}

export function clearInProgressSession() {
    localStorage.removeItem(IN_PROGRESS_SESSION_KEY);
}

// --- Utility Functions ---
/**
 * Convierte un Firebase Timestamp a una fecha string en formato YYYY-MM-DD 
 * usando la zona horaria local (evita problemas con toISOString que usa UTC)
 */
function timestampToLocalDateString(timestamp) {
    if (!timestamp || !timestamp.toDate) return null;
    const localDate = timestamp.toDate();
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// --- State ---
const MIN_CALENDAR_YEAR = 2025;
let currentCalendarYear = new Date().getFullYear();
let currentCalendarMonth = new Date().getMonth(); // 0-11 (enero-diciembre)
let currentRoutineForSession = null; // Stores the full routine object for the active session
let currentUserRoutines = []; // Cache for user's routines
let allSessionsCache = []; 

// Estado para paginación del historial
let historyPageFirstDocSnapshot = null; // Snapshot del primer documento de la página actual (para "Anterior" si se implementa con endBefore)
let historyPageLastDocSnapshot = null;  // Snapshot del último documento de la página actual (para "Siguiente")
let historyPageDocSnapshotsStack = []; // Para una paginación "Anterior" más simple
const HISTORY_PAGE_SIZE = 10; // Número de sesiones por página
let currentHistoryPageNumber = 1;

// --- App Initialization triggered by Auth ---
export async function initializeAppAfterAuth(user) {
    if (user) {
        // ThemeManager should already be initialized by DOMContentLoaded listener.
        // This is a fallback in case auth resolves before DOM is ready (rare edge case).
        if (!themeManager) {
            try {
                themeManager = new ThemeManager();
                console.log('Theme manager initialized (auth fallback)');
            } catch (error) {
                console.error('Theme manager initialization failed:', error);
            }
        }
        
        dashboardElements.currentDate.textContent = formatDate(new Date());
        await fetchUserRoutines(user);
        
        // Inicializar cache de ejercicios
        await initializeExerciseCache(user);
        
        // Inicializar vista de progreso
        initializeProgressView();
        
        checkAndOfferResumeSession();
        
        // Inicializar calendario con el mes actual - con un pequeño delay para asegurar DOM ready
        setTimeout(() => {
            const today = new Date();
            currentCalendarYear = today.getFullYear();
            currentCalendarMonth = today.getMonth();
            
            // Asegurar que no se va por debajo del año mínimo
            if (currentCalendarYear < MIN_CALENDAR_YEAR) {
                currentCalendarYear = MIN_CALENDAR_YEAR;
                currentCalendarMonth = 0; // Enero del año mínimo
            }
            
            updateCalendarView();
        }, 100); // Pequeño delay para asegurar que el DOM esté completamente cargado
    } else {
        currentRoutineForSession = null;
        currentUserRoutines = [];
        populateDaySelector([]); 
        sessionElements.form.reset();
        historyElements.list.innerHTML = '<li id="history-loading">Cargando historial...</li>';
        if (historyElements.paginationControls) historyElements.paginationControls.classList.add('hidden');
        manageRoutinesElements.list.innerHTML = '<li id="routines-loading">Cargando rutinas...</li>';
        const container = document.getElementById('activity-calendar-container');
        if (container) container.classList.add('hidden');
    }
}

// Initializes exercise cache for the user
async function initializeExerciseCache(user) {
    if (!user) return;
      try {
        const { exerciseCache } = await import('./exercise-cache.js');
          // Limpiar entradas antiguas
        exerciseCache.cleanOldEntries();
        
        // Verificar y reconstruir automáticamente el cache si es necesario
        const wasRebuilt = await exerciseCache.validateAndRebuildCache(user.uid, db);
        
        if (!wasRebuilt) {
            // Si no se reconstruyó, intentar restaurar desde Firebase backup si el cache local está vacío
            const stats = exerciseCache.getCacheStats();
            
            if (stats.exerciseCount === 0) {
                const restored = await exerciseCache.restoreFromFirebase(user.uid, db);
                
                if (!restored) {
                    // Si no hay backup en Firebase, construir cache desde historial existente
                    await exerciseCache.buildCacheFromHistory(user.uid, db);
                }
            }
        }
          // Sincronizar con Firebase en segundo plano (sin bloquear)
        exerciseCache.syncWithFirebase(user.uid, db).catch(error => {
            console.warn('Error en sincronización inicial del cache:', error);
        });
        
    } catch (error) {
        console.error('❌ Error inicializando cache de ejercicios:', error);
    }
}


async function fetchUserRoutines(user) {
    if (!user) {
        currentUserRoutines = [];
        populateDaySelector([]);
        return;
    }
    const routinesCollectionRef = collection(db, "users", user.uid, "routines");
    const q = query(routinesCollectionRef, orderBy("createdAt", "asc")); // Or orderBy name
    
    try {
        const querySnapshot = await getDocs(q);
        currentUserRoutines = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        populateDaySelector(currentUserRoutines);
        // If manage routines view is active, refresh it too
        if (!views.manageRoutines.classList.contains('hidden')) {
            renderManageRoutinesView(currentUserRoutines);
        }    } catch (error) {
        console.error("Error fetching user routines: ", error);
        currentUserRoutines = [];
        populateDaySelector([]);
        // Load diagnostics on Firestore errors
        if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('ERR_BLOCKED_BY_CLIENT'))) {
            loadFirebaseDiagnostics();
        }
    }
}

function checkAndOfferResumeSession() {
    const inProgress = loadInProgressSession();
    const user = getCurrentUser();

    // Referencia al div contenedor
    const resumeArea = dashboardElements.resumeSessionArea; // Asumiendo que lo tienes en dashboardElements

    if (inProgress && user) {
        const routine = currentUserRoutines.find(r => r.id === inProgress.routineId);        if (routine) {
            dashboardElements.resumeSessionInfo.textContent = `Tienes una sesión de "${routine.name}" sin guardar.`;
            dashboardElements.resumeSessionBtn.classList.remove('hidden');
            resumeArea.classList.add('visible'); // <<< AÑADIR CLASE VISIBLE
            
            dashboardElements.resumeSessionBtn.onclick = async () => {
                currentRoutineForSession = routine;
                await renderSessionView(routine, inProgress.data);
                dashboardElements.resumeSessionBtn.classList.add('hidden');
                dashboardElements.resumeSessionInfo.textContent = '';
                resumeArea.classList.remove('visible'); // <<< QUITAR CLASE VISIBLE
            };
        } else { // Routine might have been deleted
            clearInProgressSession();
            dashboardElements.resumeSessionBtn.classList.add('hidden');
            dashboardElements.resumeSessionInfo.textContent = '';
            resumeArea.classList.remove('visible'); // <<< QUITAR CLASE VISIBLE
        }
    } else {
        dashboardElements.resumeSessionBtn.classList.add('hidden');
        dashboardElements.resumeSessionInfo.textContent = '';
        resumeArea.classList.remove('visible'); // <<< QUITAR CLASE VISIBLE
    }
}

// --- Event Listeners ---

// Navigation
navButtons.dashboard.addEventListener('click', () => {
    showView('dashboard');
    fetchUserRoutines(getCurrentUser());
    checkAndOfferResumeSession();
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


// Dashboard
if (dashboardElements.daySelect) {
    dashboardElements.daySelect.addEventListener('change', () => {
        if (dashboardElements.startSessionBtn) {
            dashboardElements.startSessionBtn.disabled = !dashboardElements.daySelect.value;
        }
    });
} else {
    console.error('Dashboard day select element not found');
}

if (dashboardElements.manageRoutinesLinkBtn) {
    dashboardElements.manageRoutinesLinkBtn.addEventListener('click', () => {
        navButtons.manageRoutines.click(); // Simulate click on nav button
    });
} else {
    console.error('Manage routines link button not found');
}

if (dashboardElements.startSessionBtn) {
    dashboardElements.startSessionBtn.addEventListener('click', () => {
        const selectedRoutineId = dashboardElements.daySelect.value;
        if (selectedRoutineId) {
            const selectedRoutine = currentUserRoutines.find(r => r.id === selectedRoutineId);
            if (!selectedRoutine) {
                alert("Rutina no encontrada. Por favor, selecciona otra.");
                return;
            }

        const inProgress = loadInProgressSession();
        if (inProgress && inProgress.routineId !== selectedRoutineId) {
            if (!confirm("Tienes otra sesión en progreso. ¿Descartarla y empezar esta nueva?")) {
                return;
            }
            clearInProgressSession();
        }        currentRoutineForSession = selectedRoutine;
        renderSessionView(selectedRoutine, inProgress && inProgress.routineId === selectedRoutineId ? inProgress.data : null);
        dashboardElements.resumeSessionBtn.classList.add('hidden');
        dashboardElements.resumeSessionInfo.textContent = '';
    }
});
} else {
    console.error('Start session button not found');
}

// Session
if (sessionElements.saveBtn) {
    sessionElements.saveBtn.addEventListener('click', saveSessionData);
} else {
    console.error('Session save button not found');
}

if (sessionElements.cancelBtn) {
    sessionElements.cancelBtn.addEventListener('click', () => {
        if (confirm("¿Estás seguro de que quieres cancelar? Se perderán los datos no guardados.")) {
            sessionElements.form.reset();
            clearInProgressSession();
            // Limpiar los datos del temporizador
            clearTimerData();
            currentRoutineForSession = null;
            showView('dashboard');
        }
    });
} else {
    console.error('Session cancel button not found');
}

if (sessionElements.exerciseList) {
    // Listen for input events to save form data
    sessionElements.exerciseList.addEventListener('input', () => {
        if (!currentRoutineForSession) return;
        const formData = getSessionFormData();
        saveInProgressSession(currentRoutineForSession.id, formData);
    });
    
    // Listen for timer events to save timer data
    sessionElements.exerciseList.addEventListener('click', (e) => {
        if (e.target.classList.contains('timer-button') && currentRoutineForSession) {
            // Add a small delay to let the timer update
            setTimeout(() => {
                const formData = getSessionFormData();
                saveInProgressSession(currentRoutineForSession.id, formData);
            }, 100);
        }
    });
} else {
    console.error('Session exercise list not found');
}

function getSessionFormData() {
    if (!currentRoutineForSession) return {};
    
    // Obtener y normalizar el peso del usuario
    const userWeightValue = document.getElementById('user-weight').value;
    let pesoUsuario = null;
    if (userWeightValue) {
        const normalizedWeight = userWeightValue.replace(',', '.');
        const parsedWeight = parseFloat(normalizedWeight);
        if (!isNaN(parsedWeight)) {
            pesoUsuario = Math.round(parsedWeight * 10) / 10; // Redondear a 1 decimal
        }
    }
    
    const sessionData = {
        ejercicios: [],
        pesoUsuario: pesoUsuario
    };
    const exerciseBlocks = sessionElements.exerciseList.querySelectorAll('.exercise-block');
    exerciseBlocks.forEach(block => {
        const exerciseIndex = parseInt(block.dataset.exerciseIndex);
        const exerciseFromRoutine = currentRoutineForSession.exercises[exerciseIndex];
        
        const exerciseEntry = {
            nombreEjercicio: exerciseFromRoutine.name,
            tipoEjercicio: exerciseFromRoutine.type, // Store the type
            // Store target info for reference, though not strictly needed if routine doesn't change
            objetivoSets: exerciseFromRoutine.sets, 
            objetivoReps: exerciseFromRoutine.reps,
            objetivoDuracion: exerciseFromRoutine.duration,
            sets: [], // For strength exercises
            notasEjercicio: block.querySelector(`textarea[name="notes-${exerciseIndex}"]`).value.trim() || ''
        };

        if (exerciseFromRoutine.type === 'strength') {
            const setRows = block.querySelectorAll('.set-row');            setRows.forEach((row, setIndex) => {
                const weightInput = row.querySelector(`input[name="weight-${exerciseIndex}-${setIndex}"]`);
                const repsInput = row.querySelector(`input[name="reps-${exerciseIndex}-${setIndex}"]`);
                if (weightInput.value || repsInput.value) {
                    // Normalizar peso: reemplazar coma por punto y redondear a 1 decimal
                    let peso = 0;
                    if (weightInput.value) {
                        const normalizedWeight = weightInput.value.replace(',', '.');
                        const parsedWeight = parseFloat(normalizedWeight);
                        if (!isNaN(parsedWeight)) {
                            peso = Math.round(parsedWeight * 10) / 10;
                        }
                    }
                    
                    exerciseEntry.sets.push({
                        peso: peso,
                        reps: parseInt(repsInput.value, 10) || 0,
                        // Add the timer data if it exists
                        tiempoDescanso: document.getElementById(`timer-display-${exerciseIndex}-${setIndex}`)?.textContent || '00:00'
                    });
                }
            });
        }
        // For cardio, primary data is often in notes (e.g., "20 min, 5km").
        // If specific fields were added for cardio input, collect them here.

        // Only add exercise if it has sets (for strength) or notes
        if ((exerciseFromRoutine.type === 'strength' && exerciseEntry.sets.length > 0) || exerciseEntry.notasEjercicio) {
            sessionData.ejercicios.push(exerciseEntry);
        } else if (exerciseFromRoutine.type === 'cardio' && exerciseEntry.notasEjercicio) {
             sessionData.ejercicios.push(exerciseEntry);
        }
    });
    return sessionData;
}

async function saveSessionData(event) {
    const user = getCurrentUser();
    if (!currentRoutineForSession || !user) {
        alert("Error: No hay rutina activa o no has iniciado sesión.");
        return;
    }
    const sessionDataFromForm = getSessionFormData();
    if (sessionDataFromForm.ejercicios.length === 0) {
        alert("No se registraron datos para ningún ejercicio. Introduce datos o notas para guardar la sesión.");
        return;
    }    const finalSessionData = {
        fecha: Timestamp.now(),
        routineId: currentRoutineForSession.id, // Link to the routine used
        nombreEntrenamiento: currentRoutineForSession.name,
        userId: user.uid,
        ejercicios: sessionDataFromForm.ejercicios,
        pesoUsuario: sessionDataFromForm.pesoUsuario ? parseFloat(sessionDataFromForm.pesoUsuario) : null
    };    showLoading(sessionElements.saveBtn, 'Guardando...');
    try {
        const userSessionsCollectionRef = collection(db, "users", user.uid, "sesiones_entrenamiento");
        await addDoc(userSessionsCollectionRef, finalSessionData);        
        
        // Actualizar cache de ejercicios con los datos de la nueva sesión
        const { exerciseCache } = await import('./exercise-cache.js');        
        exerciseCache.processCompletedSession(finalSessionData);
        
        // Invalidar caché de progreso para forzar recarga con nuevos datos
        invalidateProgressCache();
        
        // Sincronizar cache con Firebase para backup (sin bloquear el flujo)
        exerciseCache.syncWithFirebase(user.uid, db).catch(error => {
            console.warn('Error sincronizando cache de ejercicios:', error);
        });
        
        alert("¡Sesión guardada con éxito!");
        sessionElements.form.reset();
        clearInProgressSession();
        // Limpiar los datos del temporizador
        clearTimerData();
        currentRoutineForSession = null;
        showView('dashboard');
        fetchAndRenderHistory();} catch (e) {
        console.error("Error adding document: ", e);
        alert("Error al guardar la sesión.");
        // Load diagnostics on Firestore errors
        if (e.message && (e.message.includes('Failed to fetch') || e.message.includes('ERR_BLOCKED_BY_CLIENT'))) {
            loadFirebaseDiagnostics();
        }
    } finally {
        hideLoading(sessionElements.saveBtn);
    }
}

// History
async function fetchAndRenderHistory(direction = 'initial') { // direction: 'initial', 'next', 'prev'
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
            historyPageDocSnapshotsStack = []; // Resetear el stack para la navegación "anterior"
            currentHistoryPageNumber = 1;
            q = query(userSessionsCollectionRef, orderBy("fecha", "desc"), limit(HISTORY_PAGE_SIZE));
        } else if (direction === 'next' && historyPageLastDocSnapshot) {
            q = query(userSessionsCollectionRef, orderBy("fecha", "desc"), startAfter(historyPageLastDocSnapshot), limit(HISTORY_PAGE_SIZE));
            currentHistoryPageNumber++;
        } else if (direction === 'prev') {
            if (historyPageDocSnapshotsStack.length > 0) { // Hay páginas anteriores en el stack
                // El stack guarda el *primer* documento de cada página cargada.
                // Para ir a la página N-1, necesitamos el primer doc de la página N-1.
                // Si estamos en la página P, el stack tiene [firstDocP0, firstDocP1, ..., firstDocP(P-1)]
                // donde P0 es un null para la primera página.
                // Quitamos el de la página actual (que se volverá a añadir si hay resultados)
                historyPageDocSnapshotsStack.pop(); 
                const prevPageStartAfterDoc = historyPageDocSnapshotsStack.pop(); // Este es el doc para startAfter de la página anterior
                                                                            // o null si es la primera página.
                
                if (prevPageStartAfterDoc) {
                    q = query(userSessionsCollectionRef, orderBy("fecha", "desc"), startAfter(prevPageStartAfterDoc), limit(HISTORY_PAGE_SIZE));
                } else { // Volviendo a la primera página
                    q = query(userSessionsCollectionRef, orderBy("fecha", "desc"), limit(HISTORY_PAGE_SIZE));
                }
                currentHistoryPageNumber--;
            } else { // No hay más páginas anteriores o estado inválido
                historyElements.loadingSpinner.classList.add('hidden');
                if (historyElements.prevPageBtn) historyElements.prevPageBtn.disabled = true;
                return; 
            }
        } else { // Caso inválido o final de la paginación "siguiente" sin lastDoc
            historyElements.loadingSpinner.classList.add('hidden');
            if (direction === 'next' && historyElements.nextPageBtn) historyElements.nextPageBtn.disabled = true;
            return;
        }

        const querySnapshot = await getDocs(q);
        const sessionsForList = [];
        querySnapshot.forEach((docSnap) => {
            sessionsForList.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Guardar referencias para paginación
        if (querySnapshot.docs.length > 0) {
            const firstDocOfCurrentPage = querySnapshot.docs[0];
            
            if (direction === 'initial') {
                historyPageDocSnapshotsStack.push(null); // Marcador para "antes de la primera página"
            }
            // Añadir el primer doc de la página actual al stack (si no es 'prev' que ya lo manejó)
            // O si es 'prev' pero trajo resultados (lo que significa que no estamos al principio del todo)
            if (direction !== 'prev' || (direction === 'prev' && querySnapshot.docs.length > 0)) {
                 historyPageDocSnapshotsStack.push(firstDocOfCurrentPage);
            }


            historyPageFirstDocSnapshot = firstDocOfCurrentPage;
            historyPageLastDocSnapshot = querySnapshot.docs[querySnapshot.docs.length - 1];
        } else {
            // No hay más documentos en esta dirección
            if (direction === 'next') historyPageLastDocSnapshot = null; 
            // Si es 'prev' y no hay docs, significa que hemos retrocedido a "antes de la primera página"
            // o un error lógico. El botón 'prev' debería estar deshabilitado.
            if (direction === 'prev' && historyPageDocSnapshotsStack.length <=1) { // Solo queda el 'null' o está vacío
                 historyPageDocSnapshotsStack = [null]; // Asegurar estado base
            }
        }
        
        allSessionsCache = [...sessionsForList]; // Cachear solo las sesiones de la página actual

        renderHistoryList(sessionsForList); // Pasa las sesiones de la página actual
        
        // Actualizar estado de botones de paginación
        if (historyElements.prevPageBtn) {
            historyElements.prevPageBtn.disabled = currentHistoryPageNumber === 1 || historyPageDocSnapshotsStack.length <= 1;
        }
        if (historyElements.nextPageBtn) {
            historyElements.nextPageBtn.disabled = querySnapshot.docs.length < HISTORY_PAGE_SIZE || sessionsForList.length === 0;
        }
        if (historyElements.pageInfo) {
            historyElements.pageInfo.textContent = `Pág. ${currentHistoryPageNumber}`;
        }    } catch (error) {
        console.error("Error fetching history:", error);
        historyElements.list.innerHTML = '<li>Error al cargar el historial.</li>';
        if (historyElements.paginationControls) historyElements.paginationControls.classList.add('hidden');
        // Load diagnostics on Firestore errors
        if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('ERR_BLOCKED_BY_CLIENT'))) {
            loadFirebaseDiagnostics();
        }
    } finally {
        historyElements.loadingSpinner.classList.add('hidden');
    }
}
// Listener para clics en la lista de historial (modificado para paginación y caché)
historyElements.list.addEventListener('click', async (event) => {
    const user = getCurrentUser();
    if (!user) return;

    const targetButton = event.target.closest('button[data-action="delete-session"]');
    const listItem = event.target.closest('li[data-session-id]');

    if (targetButton) {
        event.stopPropagation();
        const sessionIdToDelete = targetButton.dataset.sessionId;
        const sessionFromCache = allSessionsCache.find(s => s.id === sessionIdToDelete);
        const sessionName = sessionFromCache ? (sessionFromCache.nombreEntrenamiento || "esta sesión") : "esta sesión";

        if (confirm(`¿Estás seguro de que quieres eliminar "${sessionName}"? Esta acción no se puede deshacer.`)) {
            showLoading(targetButton, 'Eliminando...');
            try {
                const sessionDocRef = doc(db, "users", user.uid, "sesiones_entrenamiento", sessionIdToDelete);
                await deleteDoc(sessionDocRef);
                
                // Recargar la página actual del historial.
                // Si era el último ítem de la página y no es la primera página, intentar ir a la anterior.
                if (allSessionsCache.length === 1 && currentHistoryPageNumber > 1) {
                    // Al eliminar el último de la página, el stack ya se habrá ajustado en el 'prev'
                    // así que simplemente llamamos a 'prev'.
                    fetchAndRenderHistory('prev');
                } else {
                    // Recargar la página actual. Necesitamos el doc por el que empezó.
                    // El stack tiene [null, firstDocP1, firstDocP2, ...]
                    // El último elemento del stack es el firstDoc de la página actual.
                    const startAfterDocForReload = historyPageDocSnapshotsStack.length > 1 ? historyPageDocSnapshotsStack[historyPageDocSnapshotsStack.length - 2] : null;

                    let qReload;
                    if (startAfterDocForReload) {
                        qReload = query(collection(db, "users", user.uid, "sesiones_entrenamiento"), orderBy("fecha", "desc"), startAfter(startAfterDocForReload), limit(HISTORY_PAGE_SIZE));
                    } else { // Recargando la primera página
                        qReload = query(collection(db, "users", user.uid, "sesiones_entrenamiento"), orderBy("fecha", "desc"), limit(HISTORY_PAGE_SIZE));
                    }
                    
                    const snapshot = await getDocs(qReload);
                    const reloadedSessions = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
                    
                    allSessionsCache = [...reloadedSessions];
                    renderHistoryList(reloadedSessions);

                    if (snapshot.docs.length > 0) {
                        historyPageFirstDocSnapshot = snapshot.docs[0];
                        historyPageLastDocSnapshot = snapshot.docs[snapshot.docs.length - 1];
                        // No modificamos el stack aquí, ya que estamos "refrescando" la misma posición lógica.
                    } else { // La página quedó vacía
                        historyPageLastDocSnapshot = null; // No hay más siguientes
                    }
                    
                    // Re-evaluar estado de botones
                     if (historyElements.prevPageBtn) {
                        historyElements.prevPageBtn.disabled = currentHistoryPageNumber === 1 || historyPageDocSnapshotsStack.length <= 1;
                    }
                    if (historyElements.nextPageBtn) {
                        historyElements.nextPageBtn.disabled = snapshot.docs.length < HISTORY_PAGE_SIZE || reloadedSessions.length === 0;
                    }
                }            } catch (error) {
                console.error("Error eliminando sesión: ", error);
                alert("Error al eliminar la sesión.");
                hideLoading(targetButton); // Asegurar que se oculta el loading en caso de error
                // Load diagnostics on Firestore errors
                if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('ERR_BLOCKED_BY_CLIENT'))) {
                    loadFirebaseDiagnostics();
                }
            }
            // No es necesario hideLoading si el botón desaparece con el refresh, pero por si acaso.
        }
    } else if (listItem) {
        const sessionId = listItem.dataset.sessionId;
        let sessionData = allSessionsCache.find(s => s.id === sessionId);
        
        if (!sessionData) { // Debería estar en el caché de la página actual, pero como fallback:
            historyElements.loadingSpinner.classList.remove('hidden'); // O un spinner más pequeño
            try {
                const docRef = doc(db, "users", user.uid, "sesiones_entrenamiento", sessionId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) sessionData = { id: docSnap.id, ...docSnap.data() };
                else { alert("No se encontraron los detalles."); return; }
            } catch (err) { 
                console.error("Error fetching session detail: ", err); 
                alert("Error al cargar detalles."); 
                return; 
            } finally { 
                historyElements.loadingSpinner.classList.add('hidden'); 
            }
        }
        if (sessionData) showSessionDetail(sessionData);
    }
});

// Listeners para botones de paginación del historial
if (historyElements.prevPageBtn) {
    historyElements.prevPageBtn.addEventListener('click', () => fetchAndRenderHistory('prev'));
}
if (historyElements.nextPageBtn) {
    historyElements.nextPageBtn.addEventListener('click', () => fetchAndRenderHistory('next'));
}

if (sessionDetailModal.closeBtn) {
    sessionDetailModal.closeBtn.addEventListener('click', hideSessionDetail);
} else {
    console.error('Session detail modal close button not found');
}

if (sessionDetailModal.modal) {
    window.addEventListener('click', (event) => { 
        if (event.target === sessionDetailModal.modal) hideSessionDetail(); 
    });
} else {
    console.error('Session detail modal not found');
}


// Manage Routines View Listeners
if (manageRoutinesElements.addNewBtn) {
    manageRoutinesElements.addNewBtn.addEventListener('click', () => {
        renderRoutineEditor(null); // null for new routine
    });
} else {
    console.error('Add new routine button not found');
}

// Event listener for edit clicks bubbled up from ui.js
document.addEventListener('editRoutineClicked', (event) => {
    const routineId = event.detail.routineId;
    const routineToEdit = currentUserRoutines.find(r => r.id === routineId);
    if (routineToEdit) {
        renderRoutineEditor(routineToEdit);
    } else {
        alert("No se pudo encontrar la rutina para editar.");
    }
});


// Routine Editor Listeners
routineEditorElements.addExerciseBtn.addEventListener('click', () => {
    addExerciseToEditorForm(null); // Add an empty exercise form
});

routineEditorElements.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const user = getCurrentUser();
    if (!user) {
        alert("Debes iniciar sesión para guardar rutinas.");
        return;
    }

    const routineId = routineEditorElements.routineIdInput.value;
    const routineName = routineEditorElements.routineNameInput.value.trim();
    if (!routineName) {
        alert("El nombre de la rutina no puede estar vacío.");
        return;
    }

    const exercises = [];
    const exerciseEditors = routineEditorElements.exercisesContainer.querySelectorAll('.routine-exercise-editor');
    exerciseEditors.forEach(editor => {
        const name = editor.querySelector('input[name="ex-name"]').value.trim();
        const type = editor.querySelector('select[name="ex-type"]').value;
        const notes = editor.querySelector('textarea[name="ex-notes"]').value.trim();
        let sets = "", reps = "", duration = "";

        if (type === 'strength') {
            sets = parseInt(editor.querySelector('input[name="ex-sets"]').value) || 0;
            reps = editor.querySelector('input[name="ex-reps"]').value.trim();
        } else if (type === 'cardio') {
            duration = editor.querySelector('input[name="ex-duration"]').value.trim();
        }
        if (name) { // Only add if exercise has a name
            exercises.push({ name, type, sets, reps, duration, notes });
        }
    });

    if (exercises.length === 0) {
        alert("Debes añadir al menos un ejercicio a la rutina.");
        return;
    }

    const routineData = {
        name: routineName,
        exercises: exercises,
        updatedAt: Timestamp.now()
    };

    showLoading(routineEditorElements.saveRoutineBtn, 'Guardando rutina...');
    try {
        let docRef;
        if (routineId) { // Editing existing
            docRef = doc(db, "users", user.uid, "routines", routineId);
            await setDoc(docRef, routineData, { merge: true }); // Merge to keep createdAt if it exists
        } else { // Creating new
            routineData.createdAt = Timestamp.now(); // Add createdAt for new routines
            docRef = await addDoc(collection(db, "users", user.uid, "routines"), routineData);
        }
        alert("Rutina guardada con éxito!");
        await fetchUserRoutines(user); // Refresh the list
        showView('manageRoutines'); // Go back to manage routines view
        renderManageRoutinesView(currentUserRoutines);    } catch (error) {
        console.error("Error guardando rutina: ", error);
        alert("Error al guardar la rutina.");
        // Load diagnostics on Firestore errors
        if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('ERR_BLOCKED_BY_CLIENT'))) {
            loadFirebaseDiagnostics();
        }
    } finally {
        hideLoading(routineEditorElements.saveRoutineBtn);
    }
});

routineEditorElements.cancelEditRoutineBtn.addEventListener('click', () => {
    if (confirm("¿Cancelar edición? Los cambios no guardados se perderán.")) {
        showView('manageRoutines');
    }
});

routineEditorElements.deleteRoutineBtn.addEventListener('click', async () => {
    const routineId = routineEditorElements.deleteRoutineBtn.dataset.routineId;
    const user = getCurrentUser();
    if (!routineId || !user) return;

    const routineToDelete = currentUserRoutines.find(r => r.id === routineId);
    if (!routineToDelete) {
        alert("Rutina no encontrada para eliminar.");
        return;
    }

    if (confirm(`¿Estás seguro de que quieres eliminar la rutina "${routineToDelete.name}"? Esta acción no se puede deshacer.`)) {
        showLoading(routineEditorElements.deleteRoutineBtn, 'Eliminando...');
        try {
            await deleteDoc(doc(db, "users", user.uid, "routines", routineId));
            alert("Rutina eliminada con éxito.");
            await fetchUserRoutines(user);
            showView('manageRoutines');
            renderManageRoutinesView(currentUserRoutines);        } catch (error) {
            console.error("Error eliminando rutina: ", error);
            alert("Error al eliminar la rutina.");
            // Load diagnostics on Firestore errors
            if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('ERR_BLOCKED_BY_CLIENT'))) {
                loadFirebaseDiagnostics();
            }
        } finally {
            hideLoading(routineEditorElements.deleteRoutineBtn);
        }
    }
});

// Manage Routines View Listeners
manageRoutinesElements.addNewBtn.addEventListener('click', () => {
    renderRoutineEditor(null); // null for new routine
});

// Export all routines to clipboard
if (manageRoutinesElements.exportRoutinesBtn) {
    manageRoutinesElements.exportRoutinesBtn.addEventListener('click', async () => {
        const user = getCurrentUser();
        if (!user) {
            alert("Debes iniciar sesión para realizar esta acción.");
            return;
        }

        if (!confirm("¿Deseas exportar todas tus rutinas al portapapeles? Se copiará un JSON con todas tus rutinas.")) {
            return;
        }

        showLoading(manageRoutinesElements.exportRoutinesBtn, 'Exportando...');
        try {
            if (currentUserRoutines.length === 0) {
                alert("No tienes rutinas para exportar.");
                return;
            }

            // Prepare data for export
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
            
            // Copy to clipboard
            await navigator.clipboard.writeText(jsonString);
            alert(`✅ ${currentUserRoutines.length} rutina(s) exportadas al portapapeles exitosamente!`);
            
        } catch (error) {
            console.error("Error exportando rutinas:", error);
            if (error.name === 'NotAllowedError') {
                alert("Error: No se pudo acceder al portapapeles. Verifica los permisos del navegador.");
            } else {
                alert("Error al exportar las rutinas.");
            }
        } finally {
            hideLoading(manageRoutinesElements.exportRoutinesBtn);
        }
    });
} else {
    console.error("Export routines button not found for attaching event listener.");
}

// Delete all routines
if (manageRoutinesElements.deleteAllRoutinesBtn) {
    manageRoutinesElements.deleteAllRoutinesBtn.addEventListener('click', async () => {
        const user = getCurrentUser();
        if (!user) {
            alert("Debes iniciar sesión para realizar esta acción.");
            return;
        }

        if (currentUserRoutines.length === 0) {
            alert("No tienes rutinas para borrar.");
            return;
        }

        const confirmMessage = `⚠️ ATENCIÓN: Vas a borrar TODAS tus ${currentUserRoutines.length} rutina(s) permanentemente.\n\n¿Estás completamente seguro? Esta acción NO se puede deshacer.`;
        
        if (!confirm(confirmMessage)) {
            return;
        }

        // Double confirmation for safety
        const finalConfirm = prompt(`Para confirmar, escribe "BORRAR TODO" (en mayúsculas):`);
        if (finalConfirm !== "BORRAR TODO") {
            alert("Cancelado. No se borraron las rutinas.");
            return;
        }

        showLoading(manageRoutinesElements.deleteAllRoutinesBtn, 'Borrando...');
        try {
            const userRoutinesRef = collection(db, "users", user.uid, "routines");
            const batch = writeBatch(db);
            let routinesDeletedCount = 0;

            // Get all user routines and delete them
            for (const routine of currentUserRoutines) {
                const routineDocRef = doc(db, "users", user.uid, "routines", routine.id);
                batch.delete(routineDocRef);
                routinesDeletedCount++;
            }

            if (routinesDeletedCount > 0) {
                await batch.commit();
                alert(`✅ ${routinesDeletedCount} rutina(s) borradas exitosamente.`);
                
                // Refresh the list
                await fetchUserRoutines(user);
                if (!views.manageRoutines.classList.contains('hidden')) {
                    renderManageRoutinesView(currentUserRoutines);
                }
            }
        } catch (error) {
            console.error("Error borrando todas las rutinas:", error);
            alert("Error al borrar las rutinas.");
            // Load diagnostics on Firestore errors
            if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('ERR_BLOCKED_BY_CLIENT'))) {
                loadFirebaseDiagnostics();
            }
        } finally {
            hideLoading(manageRoutinesElements.deleteAllRoutinesBtn);
        }
    });
} else {
    console.error("Delete all routines button not found for attaching event listener.");
}

// PWA Service Worker and Storage Manager Initialization
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        // Note: ThemeManager is initialized once in DOMContentLoaded at the end of this file
        // to avoid race conditions with multiple initialization attempts

        // Initialize version control first - this handles app updates and cache management
        try {
            const versionResult = await initVersionControl();
            console.log('Version control initialized:', versionResult);
            
            // Check for backup session that might need restoration after update
            checkForBackupSession();
        } catch (error) {
            console.error('Version control initialization failed:', error);
        }

        // Initialize modern storage management
        try {
            await storageManager.initialize();
        } catch (error) {
            console.error('Storage manager initialization failed:', error);
        }

        // Use a relative path that works regardless of deployment location
        const swPath = new URL('sw.js', window.location.href).pathname;
        navigator.serviceWorker.register(swPath)
            .then(reg => console.log('ServiceWorker registered.', reg))
            .catch(err => {
                console.error('ServiceWorker registration failed:', err);
                // Check if it's a network error that might be caused by an ad blocker
                if (err.name === 'TypeError' && err.message.includes('Failed to register') && err.message.includes('404')) {
                    console.warn('This may be due to a missing service worker file or an ad blocker.');
                    // You could show a notification to the user here if needed
                }            });
    });
    
    // Add an error handler for Firestore connection errors
    window.addEventListener('error', function(event) {
        const errorText = event.message || '';
        if (errorText.includes('ERR_BLOCKED_BY_CLIENT') || 
            (event.filename && event.filename.includes('firestore.googleapis.com'))) {
            console.warn('Detected possible content blocker interfering with Firebase connections. ' +
                        'This may affect app functionality.');
            // Load diagnostics when we detect blocking
            loadFirebaseDiagnostics();
        }
    });
}
// Note: ThemeManager initialization for non-service-worker browsers is handled 
// in the single DOMContentLoaded listener at the end of this file

// Función para obtener los datos de actividad del mes (optimizada para cargar solo el mes necesario)
async function getMonthlyActivity(userId, year, month) {
    const loadingSpinner = document.getElementById('calendar-loading-spinner');
    if (loadingSpinner) loadingSpinner.classList.remove('hidden');
    
    const activityMap = new Map(); // 'YYYY-MM-DD' -> { count, type }
    const startDate = new Date(year, month, 1); // Primer día del mes
    const endDate = new Date(year, month + 1, 0, 23, 59, 59); // Último día del mes

    try {
        const sessionsRef = collection(db, "users", userId, "sesiones_entrenamiento");
        const q = query(sessionsRef,
            where("fecha", ">=", Timestamp.fromDate(startDate)),
            where("fecha", "<=", Timestamp.fromDate(endDate))
        );
        const querySnapshot = await getDocs(q);

        querySnapshot.forEach(docSnap => { // Cambiado 'doc' a 'docSnap' para evitar conflicto
            const session = docSnap.data();
            if (session.fecha && session.fecha.toDate) { // Asegurarse de que fecha existe y es Timestamp
                const dateString = timestampToLocalDateString(session.fecha);
                if (dateString) {
                    // Analizar el tipo de entrenamiento de esta sesión
                    const sessionType = analyzeSessionType(session);
                    
                    const currentData = activityMap.get(dateString) || { count: 0, type: 'none' };
                    const newCount = currentData.count + 1;
                    
                    // Determinar el tipo combinado para el día
                    let combinedType = sessionType;
                    if (currentData.count > 0) {
                        // Si ya hay actividad en este día, combinar tipos
                        combinedType = combineWorkoutTypes(currentData.type, sessionType);
                    }
                    
                    activityMap.set(dateString, { count: newCount, type: combinedType });
                }
            }
        });    } catch (error) {
        console.error("Error fetching monthly activity:", error);
        // Mostrar mensaje de error más amigable para el usuario
        const calendarView = document.getElementById('activity-calendar');
        if (calendarView) {
            calendarView.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 20px; color: #666;">Error al cargar la actividad del mes</div>';
        }
    } finally {
        const loadingSpinner = document.getElementById('calendar-loading-spinner');
        if (loadingSpinner) loadingSpinner.classList.add('hidden');
    }
    return activityMap;
}

// Función para analizar el tipo de entrenamiento de una sesión
function analyzeSessionType(session) {
    if (!session.ejercicios || session.ejercicios.length === 0) {
        return 'none';
    }
    
    let hasStrength = false;
    let hasCardio = false;
    
    session.ejercicios.forEach(ejercicio => {
        if (ejercicio.tipoEjercicio === 'strength') {
            hasStrength = true;
        } else if (ejercicio.tipoEjercicio === 'cardio') {
            hasCardio = true;
        }
    });
    
    if (hasStrength && hasCardio) {
        return 'mixed';
    } else if (hasCardio) {
        return 'cardio';
    } else if (hasStrength) {
        return 'strength';
    } else {
        return 'none';
    }
}

// Función para combinar tipos de entrenamiento cuando hay múltiples sesiones en un día
function combineWorkoutTypes(type1, type2) {
    if (type1 === 'none') return type2;
    if (type2 === 'none') return type1;
    if (type1 === type2) return type1;
    
    // Si hay combinación de tipos diferentes, es mixto
    return 'mixed';
}

function getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}

function renderActivityCalendar(year, month, activityData) {
    // Re-query calendar elements in case they weren't loaded initially
    const calendarView = document.getElementById('activity-calendar');
    const currentMonthDisplay = document.getElementById('current-month-display');
    
    // Check if calendar elements exist before proceeding
    if (!calendarView || !currentMonthDisplay) {
        console.error('Calendar elements not found. DOM might not be fully loaded.', {
            calendarView: !!calendarView,
            currentMonthDisplay: !!currentMonthDisplay
        });
        return;
    }
    
    calendarView.innerHTML = ''; // Limpiar calendario anterior
    
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", 
                       "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    
    currentMonthDisplay.textContent = `${monthNames[month]} ${year}`;    // Agregar encabezados de días de la semana
    const dayHeaders = ["L", "M", "X", "J", "V", "S", "D"];
    dayHeaders.forEach(dayHeader => {
        const headerCell = document.createElement('div');
        headerCell.classList.add('day-header');
        headerCell.textContent = dayHeader;
        calendarView.appendChild(headerCell);
    });

    const daysInCurrentMonth = getDaysInMonth(year, month);
    let firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 (Domingo) - 6 (Sábado)
    // Para que Lunes sea el primer día (0) y Domingo el último (6)
    firstDayOfMonth = (firstDayOfMonth === 0) ? 6 : firstDayOfMonth - 1;

    // Añadir celdas vacías para alinear el primer día de la semana (Lunes)
    for (let i = 0; i < firstDayOfMonth; i++) {
        const placeholderCell = document.createElement('div');
        placeholderCell.classList.add('day-cell', 'is-placeholder');
        calendarView.appendChild(placeholderCell);
    }

    // Verificar si hay actividad en el mes
    const hasActivity = Array.from(activityData.values()).some(info => info.count > 0);    // Agregar días del mes
    for (let day = 1; day <= daysInCurrentMonth; day++) {
        const cell = document.createElement('div');
        cell.classList.add('day-cell');
        const currentDate = new Date(year, month, day);
        // Usar la misma lógica de conversión que en getMonthlyActivity para consistencia
        const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        const activityInfo = activityData.get(dateString) || { count: 0, type: 'none' };
        let activityLevel = 0;
        let activityTypeText = 'Sin actividad';
        
        if (activityInfo.count > 0) {
            switch (activityInfo.type) {
                case 'strength':
                    activityLevel = 1;
                    activityTypeText = 'Entrenamiento de fuerza';
                    break;
                case 'cardio':
                    activityLevel = 3;
                    activityTypeText = 'Entrenamiento de cardio';
                    break;
                case 'mixed':
                    activityLevel = 2;
                    activityTypeText = 'Entrenamiento mixto (fuerza + cardio)';
                    break;
                default:
                    activityLevel = 1;
                    activityTypeText = 'Entrenamiento';
            }
        }

        cell.classList.add(`level-${activityLevel}`);
        
        // Crear tooltip más informativo
        const tooltipText = activityInfo.count > 0 
            ? `${dateString}: ${activityTypeText}${activityInfo.count > 1 ? ` (${activityInfo.count} sesiones)` : ''}`
            : `${dateString}: ${activityTypeText}`;
        cell.title = tooltipText;
        
        // Mostrar el número del día en cada celda
        cell.textContent = day;

        // Resaltar el día actual
        const today = new Date();
        if (year === today.getFullYear() && 
            month === today.getMonth() && 
            day === today.getDate()) {
            cell.classList.add('is-today');
        }

        // Hacer clickeable para filtrar historial
        cell.addEventListener('click', () => {
            if (activityInfo.count > 0) {
                console.log(`Mostrar actividad para ${dateString} - Tipo: ${activityInfo.type}`);
                // Aquí podrías implementar navegación al historial filtrado por fecha
                // showView('history');
                // fetchAndRenderHistory({ filterDate: currentDate });
            }        });

        calendarView.appendChild(cell);
    }

    // Mostrar mensaje motivacional si no hay actividad en el mes actual
    if (!hasActivity && year === new Date().getFullYear() && month === new Date().getMonth()) {
        const motivationalMessage = document.createElement('div');
        motivationalMessage.style.cssText = `
            grid-column: 1 / -1; 
            text-align: center; 
            padding: 15px; 
            color: #666; 
            font-style: italic; 
            background-color: rgba(67, 97, 238, 0.05); 
            border-radius: 6px; 
            margin-top: 10px;
        `;
        motivationalMessage.textContent = '¡Comienza tu primer entrenamiento este mes! 💪';
        calendarView.appendChild(motivationalMessage);
    }
}

async function updateCalendarView() {
    const user = getCurrentUser();
    if (!user) {
        const container = document.getElementById('activity-calendar-container');
        if (container) container.classList.add('hidden');
        return;
    }
    
    // Re-query calendar elements in case they weren't loaded initially
    const container = document.getElementById('activity-calendar-container');
    const calendarView = document.getElementById('activity-calendar');
    const currentMonthDisplay = document.getElementById('current-month-display');
    const loadingSpinner = document.getElementById('calendar-loading-spinner');
    
    // Check if calendar elements exist before proceeding
    if (!container || !calendarView || !currentMonthDisplay) {
        console.error('Calendar elements not found. DOM might not be fully loaded.', {
            container: !!container,
            calendarView: !!calendarView,
            currentMonthDisplay: !!currentMonthDisplay
        });
        return;
    }
    
    // Asegurar que no se va por debajo del año mínimo
    if (currentCalendarYear < MIN_CALENDAR_YEAR) {
        currentCalendarYear = MIN_CALENDAR_YEAR;
        currentCalendarMonth = 0; // Enero del año mínimo
    }    
    // Validar que no se vaya a un mes futuro
    const today = new Date();
    if (currentCalendarYear === today.getFullYear() && currentCalendarMonth > today.getMonth()) {
        currentCalendarMonth = today.getMonth();
    }
    
    container.classList.remove('hidden');
    
    // Mostrar estado de carga mientras se obtienen los datos del mes
    if (loadingSpinner) {
        loadingSpinner.classList.remove('hidden');
    }
    
    const activity = await getMonthlyActivity(user.uid, currentCalendarYear, currentCalendarMonth);
    renderActivityCalendar(currentCalendarYear, currentCalendarMonth, activity);

    // Deshabilitar botones según los límites
    updateCalendarNavigation();
}

function updateCalendarNavigation() {
    // Re-query calendar elements in case they weren't loaded initially
    const prevMonthBtn = document.getElementById('prev-month-btn');
    const nextMonthBtn = document.getElementById('next-month-btn');
    
    // Check if calendar elements exist
    if (!prevMonthBtn || !nextMonthBtn) {
        console.warn('Calendar navigation buttons not found.');
        return;
    }
    
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    
    // Deshabilitar botón "prev" si estamos en el mes/año mínimo
    const isAtMinimum = (currentCalendarYear === MIN_CALENDAR_YEAR && currentCalendarMonth === 0) ||
                       currentCalendarYear < MIN_CALENDAR_YEAR;
    
    // Deshabilitar botón "next" si estamos en el mes/año actual
    const isAtMaximum = (currentCalendarYear === currentYear && currentCalendarMonth >= currentMonth) ||
                       currentCalendarYear > currentYear;
    
    prevMonthBtn.disabled = isAtMinimum;
    nextMonthBtn.disabled = isAtMaximum;
}

// Listeners para el calendario - using document event delegation for robustness
document.addEventListener('click', function(event) {
    if (event.target.id === 'prev-month-btn') {
        // Navegar al mes anterior
        currentCalendarMonth--;
        if (currentCalendarMonth < 0) {
            currentCalendarMonth = 11;
            currentCalendarYear--;
        }
        
        // Verificar límites
        if (currentCalendarYear < MIN_CALENDAR_YEAR) {
            currentCalendarYear = MIN_CALENDAR_YEAR;
            currentCalendarMonth = 0;
        }
        
        updateCalendarView();
    } else if (event.target.id === 'next-month-btn') {
        // Navegar al mes siguiente
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth();
        
        // No permitir ir más allá del mes actual
        if (currentCalendarYear < currentYear || 
            (currentCalendarYear === currentYear && currentCalendarMonth < currentMonth)) {
            currentCalendarMonth++;
            if (currentCalendarMonth > 11) {
                currentCalendarMonth = 0;
                currentCalendarYear++;
            }
            updateCalendarView();
        }
    }
});

// --- Scroll To Top Button ---
const scrollToTopBtn = document.createElement('button');
scrollToTopBtn.id = 'scroll-to-top-btn';
scrollToTopBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"/></svg>';
scrollToTopBtn.setAttribute('aria-label', 'Volver arriba');
scrollToTopBtn.title = 'Volver arriba';
document.body.appendChild(scrollToTopBtn);

// Función para mostrar/ocultar el botón según la posición del scroll
function toggleScrollToTopBtn() {
    // Mostrar el botón cuando el usuario ha bajado suficiente (200px en lugar de 300)
    if (window.scrollY > 200) {
        scrollToTopBtn.classList.add('visible');
    } else {
        scrollToTopBtn.classList.remove('visible');
    }
}

// Evento para volver arriba cuando se hace clic en el botón
scrollToTopBtn.addEventListener('click', () => {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'  // Para un desplazamiento suave
    });
});

// Añadir evento de scroll para mostrar/ocultar el botón
window.addEventListener('scroll', toggleScrollToTopBtn, { passive: true });

// Llamada inicial para asegurarse de que el botón tenga el estado correcto
toggleScrollToTopBtn();

// --- Version Management UI ---
// Initialize version info in footer
const versionInfoElement = document.getElementById('app-version-info');
const forceUpdateBtn = document.getElementById('force-update-btn');

if (versionInfoElement) {
    // Obtener la versión de forma asíncrona
    (async () => {
        try {
            const version = await getCurrentVersion();
            versionInfoElement.textContent = `v${version}`;
        } catch (error) {
            console.error('Error getting version for UI:', error);
            versionInfoElement.textContent = 'v1.1.0'; // Fallback
        }
    })();
}

if (forceUpdateBtn) {
    forceUpdateBtn.addEventListener('click', async () => {
        if (confirm('¿Estás seguro de que quieres forzar la actualización de la aplicación? Esto limpiará el caché y recargará la página.')) {
            // No usar showLoading aquí ya que forceAppUpdate maneja sus propios estados visuales
            await forceAppUpdate();
        }
    });
}

// SINGLE POINT OF INITIALIZATION for ThemeManager
// This is the only place where ThemeManager should be initialized to avoid race conditions.
// The null check ensures it's only initialized once, even if DOMContentLoaded fires after
// initializeAppAfterAuth (which can happen with fast auth state resolution).
document.addEventListener('DOMContentLoaded', () => {
    if (!themeManager) {
        try {
            themeManager = new ThemeManager();
            console.log('Theme manager initialized');
        } catch (error) {
            console.error('Theme manager initialization failed:', error);
        }
    }
});

showView('auth');

// --- Progress Functions ---

/**
 * Obtiene todas las sesiones del usuario para análisis de progreso
 */
async function fetchAllSessions() {
    const user = getCurrentUser();
    if (!user) {
        allSessionsCache = [];
        return;
    }

    try {
        const sessionsRef = collection(db, 'users', user.uid, 'sesiones_entrenamiento');
        const q = query(sessionsRef, orderBy('fecha', 'desc'));
        const querySnapshot = await getDocs(q);
        
        allSessionsCache = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        console.log(`✅ Loaded ${allSessionsCache.length} sessions for progress analysis`);
    } catch (error) {
        console.error('❌ Error fetching all sessions:', error);
        allSessionsCache = [];
    }
}

/**
 * Carga los datos para la vista de progreso
 */
async function loadProgressData() {
    try {
        // Cargar lista de ejercicios (usa caché automáticamente)
        await loadExerciseList();
    } catch (error) {
        console.error('Error loading progress data:', error);
        resetProgressView();
    }
}

// --- Settings Modal ---
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsModalCloseBtn = document.querySelector('.settings-modal-close');
const clearCacheBtn = document.getElementById('clear-cache-btn');
const cacheInfoContainer = document.getElementById('cache-info-container');

/**
 * Formats bytes to a human-readable string
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Loads and displays cache information in the settings modal
 */
async function loadCacheInfo() {
    try {
        const { exerciseCache } = await import('./exercise-cache.js');
        const cacheStats = exerciseCache.getCacheStats();
        const storageEstimate = await storageManager.getStorageEstimate();
        
        let html = '<div class="cache-stats">';
        
        // Exercise cache stats
        html += `
            <div class="cache-stat-item">
                <span class="cache-stat-label">Ejercicios en caché:</span>
                <span class="cache-stat-value">${cacheStats.exerciseCount}</span>
            </div>
            <div class="cache-stat-item">
                <span class="cache-stat-label">Total de registros:</span>
                <span class="cache-stat-value">${cacheStats.totalEntries}</span>
            </div>
            <div class="cache-stat-item">
                <span class="cache-stat-label">Tamaño del caché de ejercicios:</span>
                <span class="cache-stat-value">${formatBytes(cacheStats.cacheSize)}</span>
            </div>
        `;
        
        if (cacheStats.newestEntry) {
            html += `
                <div class="cache-stat-item">
                    <span class="cache-stat-label">Última actualización:</span>
                    <span class="cache-stat-value">${formatDate(cacheStats.newestEntry)}</span>
                </div>
            `;
        }
        
        if (cacheStats.oldestEntry) {
            const daysOfHistory = Math.floor((Date.now() - cacheStats.oldestEntry.getTime()) / (1000 * 60 * 60 * 24));
            html += `
                <div class="cache-stat-item">
                    <span class="cache-stat-label">Días de historial:</span>
                    <span class="cache-stat-value">${daysOfHistory} días</span>
                </div>
            `;
        }
        
        // Storage API stats
        if (storageEstimate) {
            html += `
                <hr class="cache-divider">
                <div class="cache-stat-item">
                    <span class="cache-stat-label">Almacenamiento usado:</span>
                    <span class="cache-stat-value">${formatBytes(storageEstimate.usage)}</span>
                </div>
                <div class="cache-stat-item">
                    <span class="cache-stat-label">Cuota disponible:</span>
                    <span class="cache-stat-value">${formatBytes(storageEstimate.quota)}</span>
                </div>
                <div class="cache-stat-item">
                    <span class="cache-stat-label">Uso:</span>
                    <span class="cache-stat-value">${storageEstimate.usagePercentage}%</span>
                </div>
            `;
        }
        
        html += '</div>';
        
        if (cacheInfoContainer) {
            cacheInfoContainer.innerHTML = html;
        }
    } catch (error) {
        console.error('Error loading cache info:', error);
        if (cacheInfoContainer) {
            cacheInfoContainer.innerHTML = '<p class="error-text">Error al cargar la información del caché.</p>';
        }
    }
}

/**
 * Shows the settings modal
 */
function showSettingsModal() {
    if (settingsModal) {
        settingsModal.style.display = 'block';
        loadCacheInfo();
    }
}

/**
 * Hides the settings modal
 */
function hideSettingsModal() {
    if (settingsModal) {
        settingsModal.style.display = 'none';
    }
}

/**
 * Clears the exercise cache after user confirmation
 */
async function clearExerciseCache() {
    const confirmMessage = '⚠️ ¿Estás seguro de que quieres eliminar el caché local?\n\nEsto borrará los datos de sugerencias de ejercicios guardados localmente. Los datos de tus sesiones en la nube no se verán afectados.\n\nEl caché se reconstruirá automáticamente la próxima vez que inicies sesión.';
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    try {
        const { exerciseCache } = await import('./exercise-cache.js');
        exerciseCache.clearCache();
        
        // Reload cache info to show empty state
        await loadCacheInfo();
        
        alert('✅ Caché eliminado correctamente.');
    } catch (error) {
        console.error('Error clearing cache:', error);
        alert('❌ Error al eliminar el caché.');
    }
}

// Settings button event listener
if (settingsBtn) {
    settingsBtn.addEventListener('click', showSettingsModal);
}

// Settings modal close button event listener
if (settingsModalCloseBtn) {
    settingsModalCloseBtn.addEventListener('click', hideSettingsModal);
}

// Close settings modal when clicking outside
if (settingsModal) {
    window.addEventListener('click', (event) => {
        if (event.target === settingsModal) {
            hideSettingsModal();
        }
    });
}

// Clear cache button event listener
if (clearCacheBtn) {
    clearCacheBtn.addEventListener('click', clearExerciseCache);
}