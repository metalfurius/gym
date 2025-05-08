import { db, auth } from './firebase-config.js';
import { collection, addDoc, Timestamp, query, orderBy, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getCurrentUser, handleEmailLogin, handleEmailSignup, handleLogout } from './auth.js';
import {
    showView, updateNav, formatDate, populateDaySelector, renderSessionView,
    renderHistoryList, showSessionDetail, hideSessionDetail,
    views, navButtons, authElements, dashboardElements, sessionElements, historyElements, sessionDetailModal,
    showLoading, hideLoading
} from './ui.js';
import { workoutRoutine, getWorkoutById, saveInProgressSession, loadInProgressSession, clearInProgressSession } from './store.js';

// --- State ---
let currentWorkoutDayId = null;
let allSessionsCache = []; // Cache for history sessions to avoid re-fetching full detail unnecessarily


// --- App Initialization triggered by Auth ---
export function initializeAppAfterAuth(user) {
    if (user) {
        dashboardElements.currentDate.textContent = formatDate(new Date());
        checkAndOfferResumeSession();
    } else {
        // Clear any user-specific data from UI if needed
        currentWorkoutDayId = null;
        sessionElements.form.reset();
        historyElements.list.innerHTML = '<li id="history-loading">Cargando historial...</li>';
    }
}

function checkAndOfferResumeSession() {
    const inProgress = loadInProgressSession();
    if (inProgress && getCurrentUser()) { // Ensure user is logged in
        const workout = getWorkoutById(inProgress.dayId);
        if (workout) {
            dashboardElements.resumeSessionInfo.textContent = `Tienes una sesión de "${workout.name}" sin guardar.`;
            dashboardElements.resumeSessionBtn.classList.remove('hidden');
            dashboardElements.resumeSessionBtn.onclick = () => {
                currentWorkoutDayId = inProgress.dayId;
                renderSessionView(inProgress.dayId, inProgress.data);
                dashboardElements.resumeSessionBtn.classList.add('hidden');
                dashboardElements.resumeSessionInfo.textContent = '';
            };
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
    checkAndOfferResumeSession(); // Re-check if user navigates back
});
navButtons.history.addEventListener('click', () => {
    showView('history');
    fetchAndRenderHistory();
});
navButtons.logout.addEventListener('click', handleLogout);

// Auth
authElements.loginBtn.addEventListener('click', handleEmailLogin);
authElements.signupBtn.addEventListener('click', handleEmailSignup);
authElements.form.addEventListener('submit', (e) => e.preventDefault()); // Prevent form submission

// Dashboard
dashboardElements.daySelect.addEventListener('change', () => {
    dashboardElements.startSessionBtn.disabled = !dashboardElements.daySelect.value;
});

dashboardElements.startSessionBtn.addEventListener('click', () => {
    if (dashboardElements.daySelect.value) {
        const selectedDayId = dashboardElements.daySelect.value;
        // Ask before discarding an in-progress session if one exists and is different
        const inProgress = loadInProgressSession();
        if (inProgress && inProgress.dayId !== selectedDayId) {
            if (!confirm("Tienes otra sesión en progreso. ¿Descartarla y empezar una nueva?")) {
                return;
            }
            clearInProgressSession(); // Clear old one
        }
        currentWorkoutDayId = selectedDayId;
        renderSessionView(currentWorkoutDayId, inProgress && inProgress.dayId === selectedDayId ? inProgress.data : null);
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
        currentWorkoutDayId = null;
        showView('dashboard');
    }
});

// Save in-progress session data to localStorage on input change
sessionElements.exerciseList.addEventListener('input', () => {
    if (!currentWorkoutDayId) return;
    const formData = getSessionFormData();
    saveInProgressSession(currentWorkoutDayId, formData);
});


function getSessionFormData() {
    const workout = workoutRoutine[currentWorkoutDayId];
    const sessionData = {
        ejercicios: []
    };

    const exerciseBlocks = sessionElements.exerciseList.querySelectorAll('.exercise-block');
    exerciseBlocks.forEach(block => {
        const exerciseIndex = parseInt(block.dataset.exerciseIndex);
        const exercise = workout.exercises[exerciseIndex];
        const exerciseEntry = {
            nombreEjercicio: exercise.name,
            objetivoSets: exercise.sets,
            objetivoReps: exercise.reps,
            sets: [],
            notasEjercicio: block.querySelector(`textarea[name="notes-${exerciseIndex}"]`).value.trim() || ''
        };

        const setRows = block.querySelectorAll('.set-row');
        if (setRows.length > 0) {
            setRows.forEach((row, setIndex) => {
                const weightInput = row.querySelector(`input[name="weight-${exerciseIndex}-${setIndex}"]`);
                const repsInput = row.querySelector(`input[name="reps-${exerciseIndex}-${setIndex}"]`);

                // Only add set if there's some data
                if (weightInput.value || repsInput.value) {
                     exerciseEntry.sets.push({
                        peso: parseFloat(weightInput.value) || 0, // Default to 0 if empty/invalid
                        reps: parseInt(repsInput.value, 10) || 0  // Default to 0 if empty/invalid
                    });
                }
            });
        }
        sessionData.ejercicios.push(exerciseEntry);
    });
    return sessionData;
}


async function saveSessionData(event) {
    event.preventDefault();
    const user = getCurrentUser();
    if (!currentWorkoutDayId || !user) {
        alert("Error: No se ha seleccionado un día o no has iniciado sesión.");
        return;
    }

    const workout = workoutRoutine[currentWorkoutDayId];
    const sessionDataFromForm = getSessionFormData();

    const finalSessionData = {
        fecha: Timestamp.now(),
        diaEntrenamiento: currentWorkoutDayId,
        nombreEntrenamiento: workout.name,
        userId: user.uid,
        ejercicios: sessionDataFromForm.ejercicios.filter(ex => ex.sets.length > 0 || ex.notasEjercicio) // Only save exercises with data
    };


    if (finalSessionData.ejercicios.length === 0) {
        alert("No se registraron datos (peso/reps o notas) para ningún ejercicio. Introduce datos o notas para guardar la sesión.");
        return;
    }

    showLoading(sessionElements.saveBtn, 'Guardando...');

    try {
        const userSessionsCollectionRef = collection(db, "users", user.uid, "sesiones_entrenamiento");
        await addDoc(userSessionsCollectionRef, finalSessionData);
        alert("¡Sesión guardada con éxito!");
        sessionElements.form.reset();
        clearInProgressSession();
        currentWorkoutDayId = null;
        showView('dashboard');
        fetchAndRenderHistory(); // Refresh history view in background
    } catch (e) {
        console.error("Error adding document: ", e);
        alert("Error al guardar la sesión. Por favor, inténtalo de nuevo.");
    } finally {
        hideLoading(sessionElements.saveBtn);
    }
}

// History
async function fetchAndRenderHistory() {
    const user = getCurrentUser();
    if (!user) {
        historyElements.list.innerHTML = '<li>Debes iniciar sesión para ver tu historial.</li>';
        historyElements.loadingSpinner.classList.add('hidden');
        return;
    }

    historyElements.loadingSpinner.classList.remove('hidden');
    historyElements.list.innerHTML = ''; // Clear before loading

    try {
        const userSessionsCollectionRef = collection(db, "users", user.uid, "sesiones_entrenamiento");
        const q = query(userSessionsCollectionRef, orderBy("fecha", "desc"));
        const querySnapshot = await getDocs(q);

        allSessionsCache = []; // Clear cache
        const sessionsForList = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const sessionSummary = {
                id: doc.id,
                nombreEntrenamiento: data.nombreEntrenamiento,
                diaEntrenamiento: data.diaEntrenamiento,
                fecha: data.fecha
            };
            sessionsForList.push(sessionSummary);
            allSessionsCache.push({id: doc.id, ...data }); // Cache full data
        });
        renderHistoryList(sessionsForList);

    } catch (error) {
        console.error("Error fetching history:", error);
        historyElements.list.innerHTML = '<li>Error al cargar el historial.</li>';
        historyElements.loadingSpinner.classList.add('hidden');
    }
}

