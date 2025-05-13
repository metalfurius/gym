// --- DOM Elements ---
export const views = {
    auth: document.getElementById('auth-view'),
    dashboard: document.getElementById('dashboard-view'),
    session: document.getElementById('session-view'),
    history: document.getElementById('history-view'),
    manageRoutines: document.getElementById('manage-routines-view'),
    routineEditor: document.getElementById('routine-editor-view')
};

export const navButtons = {
    dashboard: document.getElementById('nav-dashboard'),
    manageRoutines: document.getElementById('nav-manage-routines'), // New nav button
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
    daySelect: document.getElementById('day-select'), // Now populates with user's routines
    startSessionBtn: document.getElementById('start-session-btn'),
    resumeSessionArea: document.getElementById('resume-session-area'), 
    resumeSessionBtn: document.getElementById('resume-session-btn'),
    resumeSessionInfo: document.getElementById('resume-session-info'),
    manageRoutinesLinkBtn: document.getElementById('manage-routines-link-btn')
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
};

export const manageRoutinesElements = {
    list: document.getElementById('routine-list'),
    loadingSpinner: document.getElementById('routines-loading'),
    addNewBtn: document.getElementById('add-new-routine-btn'),
    initializeSampleRoutinesBtn: document.getElementById('initialize-sample-routines-btn') // <<< AÑADIR ESTA LÍNEA
};

export const routineEditorElements = {
    form: document.getElementById('routine-editor-form'),
    title: document.getElementById('routine-editor-title'),
    routineIdInput: document.getElementById('routine-id'), // Hidden input for ID
    routineNameInput: document.getElementById('routine-name'),
    exercisesContainer: document.getElementById('routine-exercises-container'),
    addExerciseBtn: document.getElementById('add-exercise-to-routine-btn'),
    saveRoutineBtn: document.getElementById('save-routine-btn'),
    cancelEditRoutineBtn: document.getElementById('cancel-edit-routine-btn'),
    deleteRoutineBtn: document.getElementById('delete-routine-btn')
};


// --- UI Functions ---

export function showView(viewToShowId) {
    Object.values(views).forEach(view => view.classList.add('hidden'));
    if (views[viewToShowId]) {
        views[viewToShowId].classList.remove('hidden');
    } else {
        console.error(`View with id ${viewToShowId} not found.`);
    }

    Object.values(navButtons).forEach(btn => btn.classList.remove('active'));
    if (viewToShowId === 'dashboard' && navButtons.dashboard) navButtons.dashboard.classList.add('active');
    if (viewToShowId === 'manageRoutines' && navButtons.manageRoutines) navButtons.manageRoutines.classList.add('active');
    if (viewToShowId === 'history' && navButtons.history) navButtons.history.classList.add('active');
    // routineEditor is a sub-view, doesn't need nav highlighting
}

