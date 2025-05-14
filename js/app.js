import { db } from './firebase-config.js'; // auth is handled in auth.js
import { collection, addDoc, Timestamp, query, orderBy, getDocs, doc, getDoc, setDoc, deleteDoc, writeBatch, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getCurrentUser, handleLogout } from './auth.js'; // Removed login/signup handlers, they are in auth.js
import {
    showView, updateNav, formatDate, populateDaySelector, renderSessionView,
    renderHistoryList, showSessionDetail, hideSessionDetail, renderManageRoutinesView,
    renderRoutineEditor, addExerciseToEditorForm,
    views, navButtons, authElements, dashboardElements, sessionElements, historyElements, sessionDetailModal,
    manageRoutinesElements, routineEditorElements, showLoading, hideLoading,
    calendarElements
} from './ui.js';
import { sampleWorkoutRoutines, saveInProgressSession, loadInProgressSession, clearInProgressSession } from './store.js';

// --- State ---
let currentCalendarYear = new Date().getFullYear();
let currentRoutineForSession = null; // Stores the full routine object for the active session
let currentUserRoutines = []; // Cache for user's routines
let allSessionsCache = []; 

// --- App Initialization triggered by Auth ---
export async function initializeAppAfterAuth(user) {
    if (user) {
        dashboardElements.currentDate.textContent = formatDate(new Date());
        await fetchUserRoutines(user); // Fetch routines first
        checkAndOfferResumeSession(); // Then check for resume
        currentCalendarYear = new Date().getFullYear(); 
        updateCalendarView();
    } else {
        currentRoutineForSession = null;
        currentUserRoutines = [];
        populateDaySelector([]); // Clear day selector
        sessionElements.form.reset();
        historyElements.list.innerHTML = '<li id="history-loading">Cargando historial...</li>';
        manageRoutinesElements.list.innerHTML = '<li id="routines-loading">Cargando rutinas...</li>';
        if (calendarElements.container) calendarElements.container.classList.add('hidden');
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
    fetchUserRoutines(getCurrentUser()); // Refresh routines in case they were edited
    checkAndOfferResumeSession();
    updateCalendarView();
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
    const user = getCurrentUser();
    if (!user) return;

    const targetButton = event.target.closest('button[data-action="delete-session"]');
    const listItem = event.target.closest('li[data-session-id]');

    if (targetButton) { // --- SE HA HECHO CLIC EN EL BOTÓN DE ELIMINAR ---
        event.stopPropagation(); // Evita que se active el modal de detalles si el botón está dentro del li
        const sessionIdToDelete = targetButton.dataset.sessionId;
        const sessionName = listItem.querySelector('span:not(.date)').textContent; // Para el mensaje de confirmación

        if (confirm(`¿Estás seguro de que quieres eliminar la sesión "${sessionName}"? Esta acción no se puede deshacer.`)) {
            showLoading(targetButton, 'Eliminando...');
            try {
                const sessionDocRef = doc(db, "users", user.uid, "sesiones_entrenamiento", sessionIdToDelete);
                await deleteDoc(sessionDocRef);
                // alert("Sesión eliminada con éxito."); // Opcional, el refresco de la lista es suficiente
                fetchAndRenderHistory(); // Refresca la lista para quitar el elemento eliminado
                // También actualiza el cache local si lo usas activamente para otras cosas
                allSessionsCache = allSessionsCache.filter(s => s.id !== sessionIdToDelete);
            } catch (error) {
                console.error("Error eliminando sesión del historial: ", error);
                alert("Error al eliminar la sesión.");
                hideLoading(targetButton);
            }
            // No necesitas hideLoading aquí si el botón desaparece con el refresh
        }
    } else if (listItem) { // --- SE HA HECHO CLIC EN EL LI (para ver detalles) ---
        const sessionId = listItem.dataset.sessionId;
        let sessionData = allSessionsCache.find(s => s.id === sessionId);
        if (!sessionData) {
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


// Función para obtener los datos de actividad (ya la sugerí antes, aquí la adaptamos)
async function getYearlyActivity(userId, year) {
    calendarElements.loadingSpinner.classList.remove('hidden');
    const activityMap = new Map(); // 'YYYY-MM-DD' -> count
    const startDate = new Date(year, 0, 1); // Enero 1
    const endDate = new Date(year, 11, 31, 23, 59, 59); // Diciembre 31

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
                const dateString = session.fecha.toDate().toISOString().split('T')[0]; // YYYY-MM-DD
                activityMap.set(dateString, (activityMap.get(dateString) || 0) + 1);
            }
        });
    } catch (error) {
        console.error("Error fetching yearly activity:", error);
        // Podrías mostrar un mensaje de error en la UI del calendario
    } finally {
        calendarElements.loadingSpinner.classList.add('hidden');
    }
    return activityMap;
}

function getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}

function renderActivityCalendar(year, activityData) {
    calendarElements.calendarView.innerHTML = ''; // Limpiar calendario anterior
    calendarElements.currentYearDisplay.textContent = year;

    const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    
    // Encabezados de los meses (opcional, pero útil)
    // Esto es una simplificación, para una cuadrícula estilo GitHub es más complejo alinear meses y días
    // Aquí haremos una lista continua de días del año.

    let firstDayOfYear = new Date(year, 0, 1).getDay(); // 0 (Domingo) - 6 (Sábado)
    // Para que Lunes sea el primer día (0) y Domingo el último (6)
    firstDayOfYear = (firstDayOfYear === 0) ? 6 : firstDayOfYear - 1;


    // Añadir celdas vacías para alinear el primer día de la semana (Lunes)
    for (let i = 0; i < firstDayOfYear; i++) {
        const placeholderCell = document.createElement('div');
        placeholderCell.classList.add('day-cell', 'is-placeholder');
        calendarElements.calendarView.appendChild(placeholderCell);
    }

    for (let month = 0; month < 12; month++) {
        const daysInCurrentMonth = getDaysInMonth(year, month);
        for (let day = 1; day <= daysInCurrentMonth; day++) {
            const cell = document.createElement('div');
            cell.classList.add('day-cell');
            const currentDate = new Date(year, month, day);
            const dateString = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD

            const activityCount = activityData.get(dateString) || 0;
            let activityLevel = 0;
            if (activityCount > 0) activityLevel = 1;
            if (activityCount >= 2) activityLevel = 2; // Ajusta estos umbrales
            if (activityCount >= 3) activityLevel = 3;
            if (activityCount >= 4) activityLevel = 4;

            cell.classList.add(`level-${activityLevel}`);
            cell.title = `${dateString}: ${activityCount} sesión(es)`;
            // cell.textContent = day; // Opcional: mostrar el número del día

            // Opcional: Hacer clickeable para filtrar historial
            cell.addEventListener('click', () => {
                if (activityCount > 0) {
                    // Aquí podrías implementar una función para filtrar el historial por esta fecha
                    // Por ejemplo: filterHistoryByDate(currentDate);
                    console.log(`Mostrar actividad para ${dateString}`);
                    // Podrías abrir el modal de historial o filtrar la vista de historial
                    // showView('history');
                    // fetchAndRenderHistory({ filterDate: currentDate }); // Necesitarías modificar fetchAndRenderHistory
                }
            });

            calendarElements.calendarView.appendChild(cell);
        }
    }
}

async function updateCalendarView() {
    const user = getCurrentUser();
    if (!user) {
        calendarElements.container.classList.add('hidden'); // Ocultar si no hay usuario
        return;
    }
    calendarElements.container.classList.remove('hidden');
    const activity = await getYearlyActivity(user.uid, currentCalendarYear);
    renderActivityCalendar(currentCalendarYear, activity);
}

// --- Event Listeners para el Calendario (dentro de initializeAppAfterAuth o al mostrar dashboard) ---
// Es mejor añadirlos una vez el DOM esté listo.
// Puedes ponerlos cerca de los otros listeners del dashboard.

if (calendarElements.prevYearBtn) {
    calendarElements.prevYearBtn.addEventListener('click', () => {
        currentCalendarYear--;
        updateCalendarView();
    });
}
if (calendarElements.nextYearBtn) {
    calendarElements.nextYearBtn.addEventListener('click', () => {
        currentCalendarYear++;
        updateCalendarView();
    });
}

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

showView('auth');