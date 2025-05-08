import { db } from './firebase-config.js'; // auth is handled in auth.js
import { collection, addDoc, Timestamp, query, orderBy, getDocs, doc, getDoc, setDoc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getCurrentUser, handleLogout } from './auth.js'; // Removed login/signup handlers, they are in auth.js
import {
    showView, updateNav, formatDate, populateDaySelector, renderSessionView,
    renderHistoryList, showSessionDetail, hideSessionDetail, renderManageRoutinesView,
    renderRoutineEditor, addExerciseToEditorForm,
    views, navButtons, authElements, dashboardElements, sessionElements, historyElements, sessionDetailModal,
    manageRoutinesElements, routineEditorElements, showLoading, hideLoading
} from './ui.js';
import { sampleWorkoutRoutines, saveInProgressSession, loadInProgressSession, clearInProgressSession } from './store.js';

// --- State ---
let currentRoutineForSession = null; // Stores the full routine object for the active session
let currentUserRoutines = []; // Cache for user's routines
let allSessionsCache = []; 

// --- App Initialization triggered by Auth ---
export async function initializeAppAfterAuth(user) {
    if (user) {
        dashboardElements.currentDate.textContent = formatDate(new Date());
        await fetchUserRoutines(user); // Fetch routines first
        checkAndOfferResumeSession(); // Then check for resume
    } else {
        currentRoutineForSession = null;
        currentUserRoutines = [];
        populateDaySelector([]); // Clear day selector
        sessionElements.form.reset();
        historyElements.list.innerHTML = '<li id="history-loading">Cargando historial...</li>';
        manageRoutinesElements.list.innerHTML = '<li id="routines-loading">Cargando rutinas...</li>';
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
    if (inProgress && user) {
        const routine = currentUserRoutines.find(r => r.id === inProgress.routineId);
        if (routine) {
            dashboardElements.resumeSessionInfo.textContent = `Tienes una sesión de "${routine.name}" sin guardar.`;
            dashboardElements.resumeSessionBtn.classList.remove('hidden');
            dashboardElements.resumeSessionBtn.onclick = () => {
                currentRoutineForSession = routine;
                renderSessionView(routine, inProgress.data);
                dashboardElements.resumeSessionBtn.classList.add('hidden');
                dashboardElements.resumeSessionInfo.textContent = '';
            };
        } else { // Routine might have been deleted
            clearInProgressSession();
            dashboardElements.resumeSessionBtn.classList.add('hidden');
            dashboardElements.resumeSessionInfo.textContent = '';
        }
    } else {
        dashboardElements.resumeSessionBtn.classList.add('hidden');
        dashboardElements.resumeSessionInfo.textContent = '';
    }
}


// --- Event Listeners ---

// Navigation
navButtons.dashboard.addEventListener('click', () => {
    showView('dashboard');
    fetchUserRoutines(getCurrentUser()); // Refresh routines in case they were edited
    checkAndOfferResumeSession();
});
navButtons.manageRoutines.addEventListener('click', () => {
    showView('manageRoutines');
    manageRoutinesElements.loadingSpinner.classList.remove('hidden');
    fetchUserRoutines(getCurrentUser()).then(() => {
         renderManageRoutinesView(currentUserRoutines); // Render after fetching
         manageRoutinesElements.loadingSpinner.classList.add('hidden');
    });
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
sessionElements.form.addEventListener('submit', saveSessionData);
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
        ejercicios: []
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
    event.preventDefault();
    const user = getCurrentUser();
    if (!currentRoutineForSession || !user) {
        alert("Error: No hay rutina activa o no has iniciado sesión.");
        return;
    }
    const sessionDataFromForm = getSessionFormData();
    if (sessionDataFromForm.ejercicios.length === 0) {
        alert("No se registraron datos para ningún ejercicio. Introduce datos o notas para guardar la sesión.");
        return;
    }

    const finalSessionData = {
        fecha: Timestamp.now(),
        routineId: currentRoutineForSession.id, // Link to the routine used
        nombreEntrenamiento: currentRoutineForSession.name,
        userId: user.uid,
        ejercicios: sessionDataFromForm.ejercicios
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

// History (fetchAndRenderHistory and list click listener largely same, but ensure session detail shows type)
async function fetchAndRenderHistory() {
    const user = getCurrentUser();
    if (!user) {
        historyElements.list.innerHTML = '<li>Debes iniciar sesión para ver tu historial.</li>';
        historyElements.loadingSpinner.classList.add('hidden');
        return;
    }
    historyElements.loadingSpinner.classList.remove('hidden');
    historyElements.list.innerHTML = ''; 
    try {
        const userSessionsCollectionRef = collection(db, "users", user.uid, "sesiones_entrenamiento");
        const q = query(userSessionsCollectionRef, orderBy("fecha", "desc"));
        const querySnapshot = await getDocs(q);
        allSessionsCache = []; 
        const sessionsForList = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            sessionsForList.push({ id: doc.id, nombreEntrenamiento: data.nombreEntrenamiento, fecha: data.fecha });
            allSessionsCache.push({id: doc.id, ...data });
        });
        renderHistoryList(sessionsForList);
    } catch (error) {
        console.error("Error fetching history:", error);
        historyElements.list.innerHTML = '<li>Error al cargar el historial.</li>';
    } finally {
        historyElements.loadingSpinner.classList.add('hidden');
    }
}
historyElements.list.addEventListener('click', async (event) => {
    const listItem = event.target.closest('li[data-session-id]');
    if (listItem) {
        const sessionId = listItem.dataset.sessionId;
        const user = getCurrentUser();
        if (!user) return;
        let sessionData = allSessionsCache.find(s => s.id === sessionId);
        if (!sessionData) {
            historyElements.loadingSpinner.classList.remove('hidden');
            try {
                const docRef = doc(db, "users", user.uid, "sesiones_entrenamiento", sessionId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) sessionData = { id: docSnap.id, ...docSnap.data() };
                else { alert("No se encontraron los detalles."); return; }
            } catch (err) { console.error("Error fetching session detail: ", err); alert("Error al cargar detalles."); return; }
            finally { historyElements.loadingSpinner.classList.add('hidden');}
        }
        if (sessionData) showSessionDetail(sessionData);
    }
});
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
if (manageRoutinesElements.initializeSampleRoutinesBtn) {
    manageRoutinesElements.initializeSampleRoutinesBtn.addEventListener('click', async () => {
        const user = getCurrentUser();
        if (user) {
            if (!confirm("Esto añadirá (o reemplazará si ya existen con el mismo ID) las rutinas de muestra a tu lista. ¿Continuar?")) {
                return;
            }
            showLoading(manageRoutinesElements.initializeSampleRoutinesBtn, 'Añadiendo...');
            try {
                // Llamamos a initializeUserRoutines con 'isNewUser' = true
                // para forzar la adición de las rutinas de muestra.
                // La función existente maneja esto bien: si (snapshot.empty || isNewUser)
                await initializeUserRoutines(user, true); 
                alert("Rutinas de muestra añadidas/restauradas con éxito.");
                // fetchUserRoutines es llamado dentro de initializeUserRoutines,
                // y si la vista de gestión de rutinas está activa, se actualizará.
                // Sin embargo, una llamada explícita para refrescar la vista actual no hace daño.
                if (!views.manageRoutines.classList.contains('hidden')) {
                     // currentUserRoutines ya debería estar actualizado por fetchUserRoutines
                    renderManageRoutinesView(currentUserRoutines);
                }
            } catch (error) {
                console.error("Error initializing sample routines from button:", error);
                alert("Error al añadir/restaurar las rutinas de muestra.");
            } finally {
                hideLoading(manageRoutinesElements.initializeSampleRoutinesBtn);
            }
        } else {
            alert("Debes iniciar sesión para realizar esta acción.");
            showView('auth'); // Opcional: redirigir a login si no está logueado
        }
    });
} else {
    console.error("Initialize sample routines button not found for attaching event listener.");
}

// PWA Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('ServiceWorker registered.', reg))
            .catch(err => console.error('ServiceWorker registration failed:', err));
    });
}

showView('auth');