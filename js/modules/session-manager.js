/**
 * Session Manager module
 * Handles session storage, form data collection, and session saving
 */

import { db } from '../firebase-config.js';
import { collection, addDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getCurrentUser } from '../auth.js';
import { 
    showView, sessionElements, dashboardElements, 
    showLoading, hideLoading, renderSessionView 
} from '../ui.js';
import { logger } from '../utils/logger.js';
import { toast } from '../utils/notifications.js';
import { clearTimerData } from '../timer.js';
import { invalidateProgressCache } from '../progress.js';

// Constants
const IN_PROGRESS_SESSION_KEY = 'gymTracker_inProgressSession';

// State
let currentRoutineForSession = null;

/**
 * Saves a session in progress to localStorage
 * @param {string} routineId - The routine ID
 * @param {Object} data - The session data to save
 */
export function saveInProgressSession(routineId, data) {
    const sessionToStore = {
        routineId: routineId,
        data: data,
        timestamp: Date.now()
    };
    localStorage.setItem(IN_PROGRESS_SESSION_KEY, JSON.stringify(sessionToStore));
}

/**
 * Loads a session in progress from localStorage
 * @returns {Object|null} The stored session or null
 */
export function loadInProgressSession() {
    const storedSession = localStorage.getItem(IN_PROGRESS_SESSION_KEY);
    if (storedSession) {
        try {
            return JSON.parse(storedSession);
        } catch (error) {
            logger.error('Error parsing in-progress session:', error);
            return null;
        }
    }
    return null;
}

/**
 * Clears the in-progress session from localStorage
 */
export function clearInProgressSession() {
    localStorage.removeItem(IN_PROGRESS_SESSION_KEY);
}

/**
 * Gets the current routine being used for the active session
 * @returns {Object|null} The current routine or null
 */
export function getCurrentRoutineForSession() {
    return currentRoutineForSession;
}

/**
 * Sets the current routine for the session
 * @param {Object|null} routine - The routine to set
 */
export function setCurrentRoutineForSession(routine) {
    currentRoutineForSession = routine;
}

/**
 * Collects form data from the current session
 * @returns {Object} The session data from the form
 */
export function getSessionFormData() {
    if (!currentRoutineForSession) return {};
    
    // Get and normalize user weight
    const userWeightInput = document.getElementById('user-weight');
    const userWeightValue = userWeightInput ? userWeightInput.value : '';
    let pesoUsuario = null;
    
    if (userWeightValue) {
        const normalizedWeight = userWeightValue.replace(',', '.');
        const parsedWeight = parseFloat(normalizedWeight);
        if (!isNaN(parsedWeight)) {
            pesoUsuario = Math.round(parsedWeight * 10) / 10; // Round to 1 decimal
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
            tipoEjercicio: exerciseFromRoutine.type,
            objetivoSets: exerciseFromRoutine.sets, 
            objetivoReps: exerciseFromRoutine.reps,
            objetivoDuracion: exerciseFromRoutine.duration,
            sets: [],
            notasEjercicio: block.querySelector(`textarea[name="notes-${exerciseIndex}"]`)?.value.trim() || ''
        };

        if (exerciseFromRoutine.type === 'strength') {
            const setRows = block.querySelectorAll('.set-row');
            setRows.forEach((row, setIndex) => {
                const weightInput = row.querySelector(`input[name="weight-${exerciseIndex}-${setIndex}"]`);
                const repsInput = row.querySelector(`input[name="reps-${exerciseIndex}-${setIndex}"]`);
                
                if (weightInput?.value || repsInput?.value) {
                    // Normalize weight: replace comma with period and round to 1 decimal
                    let peso = 0;
                    if (weightInput?.value) {
                        const normalizedWeight = weightInput.value.replace(',', '.');
                        const parsedWeight = parseFloat(normalizedWeight);
                        if (!isNaN(parsedWeight)) {
                            peso = Math.round(parsedWeight * 10) / 10;
                        }
                    }
                    
                    exerciseEntry.sets.push({
                        peso: peso,
                        reps: parseInt(repsInput?.value, 10) || 0,
                        tiempoDescanso: document.getElementById(`timer-display-${exerciseIndex}-${setIndex}`)?.textContent || '00:00'
                    });
                }
            });
        }

        // Only add exercise if it has sets (for strength) or notes
        if ((exerciseFromRoutine.type === 'strength' && exerciseEntry.sets.length > 0) || exerciseEntry.notasEjercicio) {
            sessionData.ejercicios.push(exerciseEntry);
        } else if (exerciseFromRoutine.type === 'cardio' && exerciseEntry.notasEjercicio) {
            sessionData.ejercicios.push(exerciseEntry);
        }
    });
    
    return sessionData;
}

/**
 * Saves the current session to Firestore
 * @param {Function} onSuccess - Callback on successful save
 */