export function updateNav(isLoggedIn) {
    const commonButtons = [navButtons.dashboard, navButtons.manageRoutines, navButtons.history, navButtons.logout];
    if (isLoggedIn) {
        commonButtons.forEach(btn => btn.classList.remove('hidden'));
        dashboardElements.userEmail.parentElement.classList.remove('hidden');
    } else {
        commonButtons.forEach(btn => btn.classList.add('hidden'));
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
    authElements.errorMsg.textContent = message;
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

// Populates the day selector on the dashboard with the user's routines
export function populateDaySelector(userRoutines) {
    dashboardElements.daySelect.innerHTML = '<option value="">-- Elige una rutina --</option>'; // Reset
    if (userRoutines && userRoutines.length > 0) {
        userRoutines.forEach(routine => {
            const option = document.createElement('option');
            option.value = routine.id; // Firestore document ID
            option.textContent = routine.name;
            dashboardElements.daySelect.appendChild(option);
        });
    } else {
        const option = document.createElement('option');
        option.value = "";
        option.textContent = "No tienes rutinas. ¡Crea una!";
        option.disabled = true;
        dashboardElements.daySelect.appendChild(option);
    }
    dashboardElements.startSessionBtn.disabled = true; // Disable until a routine is selected
}


export function renderSessionView(routine, inProgressData = null) {
    if (!routine || !routine.exercises) {
        console.error("Routine data is invalid for session view:", routine);
        alert("Error: Datos de la rutina no válidos.");
        showView('dashboard');
        return;
    }

    sessionElements.title.textContent = routine.name;
    sessionElements.exerciseList.innerHTML = ''; // Clear previous exercises
    
    // Añadir campo para el peso del usuario
    const userWeightDiv = document.createElement('div');
    userWeightDiv.className = 'user-weight-input';
    
    const userWeightLabel = document.createElement('label');
    userWeightLabel.textContent = 'Tu peso hoy (kg):';
    userWeightLabel.htmlFor = 'user-weight';
    userWeightDiv.appendChild(userWeightLabel);
    
    const userWeightInput = document.createElement('input');
    userWeightInput.type = 'number';
    userWeightInput.id = 'user-weight';
    userWeightInput.name = 'user-weight';
    userWeightInput.placeholder = 'Introduce tu peso (kg)';
    userWeightInput.min = '20';
    userWeightInput.max = '250';
    userWeightInput.step = '0.1';
    if (inProgressData?.pesoUsuario) {
        userWeightInput.value = inProgressData.pesoUsuario;
    }
    userWeightDiv.appendChild(userWeightInput);
    
    sessionElements.exerciseList.appendChild(userWeightDiv);

    routine.exercises.forEach((exercise, exerciseIndex) => {
        const exerciseBlock = document.createElement('div');
        exerciseBlock.className = 'exercise-block';
        exerciseBlock.dataset.exerciseIndex = exerciseIndex;

        const title = document.createElement('h3');
        title.classList.add('exercise-name-title');
        title.textContent = exercise.name;
        exerciseBlock.appendChild(title);

        const target = document.createElement('p');
        target.className = 'target-info';

        if (exercise.type === 'strength') {
            const setsDisplay = typeof exercise.sets === 'number' ? `${exercise.sets} series` : exercise.sets;
            target.textContent = `Objetivo: ${setsDisplay} x ${exercise.reps} reps`;
        } else if (exercise.type === 'cardio') {
            target.textContent = `Objetivo: ${exercise.duration || 'Tiempo/Distancia'}`;
        } else {
            target.textContent = `Objetivo: ${exercise.reps || 'Completar'}`; // Fallback for unknown or old types
        }
        exerciseBlock.appendChild(target);

        // Inputs for sets
        if (exercise.type === 'strength') {
            const numberOfSets = parseInt(exercise.sets) || 0;
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
                weightInput.step = "0.25";
                if (inProgressData?.ejercicios[exerciseIndex]?.sets[i]) {
                    weightInput.value = inProgressData.ejercicios[exerciseIndex].sets[i].peso || '';
                }
                setRow.appendChild(weightInput);

                const repsInput = document.createElement('input');
repsInput.type = 'number';
                repsInput.id = `reps-${exerciseIndex}-${i}`;
                repsInput.name = `reps-${exerciseIndex}-${i}`;
                repsInput.placeholder = 'Reps';
                repsInput.min = "0";
                if (inProgressData?.ejercicios[exerciseIndex]?.sets[i]) {
                    repsInput.value = inProgressData.ejercicios[exerciseIndex].sets[i].reps || '';
                }
                setRow.appendChild(repsInput);
                exerciseBlock.appendChild(setRow);
            }
        } else if (exercise.type === 'cardio') {
            // For cardio, maybe just one input for actual duration/distance or rely on notes
            // Or could have a specific input if desired, for now, it's simpler
            const infoPara = document.createElement('p');
            infoPara.textContent = "Registra los detalles en las notas.";
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
        notesTextarea.placeholder = exercise.type === 'cardio' ? 'Ej: 20 min a 140bpm, o 5km en 25 min...' : 'Añade notas sobre este ejercicio...';
        notesTextarea.className = 'exercise-notes';
        if (inProgressData?.ejercicios[exerciseIndex]) {
            notesTextarea.value = inProgressData.ejercicios[exerciseIndex].notasEjercicio || '';
        }
        exerciseBlock.appendChild(notesTextarea);
        sessionElements.exerciseList.appendChild(exerciseBlock);
    });
    showView('session');
}

export function renderHistoryList(sessions) {
    historyElements.loadingSpinner.classList.add('hidden');
    historyElements.list.innerHTML = '';

    if (!sessions || sessions.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No hay sesiones guardadas todavía.';
        historyElements.list.appendChild(li);
        return;
    }

    sessions.forEach(session => {
        const li = document.createElement('li');
        li.dataset.sessionId = session.id;

        const contentDiv = document.createElement('div'); // Contenedor para nombre y fecha
        contentDiv.style.flexGrow = "1"; // Para que ocupe el espacio y empuje el botón
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = session.nombreEntrenamiento || session.diaEntrenamiento;
        nameSpan.style.display = "block"; // Para que esté en una línea separada si es largo        const dateSpan = document.createElement('span');
        dateSpan.className = 'date';
        
        let dateText = formatDateShort(session.fecha.toDate());
        // Mostrar peso si está disponible
        if (session.pesoUsuario) {
            dateText += ` | ${session.pesoUsuario} kg`;
        }
        dateSpan.textContent = dateText;
        
        contentDiv.appendChild(nameSpan);
        contentDiv.appendChild(dateSpan);
        li.appendChild(contentDiv);

        // --- NUEVO: Botón de eliminar ---
        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Eliminar';
        deleteButton.classList.add('secondary', 'small-btn'); // Puedes añadir una clase 'small-btn' en CSS
        deleteButton.style.padding = '5px 8px'; // Estilo rápido
        deleteButton.style.fontSize = '0.8rem';
        deleteButton.style.width = 'auto';
        deleteButton.style.marginLeft = '10px';
        deleteButton.dataset.action = 'delete-session'; // Para identificar la acción en el listener
        deleteButton.dataset.sessionId = session.id; // Pasamos el id aquí también para facilidad
        li.appendChild(deleteButton);
        // --- FIN NUEVO ---

        historyElements.list.appendChild(li);
    });
}

export function showSessionDetail(sessionData) {
    if (!sessionData) return;
    sessionDetailModal.title.textContent = sessionData.nombreEntrenamiento || "Detalle de Sesión";
    sessionDetailModal.date.textContent = `Fecha: ${formatDate(sessionData.fecha.toDate())}`;
    
    // Añadir información del peso si está disponible
    let dateInfo = `Fecha: ${formatDate(sessionData.fecha.toDate())}`;
    if (sessionData.pesoUsuario) {
        dateInfo += ` | Peso: ${sessionData.pesoUsuario} kg`;
    }
    sessionDetailModal.date.textContent = dateInfo;
    
    sessionDetailModal.exercises.innerHTML = '';
    
    sessionData.ejercicios.forEach(ex => {
        const exLi = document.createElement('li');
        let exHtml = `<strong>${ex.nombreEjercicio}</strong> (${ex.tipoEjercicio || 'fuerza'})`; // Show type
        if (ex.tipoEjercicio === 'strength' && ex.sets && ex.sets.length > 0) {
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

export function renderManageRoutinesView(routines) {
    manageRoutinesElements.loadingSpinner.classList.add('hidden');
    manageRoutinesElements.list.innerHTML = '';

    if (!routines || routines.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No tienes rutinas personalizadas. ¡Crea una o usa las de muestra!';
        // Optionally add a button here to "Copiar rutinas de muestra"
        manageRoutinesElements.list.appendChild(li);
        return;
    }

    routines.forEach(routine => {
        const li = document.createElement('li');
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'routine-name';
        nameSpan.textContent = routine.name;
        li.appendChild(nameSpan);

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'actions';

        const editBtn = document.createElement('button');
        editBtn.textContent = 'Editar';
        editBtn.classList.add('ghost');
        editBtn.dataset.routineId = routine.id;
        editBtn.addEventListener('click', (e) => {
            // Callback to app.js to handle edit
            const event = new CustomEvent('editRoutineClicked', { detail: { routineId: e.target.dataset.routineId }});
            document.dispatchEvent(event);
        });
        actionsDiv.appendChild(editBtn);
        
        // Delete button can be added here later if needed
        // const deleteBtn = document.createElement('button'); /* ... */

        li.appendChild(actionsDiv);
        manageRoutinesElements.list.appendChild(li);
    });
    showView('manageRoutines');
}

let exerciseEditorCounter = 0; // To give unique IDs to dynamically added exercise fields

export function renderRoutineEditor(routine = null) {
    routineEditorElements.form.reset();
    routineEditorElements.exercisesContainer.innerHTML = ''; // Clear existing exercises
    exerciseEditorCounter = 0;

    if (routine) { // Editing existing routine
        routineEditorElements.title.textContent = 'Editar Rutina';
        routineEditorElements.routineIdInput.value = routine.id;
        routineEditorElements.routineNameInput.value = routine.name;
        routineEditorElements.deleteRoutineBtn.classList.remove('hidden');
        routineEditorElements.deleteRoutineBtn.dataset.routineId = routine.id;


        routine.exercises.forEach(ex => addExerciseToEditorForm(ex));
    } else { // Creating new routine
        routineEditorElements.title.textContent = 'Crear Nueva Rutina';
        routineEditorElements.routineIdInput.value = ''; // No ID yet for new
        routineEditorElements.deleteRoutineBtn.classList.add('hidden');
        addExerciseToEditorForm(); // Add one empty exercise to start
    }
    showView('routineEditor');
}


export function addExerciseToEditorForm(exerciseData = null) {
    exerciseEditorCounter++;
    const exerciseDiv = document.createElement('div');
    exerciseDiv.className = 'routine-exercise-editor';
    exerciseDiv.dataset.editorId = `exEditor-${exerciseEditorCounter}`;

    let exerciseType = exerciseData?.type || 'strength';

    exerciseDiv.innerHTML = `
        <button type="button" class="remove-exercise-btn" data-target="${exerciseDiv.dataset.editorId}">× Quitar</button>
        <label for="ex-name-${exerciseEditorCounter}">Nombre del Ejercicio:</label>
        <input type="text" id="ex-name-${exerciseEditorCounter}" name="ex-name" value="${exerciseData?.name || ''}" required>

        <label for="ex-type-${exerciseEditorCounter}">Tipo de Ejercicio:</label>
        <select id="ex-type-${exerciseEditorCounter}" name="ex-type">
            <option value="strength" ${exerciseType === 'strength' ? 'selected' : ''}>Fuerza (Series/Reps)</option>
            <option value="cardio" ${exerciseType === 'cardio' ? 'selected' : ''}>Cardio (Duración)</option>
        </select>

        <div class="strength-fields" style="display: ${exerciseType === 'strength' ? 'block' : 'none'};">
            <div class="form-grid">
                <div>
                    <label for="ex-sets-${exerciseEditorCounter}">Series:</label>
                    <input type="number" id="ex-sets-${exerciseEditorCounter}" name="ex-sets" min="0" value="${exerciseData?.sets || ''}">
                </div>
                <div>
                    <label for="ex-reps-${exerciseEditorCounter}">Reps/Objetivo:</label>
                    <input type="text" id="ex-reps-${exerciseEditorCounter}" name="ex-reps" value="${exerciseData?.reps || ''}">
                </div>
            </div>
        </div>
        <div class="cardio-fields" style="display: ${exerciseType === 'cardio' ? 'block' : 'none'};">
            <label for="ex-duration-${exerciseEditorCounter}">Duración/Objetivo:</label>
            <input type="text" id="ex-duration-${exerciseEditorCounter}" name="ex-duration" value="${exerciseData?.duration || ''}">
        </div>
        <label for="ex-notes-${exerciseEditorCounter}">Notas Adicionales (opcional):</label>
        <textarea id="ex-notes-${exerciseEditorCounter}" name="ex-notes" placeholder="Ej: usar agarre supino, aumentar peso la próxima vez...">${exerciseData?.notes || ''}</textarea>
    `;
    routineEditorElements.exercisesContainer.appendChild(exerciseDiv);

    const typeSelect = exerciseDiv.querySelector('select[name="ex-type"]');
    const strengthFields = exerciseDiv.querySelector('.strength-fields');
    const cardioFields = exerciseDiv.querySelector('.cardio-fields');

    typeSelect.addEventListener('change', (e) => {
        if (e.target.value === 'strength') {
            strengthFields.style.display = 'block';
            cardioFields.style.display = 'none';
        } else {
            strengthFields.style.display = 'none';
            cardioFields.style.display = 'block';
        }
    });

    const removeBtn = exerciseDiv.querySelector('.remove-exercise-btn');
    removeBtn.addEventListener('click', () => {
        exerciseDiv.remove();
    });
}


export function showLoading(buttonElement, text = 'Cargando...') {
    if (buttonElement) {
        buttonElement.disabled = true;
        buttonElement.dataset.originalText = buttonElement.textContent;
        buttonElement.innerHTML = `<span class="spinner spinner-inline"></span> ${text}`;
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

export const calendarElements = {
    container: document.getElementById('activity-calendar-container'),
    calendarView: document.getElementById('activity-calendar'),
    prevYearBtn: document.getElementById('prev-year-btn'),
    nextYearBtn: document.getElementById('next-year-btn'),
    currentYearDisplay: document.getElementById('current-year-display'),
    loadingSpinner: document.getElementById('calendar-loading-spinner')
}