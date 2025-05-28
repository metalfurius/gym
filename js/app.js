import { db } from './firebase-config.js'; // auth is handled in auth.js
import { collection, addDoc, Timestamp, query, orderBy, getDocs, doc, getDoc, setDoc, deleteDoc, writeBatch, where,
    limit, startAfter } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getCurrentUser, handleLogout } from './auth.js'; // Removed login/signup handlers, they are in auth.js
import {
    showView, updateNav, formatDate, populateDaySelector, renderSessionView,
    renderHistoryList, showSessionDetail, hideSessionDetail, renderManageRoutinesView,
    renderRoutineEditor, addExerciseToEditorForm,
    views, navButtons, authElements, dashboardElements, sessionElements, historyElements, sessionDetailModal,
    manageRoutinesElements, routineEditorElements, showLoading, hideLoading,
    calendarElements, applyHistoryFilters 
} from './ui.js';
import { sampleWorkoutRoutines, saveInProgressSession, loadInProgressSession, clearInProgressSession } from './store.js';
import { storageManager } from './storage-manager.js';
import { initVersionControl, checkForBackupSession, forceAppUpdate, getCurrentVersion } from './version-manager.js';

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
        dashboardElements.currentDate.textContent = formatDate(new Date());
        await fetchUserRoutines(user);
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

// Initializes sample routines for a new user or if none exist
export async function initializeUserRoutines(user, isNewUser = false) {
    if (!user) return;
    const routinesCollectionRef = collection(db, "users", user.uid, "routines");
    
    // Check if user has any routines
    const q = query(routinesCollectionRef);
    const snapshot = await getDocs(q);

    if (snapshot.empty || isNewUser) { // Add samples if no routines or new user
        console.log("Initializing sample routines for user:", user.uid);
        const batch = writeBatch(db);
        for (const routineKey in sampleWorkoutRoutines) {
            const sampleRoutine = sampleWorkoutRoutines[routineKey];
            // Use routineKey (e.g., "A1_sample") as document ID for samples to avoid clashes if user creates "A1"
            const routineDocRef = doc(db, "users", user.uid, "routines", routineKey);
            batch.set(routineDocRef, {
                name: sampleRoutine.name,
                exercises: sampleRoutine.exercises,
                isSample: true, // Mark as a sample
                createdAt: Timestamp.now()
            });
        }
        try {
            await batch.commit();
            console.log("Sample routines added.");
            await fetchUserRoutines(user); // Re-fetch to update UI
        } catch (error) {
            console.error("Error adding sample routines: ", error);
        }
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
        }
    } catch (error) {
        console.error("Error fetching user routines: ", error);
        currentUserRoutines = [];
        populateDaySelector([]);
    }
}

function checkAndOfferResumeSession() {
    const inProgress = loadInProgressSession();
    const user = getCurrentUser();

    // Referencia al div contenedor
    const resumeArea = dashboardElements.resumeSessionArea; // Asumiendo que lo tienes en dashboardElements

    if (inProgress && user) {
        const routine = currentUserRoutines.find(r => r.id === inProgress.routineId);
        if (routine) {
            dashboardElements.resumeSessionInfo.textContent = `Tienes una sesión de "${routine.name}" sin guardar.`;
            dashboardElements.resumeSessionBtn.classList.remove('hidden');
            resumeArea.classList.add('visible'); // <<< AÑADIR CLASE VISIBLE

            dashboardElements.resumeSessionBtn.onclick = () => {
                currentRoutineForSession = routine;
                renderSessionView(routine, inProgress.data);
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
navButtons.logout.addEventListener('click', handleLogout);


// Dashboard
dashboardElements.daySelect.addEventListener('change', () => {
    dashboardElements.startSessionBtn.disabled = !dashboardElements.daySelect.value;
});
dashboardElements.manageRoutinesLinkBtn.addEventListener('click', () => {
    navButtons.manageRoutines.click(); // Simulate click on nav button
});

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
        }
        currentRoutineForSession = selectedRoutine;
        renderSessionView(selectedRoutine, inProgress && inProgress.routineId === selectedRoutineId ? inProgress.data : null);
        dashboardElements.resumeSessionBtn.classList.add('hidden');
        dashboardElements.resumeSessionInfo.textContent = '';
    }
});