export async function saveSessionData(onSuccess) {
    const user = getCurrentUser();
    if (!currentRoutineForSession || !user) {
        toast.error("Error: No hay rutina activa o no has iniciado sesión.");
        return;
    }
    
    const sessionDataFromForm = getSessionFormData();
    if (sessionDataFromForm.ejercicios.length === 0) {
        toast.warning("No se registraron datos para ningún ejercicio. Introduce datos o notas para guardar la sesión.");
        return;
    }
    
    const finalSessionData = {
        fecha: Timestamp.now(),
        routineId: currentRoutineForSession.id,
        nombreEntrenamiento: currentRoutineForSession.name,
        userId: user.uid,
        ejercicios: sessionDataFromForm.ejercicios,
        pesoUsuario: sessionDataFromForm.pesoUsuario ? parseFloat(sessionDataFromForm.pesoUsuario) : null
    };
    
    showLoading(sessionElements.saveBtn, 'Guardando...');
    
    try {
        const userSessionsCollectionRef = collection(db, "users", user.uid, "sesiones_entrenamiento");
        await addDoc(userSessionsCollectionRef, finalSessionData);
        
        // Update exercise cache with new session data
        const { exerciseCache } = await import('../exercise-cache.js');
        exerciseCache.processCompletedSession(finalSessionData);
        
        // Invalidate progress cache to force reload with new data
        invalidateProgressCache();
        
        // Sync cache with Firebase for backup (without blocking)
        exerciseCache.syncWithFirebase(user.uid, db).catch(error => {
            logger.warn('Error syncing exercise cache:', error);
        });
        
        toast.success("¡Sesión guardada con éxito!");
        sessionElements.form.reset();
        clearInProgressSession();
        clearTimerData();
        currentRoutineForSession = null;
        showView('dashboard');
        
        // Call success callback if provided
        if (typeof onSuccess === 'function') {
            onSuccess();
        }
    } catch (error) {
        logger.error("Error adding document:", error);
        toast.error("Error al guardar la sesión.");
        
        // Load diagnostics on Firestore errors
        if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('ERR_BLOCKED_BY_CLIENT'))) {
            const { loadFirebaseDiagnostics } = await import('../app.js');
            loadFirebaseDiagnostics();
        }
    } finally {
        hideLoading(sessionElements.saveBtn);
    }
}

/**
 * Checks for a session in progress and offers to resume it
 * @param {Array} userRoutines - Array of user's routines
 */
export function checkAndOfferResumeSession(userRoutines) {
    const inProgress = loadInProgressSession();
    const user = getCurrentUser();

    const resumeArea = dashboardElements.resumeSessionArea;

    if (inProgress && user) {
        const routine = userRoutines.find(r => r.id === inProgress.routineId);
        
        if (routine) {
            dashboardElements.resumeSessionInfo.textContent = `Tienes una sesión de "${routine.name}" sin guardar.`;
            dashboardElements.resumeSessionBtn.classList.remove('hidden');
            resumeArea.classList.add('visible');
            
            dashboardElements.resumeSessionBtn.onclick = async () => {
                currentRoutineForSession = routine;
                await renderSessionView(routine, inProgress.data);
                dashboardElements.resumeSessionBtn.classList.add('hidden');
                dashboardElements.resumeSessionInfo.textContent = '';
                resumeArea.classList.remove('visible');
            };
        } else {
            // Routine might have been deleted
            clearInProgressSession();
            dashboardElements.resumeSessionBtn.classList.add('hidden');
            dashboardElements.resumeSessionInfo.textContent = '';
            resumeArea.classList.remove('visible');
        }
    } else {
        dashboardElements.resumeSessionBtn.classList.add('hidden');
        dashboardElements.resumeSessionInfo.textContent = '';
        resumeArea.classList.remove('visible');
    }
}

/**
 * Starts a new session with the selected routine
 * @param {string} routineId - The ID of the routine to start
 * @param {Array} userRoutines - Array of available routines
 */
export async function startSession(routineId, userRoutines) {
    if (!routineId) return;
    
    const selectedRoutine = userRoutines.find(r => r.id === routineId);
    if (!selectedRoutine) {
        toast.error("Rutina no encontrada. Por favor, selecciona otra.");
        return;
    }

    const inProgress = loadInProgressSession();
    if (inProgress && inProgress.routineId !== routineId) {
        if (!confirm("Tienes otra sesión en progreso. ¿Descartarla y empezar esta nueva?")) {
            return;
        }
        clearInProgressSession();
    }
    
    currentRoutineForSession = selectedRoutine;
    await renderSessionView(selectedRoutine, inProgress && inProgress.routineId === routineId ? inProgress.data : null);
    dashboardElements.resumeSessionBtn.classList.add('hidden');
    dashboardElements.resumeSessionInfo.textContent = '';
}

/**
 * Cancels the current session
 */
export function cancelSession() {
    if (confirm("¿Estás seguro de que quieres cancelar? Se perderán los datos no guardados.")) {
        sessionElements.form.reset();
        clearInProgressSession();
        clearTimerData();
        currentRoutineForSession = null;
        showView('dashboard');
    }
}

/**
 * Sets up auto-save for the session form
 * Saves form data on input changes
 */
export function setupSessionAutoSave() {
    if (!sessionElements.exerciseList) {
        logger.error('Session exercise list not found');
        return;
    }
    
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
}

export default {
    saveInProgressSession,
    loadInProgressSession,
    clearInProgressSession,
    getCurrentRoutineForSession,
    setCurrentRoutineForSession,
    getSessionFormData,
    saveSessionData,
    checkAndOfferResumeSession,
    startSession,
    cancelSession,
    setupSessionAutoSave
};
