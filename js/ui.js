import { workoutRoutine } from './store.js';

// --- DOM Elements ---
export const views = {
    auth: document.getElementById('auth-view'),
    dashboard: document.getElementById('dashboard-view'),
    session: document.getElementById('session-view'),
    history: document.getElementById('history-view')
};

export const navButtons = {
    dashboard: document.getElementById('nav-dashboard'),
    history: document.getElementById('nav-history'),
    logout: document.getElementById('logout-btn')
};

export const authElements = {
    form: document.getElementById('auth-form'),
    emailInput: document.getElementById('auth-email'),
    passwordInput: document.getElementById('auth-password'),
    loginBtn: document.getElementById('login-email-btn'),
    signupBtn: document.getElementById('signup-email-btn'),
    errorMsg: document.getElementById('auth-error')
};

export const dashboardElements = {
    userEmail: document.getElementById('user-email'),
    currentDate: document.getElementById('current-date'),
    daySelect: document.getElementById('day-select'),
    startSessionBtn: document.getElementById('start-session-btn'),
    resumeSessionBtn: document.getElementById('resume-session-btn'),
    resumeSessionInfo: document.getElementById('resume-session-info'),
};

export const sessionElements = {
    form: document.getElementById('session-form'),
    title: document.getElementById('session-title'),
    exerciseList: document.getElementById('exercise-list'),
    saveBtn: document.getElementById('save-session-btn'),
    cancelBtn: document.getElementById('cancel-session-btn')
};

export const historyElements = {
    list: document.getElementById('history-list'),
    loadingSpinner: document.getElementById('history-loading')
};

export const sessionDetailModal = {
    modal: document.getElementById('session-detail-modal'),
    closeBtn: document.querySelector('.modal-close'),
    title: document.getElementById('session-detail-title'),
    date: document.getElementById('session-detail-date'),
    exercises: document.getElementById('session-detail-exercises')
}

// --- UI Functions ---

export function showView(viewToShowId) {
    Object.values(views).forEach(view => view.classList.add('hidden'));
    if (views[viewToShowId]) {
        views[viewToShowId].classList.remove('hidden');
    } else {
        console.error(`View with id ${viewToShowId} not found.`);
    }

    // Highlight active nav button
    Object.values(navButtons).forEach(btn => btn.classList.remove('active'));
    if (viewToShowId === 'dashboard' && navButtons.dashboard) navButtons.dashboard.classList.add('active');
    if (viewToShowId === 'history' && navButtons.history) navButtons.history.classList.add('active');
}

export function updateNav(isLoggedIn) {
    if (isLoggedIn) {
        navButtons.dashboard.classList.remove('hidden');
        navButtons.history.classList.remove('hidden');
        navButtons.logout.classList.remove('hidden');
        dashboardElements.userEmail.parentElement.classList.remove('hidden');
    } else {
        navButtons.dashboard.classList.add('hidden');
        navButtons.history.classList.add('hidden');
        navButtons.logout.classList.add('hidden');
        dashboardElements.userEmail.parentElement.classList.add('hidden');
        dashboardElements.resumeSessionBtn.classList.add('hidden');
        dashboardElements.resumeSessionInfo.textContent = '';
    }
}

export function displayAuthError(message) {
    authElements.errorMsg.textContent = message;
    authElements.errorMsg.classList.remove('success-message');
    authElements.errorMsg.classList.add('error-message');
}
export function displayAuthSuccess(message) {
    authElements.errorMsg.textContent = message; // Using same element for simplicity
    authElements.errorMsg.classList.remove('error-message');
    authElements.errorMsg.classList.add('success-message');
}

export function clearAuthMessages() {
    authElements.errorMsg.textContent = '';
}