// Session
sessionElements.saveBtn.addEventListener('click', saveSessionData);
sessionElements.cancelBtn.addEventListener('click', () => {
    if (confirm("¿Estás seguro de que quieres cancelar? Se perderán los datos no guardados.")) {
        sessionElements.form.reset();
        clearInProgressSession();
        currentRoutineForSession = null;
        showView('dashboard');
    }
});
sessionElements.exerciseList.addEventListener('input', () => {
    if (!currentRoutineForSession) return;
    const formData = getSessionFormData();
    saveInProgressSession(currentRoutineForSession.id, formData);
});

function getSessionFormData() {
    if (!currentRoutineForSession) return {};
    const sessionData = {
        ejercicios: [],
        pesoUsuario: document.getElementById('user-weight').value || null
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
            const setRows = block.querySelectorAll('.set-row');
            setRows.forEach((row, setIndex) => {
                const weightInput = row.querySelector(`input[name="weight-${exerciseIndex}-${setIndex}"]`);
                const repsInput = row.querySelector(`input[name="reps-${exerciseIndex}-${setIndex}"]`);
                if (weightInput.value || repsInput.value) {
                    exerciseEntry.sets.push({
                        peso: parseFloat(weightInput.value) || 0,
                        reps: parseInt(repsInput.value, 10) || 0
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
    };

    showLoading(sessionElements.saveBtn, 'Guardando...');
    try {
        const userSessionsCollectionRef = collection(db, "users", user.uid, "sesiones_entrenamiento");
        await addDoc(userSessionsCollectionRef, finalSessionData);
        alert("¡Sesión guardada con éxito!");
        sessionElements.form.reset();
        clearInProgressSession();
        currentRoutineForSession = null;
        showView('dashboard');
        fetchAndRenderHistory();
    } catch (e) {
        console.error("Error adding document: ", e);
        alert("Error al guardar la sesión.");
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
        }

    } catch (error) {
        console.error("Error fetching history:", error);
        historyElements.list.innerHTML = '<li>Error al cargar el historial.</li>';
        if (historyElements.paginationControls) historyElements.paginationControls.classList.add('hidden');
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
                }

            } catch (error) {
                console.error("Error eliminando sesión: ", error);
                alert("Error al eliminar la sesión.");
                hideLoading(targetButton); // Asegurar que se oculta el loading en caso de error
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

sessionDetailModal.closeBtn.addEventListener('click', hideSessionDetail);
window.addEventListener('click', (event) => { if (event.target === sessionDetailModal.modal) hideSessionDetail(); });


// Manage Routines View Listeners
manageRoutinesElements.addNewBtn.addEventListener('click', () => {
    renderRoutineEditor(null); // null for new routine
});

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
        renderManageRoutinesView(currentUserRoutines);
    } catch (error) {
        console.error("Error guardando rutina: ", error);
        alert("Error al guardar la rutina.");
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
            renderManageRoutinesView(currentUserRoutines);
        } catch (error) {
            console.error("Error eliminando rutina: ", error);
            alert("Error al eliminar la rutina.");
        } finally {
            hideLoading(routineEditorElements.deleteRoutineBtn);
        }
    }
});

// Manage Routines View Listeners
manageRoutinesElements.addNewBtn.addEventListener('click', () => {
    renderRoutineEditor(null); // null for new routine
});

// Listener para el botón de inicializar/restaurar rutinas de muestra
// Listener para el NUEVO botón de actualizar rutinas de muestra específicas del usuario
if (manageRoutinesElements.updateMySampleRoutinesBtn) {
    manageRoutinesElements.updateMySampleRoutinesBtn.addEventListener('click', async () => {
        const user = getCurrentUser();
        if (!user) {
            alert("Debes iniciar sesión para realizar esta acción.");
            return;
        }

        if (!confirm("Esto intentará actualizar TUS versiones de las rutinas de muestra (identificadas por '..._sample' o marcadas como muestra) a las últimas definiciones. Si las personalizaste mucho, esos cambios se perderán en esas rutinas específicas. ¿Continuar?")) {
            return;
        }

        showLoading(manageRoutinesElements.updateMySampleRoutinesBtn, 'Actualizando...');
        try {
            const userRoutinesRef = collection(db, "users", user.uid, "routines");
            const batch = writeBatch(db);
            let routinesUpdatedCount = 0;

            // Obtener todas las rutinas de muestra actuales del usuario
            // Idealmente, buscarías por un flag como `isSample: true` Y que el ID termine en `_sample`
            // O solo por IDs que coincidan con las claves de sampleWorkoutRoutines
            const qUserSamples = query(userRoutinesRef, where("isSample", "==", true)); // O una consulta más específica por ID
            const userSamplesSnapshot = await getDocs(qUserSamples);

            const newSampleRoutines = sampleWorkoutRoutines; // Tus nuevas definiciones de store.js

            for (const sampleId in newSampleRoutines) { // Iterar sobre las claves de tus nuevas muestras (ej. "A1_sample")
                if (newSampleRoutines.hasOwnProperty(sampleId)) {
                    const newSampleData = newSampleRoutines[sampleId];

                    // Buscar si el usuario tiene una rutina con este ID de muestra
                    const userDocToUpdate = userSamplesSnapshot.docs.find(d => d.id === sampleId);

                    if (userDocToUpdate) {
                        // El usuario tiene una versión de esta rutina de muestra. La actualizamos.
                        const routineDocRef = doc(db, "users", user.uid, "routines", sampleId);
                        batch.set(routineDocRef, {
                            name: newSampleData.name,
                            exercises: newSampleData.exercises,
                            isSample: true, // Asegurar que sigue marcada como muestra
                            // Mantener el createdAt original si es posible, o resetearlo si prefieres
                            // createdAt: userDocToUpdate.data().createdAt || Timestamp.now(), // Opción para mantener
                            createdAt: userDocToUpdate.data().createdAt, // Mantener el original
                            updatedAt: Timestamp.now() // Marcar como actualizada ahora
                        });
                        routinesUpdatedCount++;
                        console.log(`Rutina de muestra '${sampleId}' marcada para actualización.`);
                    } else {
                        // El usuario no tiene esta rutina de muestra específica (quizás la borró o es una nueva muestra)
                        // Podrías añadirla aquí si quieres que "actualizar" también signifique "añadir las que falten"
                        // O manejarlo con el botón "Añadir Rutinas de Muestra"
                        console.log(`Rutina de muestra '${sampleId}' no encontrada en las del usuario. No se actualiza ni añade con este botón.`);
                    }
                }
            }

            if (routinesUpdatedCount > 0) {
                await batch.commit();
                alert(`${routinesUpdatedCount} rutina(s) de muestra han sido actualizadas a la última versión.`);
            } else {
                alert("No se encontraron rutinas de muestra para actualizar o ya estaban al día (según ID). Puedes usar 'Añadir Rutinas' si te faltan.");
            }

            await fetchUserRoutines(user); // Refrescar la lista en la UI
            if (!views.manageRoutines.classList.contains('hidden')) {
                renderManageRoutinesView(currentUserRoutines);
            }

        } catch (error) {
            console.error("Error actualizando rutinas de muestra del usuario:", error);
            alert("Error al actualizar las rutinas de muestra.");
        } finally {
            hideLoading(manageRoutinesElements.updateMySampleRoutinesBtn);
        }
    });
}

// Modificar el botón existente para que solo AÑADA si NO existen
// y no reemplace si ya existen con el mismo ID.
if (manageRoutinesElements.initializeSampleRoutinesBtn) {
    manageRoutinesElements.initializeSampleRoutinesBtn.addEventListener('click', async () => {
        const user = getCurrentUser();
        if (!user) {
            alert("Debes iniciar sesión para realizar esta acción.");
            return;
        }

        if (!confirm("Esto añadirá las rutinas de muestra a tu lista SI AÚN NO LAS TIENES con el mismo ID. No reemplazará las existentes. ¿Continuar?")) {
            return;
        }
        showLoading(manageRoutinesElements.initializeSampleRoutinesBtn, 'Añadiendo...');
        try {
            const userRoutinesRef = collection(db, "users", user.uid, "routines");
            const batch = writeBatch(db);
            let routinesAddedCount = 0;

            // Obtener IDs de las rutinas existentes del usuario para no duplicar
            const existingUserRoutinesSnapshot = await getDocs(userRoutinesRef);
            const existingUserRoutineIds = new Set(existingUserRoutinesSnapshot.docs.map(d => d.id));

            for (const routineKey in sampleWorkoutRoutines) {
                if (sampleWorkoutRoutines.hasOwnProperty(routineKey)) {
                    // Solo añadir si el usuario NO tiene ya una rutina con este ID de muestra
                    if (!existingUserRoutineIds.has(routineKey)) {
                        const sampleRoutine = sampleWorkoutRoutines[routineKey];
                        const routineDocRef = doc(db, "users", user.uid, "routines", routineKey);
                        batch.set(routineDocRef, {
                            name: sampleRoutine.name,
                            exercises: sampleRoutine.exercises,
                            isSample: true,
                            createdAt: Timestamp.now(),
                            updatedAt: Timestamp.now()
                        });
                        routinesAddedCount++;
                    }
                }
            }

            if (routinesAddedCount > 0) {
                await batch.commit();
                alert(`${routinesAddedCount} rutina(s) de muestra han sido añadidas.`);
            } else {
                alert("No se añadieron nuevas rutinas de muestra (probablemente ya las tenías todas o no hay muestras definidas).");
            }

            await fetchUserRoutines(user);
            if (!views.manageRoutines.classList.contains('hidden')) {
                renderManageRoutinesView(currentUserRoutines);
            }
        } catch (error) {
            console.error("Error añadiendo rutinas de muestra:", error);
            alert("Error al añadir las rutinas de muestra.");
        } finally {
            hideLoading(manageRoutinesElements.initializeSampleRoutinesBtn);
        }
    });
} else {
    console.error("Initialize sample routines button not found for attaching event listener.");
}

// PWA Service Worker and Storage Manager Initialization
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
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
                }
            });
    });
    
    // Add an error handler for Firestore connection errors
    window.addEventListener('error', function(event) {
        const errorText = event.message || '';
        if (errorText.includes('ERR_BLOCKED_BY_CLIENT') || 
            (event.filename && event.filename.includes('firestore.googleapis.com'))) {
            console.warn('Detected possible content blocker interfering with Firebase connections. ' +
                        'This may affect app functionality.');
            // You could show a notification to the user here if needed
        }
    });
}


