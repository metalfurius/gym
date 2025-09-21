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
    manageRoutinesLinkBtn: document.getElementById('manage-routines-link-btn'),
    exerciseStatsBtn: document.getElementById('exercise-stats-btn'),
    debugCacheBtn: document.getElementById('debug-cache-btn')
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
    loadingSpinner: document.getElementById('history-loading'),
    searchInput: document.getElementById('history-search'),
    paginationControls: document.getElementById('history-pagination-controls'),
    prevPageBtn: document.getElementById('history-prev-page-btn'),
    nextPageBtn: document.getElementById('history-next-page-btn'),
    pageInfo: document.getElementById('history-page-info')
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
    exportRoutinesBtn: document.getElementById('export-routines-btn'),
    deleteAllRoutinesBtn: document.getElementById('delete-all-routines-btn')
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
    if (!dashboardElements.daySelect) {
        console.error('Day select element not found');
        return;
    }
    
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
    
    if (dashboardElements.startSessionBtn) {
        dashboardElements.startSessionBtn.disabled = true; // Disable until a routine is selected
    } else {
        console.error('Start session button not found');
    }
}


export async function renderSessionView(routine, inProgressData = null) {
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
    userWeightDiv.appendChild(userWeightLabel);    const userWeightInput = document.createElement('input');
    userWeightInput.type = 'text';
    userWeightInput.id = 'user-weight';
    userWeightInput.name = 'user-weight';
    userWeightInput.placeholder = 'Introduce tu peso (kg)';
    userWeightInput.inputMode = 'decimal';
    userWeightInput.pattern = '[0-9]*[.,]?[0-9]*';
    
    // Reemplazar coma por punto inmediatamente y validar formato
    userWeightInput.addEventListener('input', function(e) {
        let value = e.target.value;
        // Reemplazar coma por punto
        value = value.replace(',', '.');
        // Permitir solo números, un punto decimal y máximo 2 decimales
        value = value.replace(/[^0-9.]/g, '');
        // Evitar múltiples puntos
        const parts = value.split('.');
        if (parts.length > 2) {
            value = parts[0] + '.' + parts.slice(1).join('');
        }
        // Limitar a 2 decimales
        if (parts[1] && parts[1].length > 2) {
            value = parts[0] + '.' + parts[1].substring(0, 2);
        }
        e.target.value = value;
    });
    
    // Validar rango y redondear a 1 decimal al terminar de editar
    userWeightInput.addEventListener('blur', function(e) {
        let value = e.target.value.replace(',', '.');
        if (value && !isNaN(value)) {
            const numValue = parseFloat(value);
            if (numValue < 20) {
                e.target.value = '20.0';
            } else if (numValue > 250) {
                e.target.value = '250.0';
            } else {
                const rounded = Math.round(numValue * 10) / 10;
                e.target.value = rounded;
            }
        }
    });
    
    if (inProgressData?.pesoUsuario) {
        userWeightInput.value = inProgressData.pesoUsuario;
    }
    userWeightDiv.appendChild(userWeightInput);    
    sessionElements.exerciseList.appendChild(userWeightDiv);

    // Process exercises with proper async handling
    for (let exerciseIndex = 0; exerciseIndex < routine.exercises.length; exerciseIndex++) {
        const exercise = routine.exercises[exerciseIndex];
        const exerciseBlock = document.createElement('div');
        exerciseBlock.className = 'exercise-block';
        exerciseBlock.dataset.exerciseIndex = exerciseIndex;

        const title = document.createElement('h3');
        title.classList.add('exercise-name-title');
        title.textContent = exercise.name;
        exerciseBlock.appendChild(title);

        const target = document.createElement('p');
        target.classList.add('target-info');

        if (exercise.type === 'strength') {
            const setsDisplay = typeof exercise.sets === 'number' ? `${exercise.sets} series` : exercise.sets;
            target.textContent = `Objetivo: ${setsDisplay} x ${exercise.reps} reps`;        } else if (exercise.type === 'cardio') {
            target.textContent = `Objetivo: ${exercise.duration || 'Tiempo/Distancia'}`;
        } else {
            target.textContent = `Objetivo: ${exercise.reps || 'Completar'}`; // Fallback for unknown or old types
        }
        exerciseBlock.appendChild(target);
        
        // Inputs for sets
        if (exercise.type === 'strength') {
            // Obtener sugerencias del cache para este ejercicio
            const { exerciseCache } = await import('./exercise-cache.js');
            const suggestions = exerciseCache.getExerciseSuggestions(exercise.name);
            
            // Mostrar información del último entrenamiento si existe
            if (suggestions.hasHistory) {
                const lastWorkoutInfo = document.createElement('div');
                lastWorkoutInfo.className = 'last-workout-info';
                
                const daysAgo = suggestions.daysSinceLastSession;
                const timeText = daysAgo === 0 ? 'hoy' : 
                                daysAgo === 1 ? 'ayer' : 
                                `hace ${daysAgo} días`;
                
                lastWorkoutInfo.innerHTML = `
                    <div class="last-workout-header">
                        <span class="last-workout-title">Último entrenamiento</span>
                        <span class="workout-time-ago">${timeText}</span>
                    </div>
                    <div class="last-workout-details">
                        ${suggestions.suggestions.lastSets.map((set, idx) => 
                            `<span class="last-set">S${idx + 1}: ${set.peso}kg × ${set.reps}</span>`
                        ).join('')}
                    </div>
                `;
                
                // Añadir botón para usar valores anteriores
                if (!inProgressData?.ejercicios[exerciseIndex]) {
                    const useLastBtn = document.createElement('button');
                    useLastBtn.type = 'button';
                    useLastBtn.className = 'btn btn-secondary btn-sm';
                    useLastBtn.textContent = '📋 Usar valores anteriores';
                    useLastBtn.style.marginTop = '8px';
                    useLastBtn.addEventListener('click', () => {
                        fillExerciseWithLastValues(exerciseIndex, suggestions.suggestions.lastSets);
                    });
                    lastWorkoutInfo.appendChild(useLastBtn);
                }
                
                exerciseBlock.appendChild(lastWorkoutInfo);
            } else {
                // Mostrar mensaje cuando no hay historial
                const noHistoryInfo = document.createElement('div');
                noHistoryInfo.className = 'no-exercise-history';
                noHistoryInfo.textContent = '💡 Primera vez haciendo este ejercicio. ¡Registra tus datos para futuras referencias!';
                exerciseBlock.appendChild(noHistoryInfo);
            }

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
                weightInput.type = 'text';
                weightInput.id = `weight-${exerciseIndex}-${i}`;
                weightInput.name = `weight-${exerciseIndex}-${i}`;
                  // Usar sugerencia del cache si está disponible y no hay datos en progreso
                let placeholderText = 'Peso (kg)';
                if (suggestions.hasHistory && suggestions.suggestions.lastSets[i]) {
                    const lastSet = suggestions.suggestions.lastSets[i];
                    if (lastSet && lastSet.peso > 0) {
                        placeholderText = `Último: ${lastSet.peso}kg`;
                        weightInput.dataset.suggestion = lastSet.peso;
                    }
                } else if (suggestions.hasHistory && suggestions.suggestions.peso > 0) {
                    placeholderText = `Sugerido: ${suggestions.suggestions.peso}kg`;
                    weightInput.dataset.suggestion = suggestions.suggestions.peso;
                }
                weightInput.placeholder = placeholderText;
                weightInput.inputMode = 'decimal';
                weightInput.pattern = '[0-9]*[.,]?[0-9]*';
                
                // Reemplazar coma por punto inmediatamente y validar formato
                weightInput.addEventListener('input', function(e) {
                    let value = e.target.value;
                    // Reemplazar coma por punto
                    value = value.replace(',', '.');
                    // Permitir solo números, un punto decimal y máximo 2 decimales
                    value = value.replace(/[^0-9.]/g, '');
                    // Evitar múltiples puntos
                    const parts = value.split('.');
                    if (parts.length > 2) {
                        value = parts[0] + '.' + parts.slice(1).join('');
                    }
                    // Limitar a 2 decimales
                    if (parts[1] && parts[1].length > 2) {
                        value = parts[0] + '.' + parts[1].substring(0, 2);
                    }
                    e.target.value = value;
                });
                
                // Redondear a 1 decimal al terminar de editar
                weightInput.addEventListener('blur', function(e) {
                    let value = e.target.value.replace(',', '.');
                    if (value && !isNaN(value)) {
                        const rounded = Math.round(parseFloat(value) * 10) / 10;
                        e.target.value = rounded;
                    }
                });
                
                if (inProgressData?.ejercicios[exerciseIndex]?.sets[i]) {
                    weightInput.value = inProgressData.ejercicios[exerciseIndex].sets[i].peso || '';
                }
                setRow.appendChild(weightInput);                const repsInput = document.createElement('input');
                repsInput.type = 'number';
                repsInput.id = `reps-${exerciseIndex}-${i}`;
                repsInput.name = `reps-${exerciseIndex}-${i}`;
                  // Usar sugerencia del cache si está disponible y no hay datos en progreso
                let repsPlaceholder = 'Reps';
                if (suggestions.hasHistory && suggestions.suggestions.lastSets[i]) {
                    const lastSet = suggestions.suggestions.lastSets[i];
                    if (lastSet && lastSet.reps > 0) {
                        repsPlaceholder = `Último: ${lastSet.reps}`;
                        repsInput.dataset.suggestion = lastSet.reps;
                    }
                } else if (suggestions.hasHistory && suggestions.suggestions.reps > 0) {
                    repsPlaceholder = `Sugerido: ${suggestions.suggestions.reps}`;
                    repsInput.dataset.suggestion = suggestions.suggestions.reps;
                }
                repsInput.placeholder = repsPlaceholder;
                repsInput.min = "0";
                if (inProgressData?.ejercicios[exerciseIndex]?.sets[i]) {
                    repsInput.value = inProgressData.ejercicios[exerciseIndex].sets[i].reps || '';
                }
                setRow.appendChild(repsInput);
                
                // If we have saved rest time data, restore it
                if (inProgressData?.ejercicios[exerciseIndex]?.sets[i]?.tiempoDescanso) {
                    const timerDisplay = setRow.querySelector(`#timer-display-${exerciseIndex}-${i}`);
                    if (timerDisplay) {
                        timerDisplay.textContent = inProgressData.ejercicios[exerciseIndex].sets[i].tiempoDescanso;
                    }
                }
                
                // Add the set timer
                const timerContainer = document.createElement('div');
                timerContainer.className = 'set-timer';
                timerContainer.dataset.timerId = `${exerciseIndex}-${i}`;
                
                const timerDisplay = document.createElement('div');
                timerDisplay.id = `timer-display-${exerciseIndex}-${i}`;
                timerDisplay.className = 'timer-display';
                timerDisplay.textContent = '00:00';
                timerContainer.appendChild(timerDisplay);
                
                const timerButton = document.createElement('button');
                timerButton.id = `timer-button-${exerciseIndex}-${i}`;
                timerButton.className = 'timer-button';
                timerButton.type = 'button';
                timerButton.dataset.timerId = `${exerciseIndex}-${i}`;
                timerButton.textContent = 'Iniciar';
                timerContainer.appendChild(timerButton);
                
                setRow.appendChild(timerContainer);
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
        notesLabel.textContent = "Notas de la sesión:";
        notesLabel.htmlFor = `notes-${exerciseIndex}`;
        notesLabel.style.marginTop = '10px';
        exerciseBlock.appendChild(notesLabel);

        const notesTextarea = document.createElement('textarea');
        notesTextarea.id = `notes-${exerciseIndex}`;
        notesTextarea.name = `notes-${exerciseIndex}`;
        notesTextarea.placeholder = exercise.type === 'cardio' ? 'Ej: 20 min a 140bpm, o 5km en 25 min...' : 'Añade notas sobre este ejercicio...';
        notesTextarea.className = 'exercise-notes';
        
        // Pre-rellenar con notas de una sesión en progreso, o usar las notas de la rutina como base.
        if (inProgressData?.ejercicios[exerciseIndex]?.notasEjercicio) {
            notesTextarea.value = inProgressData.ejercicios[exerciseIndex].notasEjercicio;
        } else if (exercise.notes) {
            notesTextarea.value = exercise.notes;
        }
        
        exerciseBlock.appendChild(notesTextarea);
        sessionElements.exerciseList.appendChild(exerciseBlock);
    }
    showView('session');
    
    // Initialize timers after the view is rendered
    import('./timer.js').then(module => {
        module.initSetTimers();
    });
}

export function renderHistoryList(sessions) {
    historyElements.loadingSpinner.classList.add('hidden');
    historyElements.list.innerHTML = '';

    if (!sessions || sessions.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No hay sesiones guardadas todavía. ¡Empieza a entrenar para registrar tu progreso!';
        historyElements.list.appendChild(li);
        return;
    }

    sessions.forEach(session => {
        const li = document.createElement('li');
        li.dataset.sessionId = session.id;
        li.classList.add('session-card');
        
        // Nombre de la sesión
        const nameEl = document.createElement('div');
        nameEl.classList.add('session-name');
        nameEl.textContent = session.nombreEntrenamiento || session.diaEntrenamiento;
        li.appendChild(nameEl);
        
        // Contenedor para información inline
        const inlineInfoEl = document.createElement('div');
        inlineInfoEl.classList.add('session-inline-info');
        
        // Fecha de la sesión
        const dateEl = document.createElement('div');
        dateEl.classList.add('session-date');
        dateEl.textContent = session.fecha && session.fecha.toDate ? formatDateShort(session.fecha.toDate()) : 'Fecha no disponible';
        inlineInfoEl.appendChild(dateEl);
        
        // Peso del usuario (si está disponible)
        if (session.pesoUsuario) {
            const weightEl = document.createElement('div');
            weightEl.classList.add('session-weight');
            weightEl.textContent = `${session.pesoUsuario} kg`;
            inlineInfoEl.appendChild(weightEl);
        }
        
        li.appendChild(inlineInfoEl);
        
        // Resumen de ejercicios
        if (session.ejercicios && session.ejercicios.length > 0) {
            const summaryEl = document.createElement('div');
            summaryEl.classList.add('session-summary');
            summaryEl.textContent = `${session.ejercicios.length} ejercicios realizados`;
            li.appendChild(summaryEl);
        }
          // Botones de acción (ahora en columna)
        const actionsEl = document.createElement('div');
        actionsEl.classList.add('session-actions');
        
        // Botón de ver detalles
        const viewBtn = document.createElement('button');
        viewBtn.textContent = 'Ver detalles';
        viewBtn.classList.add('session-action-btn', 'view');
        viewBtn.dataset.action = 'view-session';
        actionsEl.appendChild(viewBtn);
        
        // Botón de eliminar
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Eliminar';
        deleteBtn.classList.add('session-action-btn', 'delete');
        deleteBtn.dataset.action = 'delete-session';
        deleteBtn.dataset.sessionId = session.id;
        actionsEl.appendChild(deleteBtn);
        
        li.appendChild(actionsEl);
        
        // Evento para mostrar detalles al hacer clic en la tarjeta
        li.addEventListener('click', (e) => {
            // Si se hizo clic en un botón de acción, no mostrar detalles
            if (e.target.classList.contains('session-action-btn')) {
                return;
            }
            // Simular clic en el botón de ver detalles
            viewBtn.click();
        });
        
        historyElements.list.appendChild(li);
    });
    
    applyHistoryFilters(); 
}

export function showSessionDetail(sessionData) {
    if (!sessionData) return;
    
    // Título del modal
    sessionDetailModal.title.textContent = sessionData.nombreEntrenamiento || sessionData.diaEntrenamiento || "Detalle de Sesión";
      // Información de fecha
    let dateInfo = `${formatDate(sessionData.fecha.toDate())}`;
    sessionDetailModal.date.textContent = dateInfo;
    
    // Añadir badge de peso si está disponible
    if (sessionData.pesoUsuario) {
        const weightBadge = document.createElement('span');
        weightBadge.classList.add('user-weight-badge');
        weightBadge.textContent = `⚖️ ${sessionData.pesoUsuario} kg`;
        sessionDetailModal.date.appendChild(weightBadge);
    }
    
    // Lista de ejercicios
    sessionDetailModal.exercises.innerHTML = '';
    
    if (sessionData.ejercicios && sessionData.ejercicios.length > 0) {
        sessionData.ejercicios.forEach(ex => {
            const exLi = document.createElement('li');
            exLi.classList.add('exercise-detail');
            
            // Nombre del ejercicio
            const nameEl = document.createElement('strong');
            nameEl.textContent = ex.nombreEjercicio;
            exLi.appendChild(nameEl);
            
            // Badge para el tipo de ejercicio
            const typeEl = document.createElement('span');
            typeEl.classList.add('exercise-type-badge');
            
            // Asignar las clases apropiadas según el tipo
            if (ex.tipoEjercicio === 'strength') {
                typeEl.classList.add('strength');
                typeEl.textContent = '💪 Fuerza';
            } else if (ex.tipoEjercicio === 'cardio') {
                typeEl.classList.add('cardio');
                typeEl.textContent = '🏃 Cardio';
            } else {
                typeEl.classList.add('other');
                typeEl.textContent = '🏋️ ' + (ex.tipoEjercicio || 'Otro');
            }
            
            exLi.appendChild(typeEl);
            
            // Series (para ejercicios de fuerza)
            if (ex.tipoEjercicio === 'strength' && ex.sets && ex.sets.length > 0) {
                const setsUl = document.createElement('ul');
                setsUl.classList.add('sets-list');
                
                ex.sets.forEach((set, index) => {
                    const setLi = document.createElement('li');
                    let setContent = `Serie ${index + 1}: ${set.peso} kg × ${set.reps} repeticiones`;
                    
                    // Add rest time if available
                    if (set.tiempoDescanso && set.tiempoDescanso !== '00:00') {
                        setContent += ` <span class="rest-time-badge">⏱️ ${set.tiempoDescanso}</span>`;
                    }
                    
                    setLi.innerHTML = setContent;
                    setsUl.appendChild(setLi);
                });
                
                exLi.appendChild(setsUl);
            }
            
            // Notas del ejercicio
            if (ex.notasEjercicio) {
                const notesEl = document.createElement('p');
                notesEl.classList.add('exercise-notes');
                notesEl.innerHTML = `<em>Notas: ${ex.notasEjercicio}</em>`;
                exLi.appendChild(notesEl);
            }
            
            sessionDetailModal.exercises.appendChild(exLi);
        });
    } else {
        const noExercisesEl = document.createElement('p');
        noExercisesEl.textContent = 'No hay ejercicios registrados en esta sesión.';
        sessionDetailModal.exercises.appendChild(noExercisesEl);
    }
    
    // Mostrar el modal
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
        li.className = 'routine-card empty-state';
        li.innerHTML = `
            <div class="routine-info">
                <div class="routine-name">Sin rutinas personalizadas</div>
                <div class="routine-description">¡Crea una rutina nueva o prueba nuestras rutinas de muestra!</div>
            </div>
        `;
        manageRoutinesElements.list.appendChild(li);
        return;
    }

    routines.forEach(routine => {
        const li = document.createElement('li');
        li.className = 'routine-card';

        // Contenedor de información de la rutina
        const routineInfo = document.createElement('div');
        routineInfo.className = 'routine-info';

        // Nombre de la rutina
        const nameContainer = document.createElement('div');
        nameContainer.className = 'routine-name-container';
        
        const nameSpan = document.createElement('div');
        nameSpan.className = 'routine-name';
        nameSpan.textContent = routine.name;
        nameContainer.appendChild(nameSpan);

        routineInfo.appendChild(nameContainer);

        // Descripción de la rutina (número de ejercicios)
        const description = document.createElement('div');
        description.className = 'routine-description';
        const exerciseCount = routine.exercises ? routine.exercises.length : 0;
        description.textContent = `${exerciseCount} ejercicio${exerciseCount !== 1 ? 's' : ''}`;
        routineInfo.appendChild(description);

        li.appendChild(routineInfo);

        // Contenedor de acciones
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'routine-actions';

        // Botón de editar
        const editBtn = document.createElement('button');
        editBtn.textContent = 'Editar';
        editBtn.className = 'routine-action-btn edit';
        editBtn.dataset.routineId = routine.id;
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const event = new CustomEvent('editRoutineClicked', { detail: { routineId: e.target.dataset.routineId }});
            document.dispatchEvent(event);
        });
        actionsDiv.appendChild(editBtn);

        li.appendChild(actionsDiv);

        // Event listener para hacer clic en toda la tarjeta (abre edición)
        li.addEventListener('click', (e) => {
            if (!e.target.closest('.routine-actions')) {
                editBtn.click();
            }
        });

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
        <button type="button" class="remove-exercise-btn" data-target="${exerciseDiv.dataset.editorId}" title="Eliminar ejercicio">×</button>
        
        <div class="exercise-header">
            <label for="ex-name-${exerciseEditorCounter}">Nombre del Ejercicio:</label>
            <input type="text" id="ex-name-${exerciseEditorCounter}" name="ex-name" value="${exerciseData?.name || ''}" required placeholder="Ej: Press de banca, Sentadillas...">
        </div>

        <div class="exercise-type-selector">
            <label for="ex-type-${exerciseEditorCounter}">Tipo de Ejercicio:</label>
            <select id="ex-type-${exerciseEditorCounter}" name="ex-type">
                <option value="strength" ${exerciseType === 'strength' ? 'selected' : ''}>💪 Fuerza (Series/Reps)</option>
                <option value="cardio" ${exerciseType === 'cardio' ? 'selected' : ''}>🏃 Cardio (Duración)</option>
            </select>
        </div>

        <div class="strength-fields exercise-fields" style="display: ${exerciseType === 'strength' ? 'block' : 'none'};">
            <div class="field-group-header">
                <span class="field-group-icon">🏋️</span>
                <span class="field-group-title">Configuración de Fuerza</span>
            </div>
            <div class="form-grid">
                <div class="form-field">
                    <label for="ex-sets-${exerciseEditorCounter}">Series:</label>
                    <input type="number" id="ex-sets-${exerciseEditorCounter}" name="ex-sets" min="0" value="${exerciseData?.sets || ''}" placeholder="3">
                </div>
                <div class="form-field">
                    <label for="ex-reps-${exerciseEditorCounter}">Reps/Objetivo:</label>
                    <input type="text" id="ex-reps-${exerciseEditorCounter}" name="ex-reps" value="${exerciseData?.reps || ''}" placeholder="8-12">
                </div>
            </div>
        </div>
        
        <div class="cardio-fields exercise-fields" style="display: ${exerciseType === 'cardio' ? 'block' : 'none'};">
            <div class="field-group-header">
                <span class="field-group-icon">⏱️</span>
                <span class="field-group-title">Configuración de Cardio</span>
            </div>
            <div class="form-field">
                <label for="ex-duration-${exerciseEditorCounter}">Duración/Objetivo:</label>
                <input type="text" id="ex-duration-${exerciseEditorCounter}" name="ex-duration" value="${exerciseData?.duration || ''}" placeholder="30 min, 5km, etc.">
            </div>
        </div>
        
        <div class="exercise-notes">
            <label for="ex-notes-${exerciseEditorCounter}">Notas Adicionales (opcional):</label>
            <textarea id="ex-notes-${exerciseEditorCounter}" name="ex-notes" placeholder="${exerciseType === 'strength' ? 'Ej: usar agarre supino, aumentar peso la próxima vez, tempo 3-1-2...' : 'Ej: mantener ritmo constante, controlar frecuencia cardíaca...'}">${exerciseData?.notes || ''}</textarea>
        </div>
    `;
    
    routineEditorElements.exercisesContainer.appendChild(exerciseDiv);

    // Event listeners
    const typeSelect = exerciseDiv.querySelector('select[name="ex-type"]');
    const strengthFields = exerciseDiv.querySelector('.strength-fields');
    const cardioFields = exerciseDiv.querySelector('.cardio-fields');

    typeSelect.addEventListener('change', (e) => {
        const notesTextarea = exerciseDiv.querySelector('textarea[name="ex-notes"]');
        
        if (e.target.value === 'strength') {
            strengthFields.style.display = 'block';
            cardioFields.style.display = 'none';
            notesTextarea.placeholder = 'Ej: usar agarre supino, aumentar peso la próxima vez, tempo 3-1-2...';
        } else {
            strengthFields.style.display = 'none';
            cardioFields.style.display = 'block';
            notesTextarea.placeholder = 'Ej: mantener ritmo constante, controlar frecuencia cardíaca...';
        }
    });

    const removeBtn = exerciseDiv.querySelector('.remove-exercise-btn');
    removeBtn.addEventListener('click', () => {
        exerciseDiv.style.animation = 'slideOutUp 0.3s ease forwards';
        setTimeout(() => {
            exerciseDiv.remove();
        }, 300);
    });
    
    // Animate the new exercise in
    exerciseDiv.style.animation = 'slideInUp 0.3s ease forwards';
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
    prevMonthBtn: document.getElementById('prev-month-btn'),
    nextMonthBtn: document.getElementById('next-month-btn'),
    currentMonthDisplay: document.getElementById('current-month-display'),
    loadingSpinner: document.getElementById('calendar-loading-spinner')
};

// Debug calendar elements at module load time
console.log('Calendar elements loaded:', {
    container: !!calendarElements.container,
    calendarView: !!calendarElements.calendarView,
    prevMonthBtn: !!calendarElements.prevMonthBtn,
    nextMonthBtn: !!calendarElements.nextMonthBtn,
    currentMonthDisplay: !!calendarElements.currentMonthDisplay,
    loadingSpinner: !!calendarElements.loadingSpinner
});

function initHistoryFilters() {
    // Exit if elements don't exist yet
    if (!historyElements.filterButtons || !historyElements.searchInput) return;
    
    // Initialize filter buttons
    historyElements.filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons
            historyElements.filterButtons.forEach(btn => btn.classList.remove('active'));
            
            // Add active class to clicked button
            button.classList.add('active');
            
            // Apply the filter
            applyHistoryFilters();
        });
    });
    
    // Initialize search input
    historyElements.searchInput.addEventListener('input', () => {
        applyHistoryFilters();
    });
}

export function applyHistoryFilters() {
    if (!historyElements.list || !historyElements.searchInput) return;
    const sessionItems = historyElements.list.querySelectorAll('li[data-session-id]');
    
    if (!sessionItems.length) return;
    
    const searchQuery = historyElements.searchInput.value.toLowerCase().trim();
    
    sessionItems.forEach(item => {
        let passesSearchFilter = true;
        
        if (searchQuery) {
            const nameEl = item.querySelector('.session-name');
            const dateEl = item.querySelector('.session-date');
            const summaryEl = item.querySelector('.session-summary');
            
            const textToSearch = [
                nameEl ? nameEl.textContent.toLowerCase() : '',
                dateEl ? dateEl.textContent.toLowerCase() : '', // Asegúrate que este selector es correcto
                summaryEl ? summaryEl.textContent.toLowerCase() : ''
            ].join(' ');
            
            passesSearchFilter = textToSearch.includes(searchQuery);
        }
        
        item.style.display = passesSearchFilter ? '' : 'none';
    });

    
}

if (historyElements.searchInput) {
    historyElements.searchInput.addEventListener('input', applyHistoryFilters);
} else {
    console.warn("History search input not found for attaching event listener in ui.js");
}

// Helper function to fill exercise inputs with last workout values
function fillExerciseWithLastValues(exerciseIndex, lastSets) {
    const exerciseBlock = sessionElements.exerciseList.querySelector(`[data-exercise-index="${exerciseIndex}"]`);
    if (!exerciseBlock) return;
    
    lastSets.forEach((set, setIndex) => {
        const weightInput = exerciseBlock.querySelector(`input[name="weight-${exerciseIndex}-${setIndex}"]`);
        const repsInput = exerciseBlock.querySelector(`input[name="reps-${exerciseIndex}-${setIndex}"]`);
        
        if (weightInput && set.peso > 0) {
            weightInput.value = set.peso;
            weightInput.style.background = 'rgba(67, 97, 238, 0.05)';
            weightInput.style.borderColor = 'var(--accent-color)';
        }
        
        if (repsInput && set.reps > 0) {
            repsInput.value = set.reps;
            repsInput.style.background = 'rgba(67, 97, 238, 0.05)';
            repsInput.style.borderColor = 'var(--accent-color)';
        }
    });
    
    // Show feedback message
    showCacheStatus('Valores del último entrenamiento aplicados', 'success');
}

// Show cache status notifications
function showCacheStatus(message, type = 'success') {
    let statusEl = document.querySelector('.cache-status');
    if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.className = 'cache-status';
        document.body.appendChild(statusEl);
    }
    
    statusEl.textContent = message;
    statusEl.className = `cache-status ${type}`;
    statusEl.classList.add('show');
    
    setTimeout(() => {
        statusEl.classList.remove('show');
    }, 3000);
}