export function formatDate(date) {
    if (!date) return 'N/A';
    return date.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function formatDateShort(date) {
    if (!date) return 'N/A';
    return date.toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' });
}


export function populateDaySelector() {
    dashboardElements.daySelect.innerHTML = '<option value="">-- Elige un día --</option>'; // Reset
    for (const dayId in workoutRoutine) {
        const option = document.createElement('option');
        option.value = dayId;
        option.textContent = workoutRoutine[dayId].name;
        dashboardElements.daySelect.appendChild(option);
    }
}

export function renderSessionView(dayId, inProgressData = null) {
    const workout = workoutRoutine[dayId];
    if (!workout) {
        console.error("Workout day not found:", dayId);
        alert("Error: Día de entrenamiento no encontrado.");
        showView('dashboard');
        return;
    }

    sessionElements.title.textContent = workout.name;
    sessionElements.exerciseList.innerHTML = ''; // Clear previous exercises

    workout.exercises.forEach((exercise, exerciseIndex) => {
        const exerciseBlock = document.createElement('div');
        exerciseBlock.className = 'exercise-block';
        exerciseBlock.dataset.exerciseIndex = exerciseIndex; // Store original index

        const title = document.createElement('h3');
        title.textContent = exercise.name;
        exerciseBlock.appendChild(title);

        const target = document.createElement('p');
        target.className = 'target-info';
        const setsDisplay = typeof exercise.sets === 'number' ? `${exercise.sets} series` : exercise.sets;
        target.textContent = `Objetivo: ${setsDisplay} x ${exercise.reps} reps`;
        exerciseBlock.appendChild(target);

        // Inputs for sets (weight and reps)
        if (exercise.type !== 'cardio' && !exercise.reps.toLowerCase().includes("min")) { // Don't show for cardio/timed
            const numberOfSets = parseInt(exercise.sets) || 0; // Fallback to 0 if not a number
            for (let i = 0; i < numberOfSets; i++) {
                const setRow = document.createElement('div');
                setRow.className = 'set-row';
                setRow.dataset.setIndex = i;

                const setLabel = document.createElement('label');
                setLabel.textContent = `Serie ${i + 1}:`;
                setLabel.htmlFor = `weight-${exerciseIndex}-${i}`;
                setRow.appendChild(setLabel);

                const weightInput = document.createElement('input');
                weightInput.type = 'number';
                weightInput.id = `weight-${exerciseIndex}-${i}`;
                weightInput.name = `weight-${exerciseIndex}-${i}`;
                weightInput.placeholder = 'Peso (kg)';
                weightInput.min = "0";
                weightInput.step = "0.25"; // Common increment
                if (inProgressData && inProgressData.ejercicios[exerciseIndex]?.sets[i]) {
                    weightInput.value = inProgressData.ejercicios[exerciseIndex].sets[i].peso || '';
                }
                setRow.appendChild(weightInput);

                const repsInput = document.createElement('input');
                repsInput.type = 'number';
                repsInput.id = `reps-${exerciseIndex}-${i}`;
                repsInput.name = `reps-${exerciseIndex}-${i}`;
                repsInput.placeholder = 'Reps';
                repsInput.min = "0";
                if (inProgressData && inProgressData.ejercicios[exerciseIndex]?.sets[i]) {
                    repsInput.value = inProgressData.ejercicios[exerciseIndex].sets[i].reps || '';
                }
                setRow.appendChild(repsInput);
                
                exerciseBlock.appendChild(setRow);
            }
        } else {
             const infoPara = document.createElement('p');
            infoPara.textContent = exercise.reps.toLowerCase().includes("min") || exercise.reps.toLowerCase().includes("seg") ?
                                   "Registra el tiempo/distancia en las notas." :
                                   "(No se requiere entrada de peso/reps para este ítem)";
            infoPara.style.fontSize = '0.9em';
            infoPara.style.color = '#666';
            exerciseBlock.appendChild(infoPara);
        }


        const notesLabel = document.createElement('label');
        notesLabel.textContent = "Notas:";
        notesLabel.htmlFor = `notes-${exerciseIndex}`;
        notesLabel.style.marginTop = '10px';
        exerciseBlock.appendChild(notesLabel);

        const notesTextarea = document.createElement('textarea');
        notesTextarea.id = `notes-${exerciseIndex}`;
        notesTextarea.name = `notes-${exerciseIndex}`;
        notesTextarea.placeholder = 'Añade notas sobre este ejercicio...';
        notesTextarea.className = 'exercise-notes';
        if (inProgressData && inProgressData.ejercicios[exerciseIndex]) {
            notesTextarea.value = inProgressData.ejercicios[exerciseIndex].notasEjercicio || '';
        }
        exerciseBlock.appendChild(notesTextarea);

        sessionElements.exerciseList.appendChild(exerciseBlock);
    });
    showView('session');
}


export function renderHistoryList(sessions) {
    historyElements.loadingSpinner.classList.add('hidden');
    historyElements.list.innerHTML = ''; // Clear previous

    if (!sessions || sessions.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No hay sesiones guardadas todavía.';
        historyElements.list.appendChild(li);
        return;
    }

    sessions.forEach(session => {
        const li = document.createElement('li');
        li.dataset.sessionId = session.id; // Store Firebase doc ID

        const nameSpan = document.createElement('span');
        nameSpan.textContent = session.nombreEntrenamiento || session.diaEntrenamiento;

        const dateSpan = document.createElement('span');
        dateSpan.className = 'date';
        dateSpan.textContent = formatDateShort(session.fecha.toDate());
        
        li.appendChild(nameSpan);
        li.appendChild(dateSpan);
        historyElements.list.appendChild(li);
    });
}

export function showSessionDetail(sessionData) {
    if (!sessionData) {
        console.error("No session data provided to show detail");
        return;
    }
    sessionDetailModal.title.textContent = sessionData.nombreEntrenamiento || "Detalle de Sesión";
    sessionDetailModal.date.textContent = `Fecha: ${formatDate(sessionData.fecha.toDate())}`;
    
    sessionDetailModal.exercises.innerHTML = ''; // Clear previous
    
    sessionData.ejercicios.forEach(ex => {
        const exLi = document.createElement('li');
        let exHtml = `<strong>${ex.nombreEjercicio}</strong>`;
        if (ex.sets && ex.sets.length > 0) {
            exHtml += '<ul>';
            ex.sets.forEach((set, index) => {
                exHtml += `<li>Serie ${index + 1}: ${set.peso} kg x ${set.reps} reps</li>`;
            });
            exHtml += '</ul>';
        }
        if (ex.notasEjercicio) {
            exHtml += `<p><em>Notas: ${ex.notasEjercicio}</em></p>`;
        }
        exLi.innerHTML = exHtml;
        sessionDetailModal.exercises.appendChild(exLi);
    });

    sessionDetailModal.modal.style.display = 'block';
}

export function hideSessionDetail() {
    sessionDetailModal.modal.style.display = 'none';
}

export function showLoading(buttonElement, text = 'Cargando...') {
    if (buttonElement) {
        buttonElement.disabled = true;
        buttonElement.dataset.originalText = buttonElement.textContent;
        buttonElement.innerHTML = `<span class="spinner" style="width:18px; height:18px; border-width:2px; display:inline-block; vertical-align:middle; margin-right:5px;"></span> ${text}`;
    }
}

export function hideLoading(buttonElement) {
     if (buttonElement) {
        buttonElement.disabled = false;
        if (buttonElement.dataset.originalText) {
            buttonElement.textContent = buttonElement.dataset.originalText;
        }
    }
}