// Función para obtener los datos de actividad del mes (optimizada para cargar solo el mes necesario)
async function getMonthlyActivity(userId, year, month) {
    const loadingSpinner = document.getElementById('calendar-loading-spinner');
    if (loadingSpinner) loadingSpinner.classList.remove('hidden');
    
    const activityMap = new Map(); // 'YYYY-MM-DD' -> count
    const startDate = new Date(year, month, 1); // Primer día del mes
    const endDate = new Date(year, month + 1, 0, 23, 59, 59); // Último día del mes

    try {
        const sessionsRef = collection(db, "users", userId, "sesiones_entrenamiento");
        const q = query(sessionsRef,
            where("fecha", ">=", Timestamp.fromDate(startDate)),
            where("fecha", "<=", Timestamp.fromDate(endDate))
        );
        const querySnapshot = await getDocs(q);        querySnapshot.forEach(docSnap => { // Cambiado 'doc' a 'docSnap' para evitar conflicto
            const session = docSnap.data();
            if (session.fecha && session.fecha.toDate) { // Asegurarse de que fecha existe y es Timestamp
                const dateString = timestampToLocalDateString(session.fecha);
                if (dateString) {
                    activityMap.set(dateString, (activityMap.get(dateString) || 0) + 1);
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
    const hasActivity = Array.from(activityData.values()).some(count => count > 0);    // Agregar días del mes
    for (let day = 1; day <= daysInCurrentMonth; day++) {
        const cell = document.createElement('div');
        cell.classList.add('day-cell');
        const currentDate = new Date(year, month, day);
        // Usar la misma lógica de conversión que en getMonthlyActivity para consistencia
        const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        const activityCount = activityData.get(dateString) || 0;
        let activityLevel = 0;
        if (activityCount > 0) activityLevel = 1;
        if (activityCount >= 2) activityLevel = 2;
        if (activityCount >= 3) activityLevel = 3;
        if (activityCount >= 4) activityLevel = 4;

        cell.classList.add(`level-${activityLevel}`);
        
        // Crear tooltip más informativo
        const tooltipText = activityCount > 0 
            ? `${dateString}: ${activityCount} sesión${activityCount !== 1 ? 'es' : ''}`
            : `${dateString}: Sin actividad`;
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
            if (activityCount > 0) {
                console.log(`Mostrar actividad para ${dateString}`);
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
    versionInfoElement.textContent = `v${getCurrentVersion()}`;
}

if (forceUpdateBtn) {
    forceUpdateBtn.addEventListener('click', async () => {
        if (confirm('¿Estás seguro de que quieres forzar la actualización de la aplicación? Esto limpiará el caché y recargará la página.')) {
            showLoading(forceUpdateBtn, 'Actualizando...');
            await forceAppUpdate();
        }
    });
}

showView('auth');