historyElements.list.addEventListener('click', async (event) => {
    const listItem = event.target.closest('li[data-session-id]');
    if (listItem) {
        const sessionId = listItem.dataset.sessionId;
        const user = getCurrentUser();
        if (!user) return;

        // Try to get from cache first
        let sessionData = allSessionsCache.find(s => s.id === sessionId);

        if (!sessionData) { // If not in cache (should be rare if list is populated), fetch it
            console.log("Session not in cache, fetching from Firebase:", sessionId);
            historyElements.loadingSpinner.classList.remove('hidden'); // Show a small loading indicator perhaps
            try {
                const docRef = doc(db, "users", user.uid, "sesiones_entrenamiento", sessionId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    sessionData = { id: docSnap.id, ...docSnap.data() };
                } else {
                    alert("No se encontraron los detalles de esta sesión.");
                    return;
                }
            } catch (err) {
                console.error("Error fetching session detail: ", err);
                alert("Error al cargar detalles de la sesión.");
                return;
            } finally {
                historyElements.loadingSpinner.classList.add('hidden');
            }
        }
        
        if (sessionData) {
            showSessionDetail(sessionData);
        }
    }
});

// Session Detail Modal
sessionDetailModal.closeBtn.addEventListener('click', hideSessionDetail);
window.addEventListener('click', (event) => { // Close on outside click
    if (event.target === sessionDetailModal.modal) {
        hideSessionDetail();
    }
});


// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}

// Initial UI setup based on auth state (handled by onAuthStateChanged in auth.js)
// The onAuthStateChanged in auth.js will call initializeAppAfterAuth.
// Default view can be auth until user state is determined.
showView('auth'); // Start with auth view, onAuthStateChanged will redirect if logged in