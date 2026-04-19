// --- DOM Elements ---
import { resetTimerInitialization } from './timer.js';
import { logger } from './utils/logger.js';
import { toast } from './utils/notifications.js';
import { cleanupViewListeners } from './utils/event-manager.js';
import {
    DEFAULT_EXECUTION_MODE,
    normalizeExecutionMode,
    resolveExerciseExecutionMode,
    getExecutionModeLabel
} from './utils/execution-mode.js';
import {
    DEFAULT_LOAD_TYPE,
    normalizeLoadType,
    resolveExerciseLoadType,
    getLoadTypeLabel
} from './utils/load-type.js';
import { getLastKnownBodyweight } from './utils/bodyweight.js';
import {
    getSessionVariantOverride,
    normalizeExerciseIdentity,
    resolveSessionVariantSelection
} from './utils/session-variant-overrides.js';
import { t, getLocale } from './i18n.js';

// View initializer registry (populated from app.js)
const viewInitializers = new Map();

/**
 * Register an initializer for a given view. Called automatically from showView.
 * @param {string} viewName
 * @param {Function} initializer
 */
export function registerViewInitializer(viewName, initializer) {
    if (typeof initializer === 'function') {
        viewInitializers.set(viewName, initializer);
    }
}

// Track current view for cleanup
let currentView = null;

// --- Security: HTML Escape Function ---
/**
 * Escapes HTML special characters to prevent XSS attacks
 * @param {string} str - The string to escape
 * @returns {string} - The escaped string safe for innerHTML
 */
export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const text = String(str);
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatSignedWeight(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return '0';
    }

    if (numericValue > 0) {
        return `+${numericValue}`;
    }

    return `${numericValue}`;
}

function resolveInProgressExercise(inProgressData, exerciseIndex, exerciseName) {
    const inProgressExercises = Array.isArray(inProgressData?.ejercicios)
        ? inProgressData.ejercicios
        : [];
    const normalizedExerciseName = normalizeExerciseIdentity(exerciseName);
    const indexedExercise = inProgressExercises[exerciseIndex];
    if (indexedExercise && typeof indexedExercise === 'object') {
        const normalizedIndexedName = normalizeExerciseIdentity(indexedExercise?.nombreEjercicio);
        if (!normalizedExerciseName || normalizedIndexedName === normalizedExerciseName) {
            return indexedExercise;
        }
    }

    if (!normalizedExerciseName) {
        return null;
    }

    return inProgressExercises.find((exerciseEntry) =>
        normalizeExerciseIdentity(exerciseEntry?.nombreEjercicio) === normalizedExerciseName
    ) || null;
}

export const views = {
    auth: document.getElementById('auth-view'),
    dashboard: document.getElementById('dashboard-view'),
    session: document.getElementById('session-view'),
    history: document.getElementById('history-view'),
    manageRoutines: document.getElementById('manage-routines-view'),
    routineEditor: document.getElementById('routine-editor-view'),
    progress: document.getElementById('progress-view')
};

export const navButtons = {
    dashboard: document.getElementById('nav-dashboard'),
    manageRoutines: document.getElementById('nav-manage-routines'),
    history: document.getElementById('nav-history'),
    progress: document.getElementById('nav-progress'),
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
    resumeSessionArea: document.getElementById('resume-session-area'), 
    resumeSessionBtn: document.getElementById('resume-session-btn'),
    resumeSessionInfo: document.getElementById('resume-session-info'),
    manageRoutinesLinkBtn: document.getElementById('manage-routines-link-btn'),
    debugCacheBtn: document.getElementById('debug-cache-btn'),
    dailyHubMonthCount: document.getElementById('daily-hub-month-count'),
    dailyHubLastWorkout: document.getElementById('daily-hub-last-workout'),
    dailyHubRoutineShortcut: document.getElementById('daily-hub-routine-shortcut'),
    dailyHubSyncStatus: document.getElementById('daily-hub-sync-status'),
    dailyHubEmptyState: document.getElementById('daily-hub-empty-state'),
    quickLogForm: document.getElementById('quick-log-form'),
    quickLogLabelInput: document.getElementById('quick-log-label'),
    quickLogDateTimeInput: document.getElementById('quick-log-datetime'),
    quickLogNotesInput: document.getElementById('quick-log-notes'),
    quickLogSaveBtn: document.getElementById('quick-log-save-btn')
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
    routineIdInput: document.getElementById('routine-id'),
    routineNameInput: document.getElementById('routine-name'),
    exercisesContainer: document.getElementById('routine-exercises-container'),
    addExerciseBtn: document.getElementById('add-exercise-to-routine-btn'),
    saveRoutineBtn: document.getElementById('save-routine-btn'),
    cancelEditRoutineBtn: document.getElementById('cancel-edit-routine-btn'),
    deleteRoutineBtn: document.getElementById('delete-routine-btn')
};

export const progressElements = {
    exerciseSelect: document.getElementById('exercise-select'),
    metricSelect: document.getElementById('metric-select'),
    periodSelect: document.getElementById('period-select'),
    loadingSpinner: document.getElementById('progress-loading'),
    chartContainer: document.getElementById('progress-chart-container'),
    chart: document.getElementById('progress-chart'),
    statsContainer: document.getElementById('progress-stats'),
    bestRecord: document.getElementById('best-record'),
    totalProgress: document.getElementById('total-progress'),
    sessionCount: document.getElementById('session-count'),
    trendIndicator: document.getElementById('trend-indicator'),
    noDataMessage: document.getElementById('progress-no-data')
};


// --- UI Functions ---

export async function showView(viewToShowId) {
    // Cleanup listeners from previous view
    // NOTE: The event manager currently only cleans up listeners that were added through
    // addViewListener(). Many event listeners in the codebase (in app.js, modules, timer.js, etc.)
    // are still added directly with addEventListener and will not be cleaned up automatically.
    // This could cause memory leaks. Consider migrating existing addEventListener calls to use
    // addViewListener() from event-manager.js for proper cleanup on view transitions.
    if (currentView && currentView !== viewToShowId) {
        cleanupViewListeners(currentView);
        logger.debug(`Cleaned up listeners for view: ${currentView}`);
    }
    
    // Reset timer initialization when navigating away from session view
    if (!views.session.classList.contains('hidden') && viewToShowId !== 'session') {
        resetTimerInitialization();
    }
    
    Object.values(views).forEach(view => view.classList.add('hidden'));
    if (views[viewToShowId]) {
        views[viewToShowId].classList.remove('hidden');
    } else {
        logger.error(`View with id ${viewToShowId} not found.`);
    }

    Object.values(navButtons).forEach(btn => btn.classList.remove('active'));
    if (viewToShowId === 'dashboard' && navButtons.dashboard) navButtons.dashboard.classList.add('active');
    if (viewToShowId === 'manageRoutines' && navButtons.manageRoutines) navButtons.manageRoutines.classList.add('active');
    if (viewToShowId === 'history' && navButtons.history) navButtons.history.classList.add('active');
    if (viewToShowId === 'progress' && navButtons.progress) navButtons.progress.classList.add('active');
    
    // Run view-specific initializer after the view is shown
    const initializer = viewInitializers.get(viewToShowId);
    if (initializer) {
        try {
            await initializer();
        } catch (error) {
            logger.error('Error running view initializer:', error);
        }
    }

    // Update current view tracking
    currentView = viewToShowId;
}

export function updateNav(isLoggedIn) {
    const commonButtons = [navButtons.dashboard, navButtons.manageRoutines, navButtons.history, navButtons.progress, navButtons.logout];
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
    if (!date) return t('common.na');
    return date.toLocaleDateString(getLocale(), { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function formatDateShort(date) {
    if (!date) return t('common.na');
    return date.toLocaleDateString(getLocale(), { year: 'numeric', month: 'short', day: 'numeric' });
}

// Populates the day selector on the dashboard with the user's routines
export function populateDaySelector(userRoutines) {
    if (!dashboardElements.daySelect) {
        logger.error('Day select element not found');
        return;
    }
    
    dashboardElements.daySelect.innerHTML = `<option value="">${t('dashboard.day_selector_choose')}</option>`;
    if (userRoutines && userRoutines.length > 0) {
        userRoutines.forEach(routine => {
            const option = document.createElement('option');
            option.value = routine.id;
            option.textContent = routine.name;
            dashboardElements.daySelect.appendChild(option);
        });
    } else {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = t('dashboard.day_selector_empty');
        option.disabled = true;
        dashboardElements.daySelect.appendChild(option);
    }
    
    if (dashboardElements.startSessionBtn) {
        dashboardElements.startSessionBtn.disabled = true;
    } else {
        logger.error('Start session button not found');
    }
}


export async function renderSessionView(routine, inProgressData = null) {
    if (!routine || !routine.exercises) {
        logger.error('Routine data is invalid for session view:', routine);
        toast.error(t('session.invalid_routine_data'));
        showView('dashboard');
        return;
    }

    sessionElements.title.textContent = routine.name;
    sessionElements.exerciseList.innerHTML = '';

    const { getCurrentUser } = await import('./auth.js');
    const currentUserId = getCurrentUser()?.uid || null;

    const userWeightDiv = document.createElement('div');
    userWeightDiv.className = 'user-weight-input';

    const userWeightLabel = document.createElement('label');
    userWeightLabel.textContent = t('session.user_weight');
    userWeightLabel.htmlFor = 'user-weight';
    userWeightDiv.appendChild(userWeightLabel);

    const userWeightInput = document.createElement('input');
    userWeightInput.type = 'text';
    userWeightInput.id = 'user-weight';
    userWeightInput.name = 'user-weight';
    userWeightInput.placeholder = t('session.user_weight_placeholder');
    userWeightInput.inputMode = 'decimal';
    userWeightInput.pattern = '[0-9]*[.,]?[0-9]*';

    userWeightInput.addEventListener('input', function(e) {
        let value = e.target.value;
        value = value.replace(',', '.');
        value = value.replace(/[^0-9.]/g, '');
        const parts = value.split('.');
        if (parts.length > 2) {
            value = parts[0] + '.' + parts.slice(1).join('');
        }
        if (parts[1] && parts[1].length > 2) {
            value = parts[0] + '.' + parts[1].substring(0, 2);
        }
        e.target.value = value;
    });

    userWeightInput.addEventListener('blur', function(e) {
        const value = e.target.value.replace(',', '.');
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
    } else {
        const lastKnownBodyweight = getLastKnownBodyweight(currentUserId);
        if (lastKnownBodyweight !== null) {
            userWeightInput.value = lastKnownBodyweight;
        }
    }

    userWeightDiv.appendChild(userWeightInput);
    sessionElements.exerciseList.appendChild(userWeightDiv);

    for (let exerciseIndex = 0; exerciseIndex < routine.exercises.length; exerciseIndex++) {
        const exercise = routine.exercises[exerciseIndex];
        const inProgressExercise = resolveInProgressExercise(inProgressData, exerciseIndex, exercise.name);
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
            target.textContent = t('session.target', { target: `${setsDisplay} x ${exercise.reps} ${t('session.reps_label')}` });
        } else if (exercise.type === 'cardio') {
            target.textContent = t('session.target', { target: exercise.duration || t('session.target_time_distance') });
        } else {
            target.textContent = t('session.target', { target: exercise.reps || t('session.target_complete') });
        }

        exerciseBlock.appendChild(target);

        if (exercise.type === 'strength') {
            const localOverride = getSessionVariantOverride(currentUserId, routine.id, exercise.name);
            const selectedVariant = resolveSessionVariantSelection({
                inProgressExercise,
                localOverride,
                routineExercise: exercise
            });

            const initialExecutionMode = selectedVariant.executionMode;
            const initialLoadType = selectedVariant.loadType;

            exerciseBlock.dataset.executionMode = initialExecutionMode;
            exerciseBlock.dataset.loadType = initialLoadType;

            const variantControls = document.createElement('div');
            variantControls.className = 'session-variant-controls';

            const executionModeField = document.createElement('div');
            executionModeField.className = 'session-variant-field';
            const executionModeLabelElement = document.createElement('label');
            executionModeLabelElement.htmlFor = `session-execution-mode-${exerciseIndex}`;
            executionModeLabelElement.textContent = t('session.execution_mode');
            executionModeField.appendChild(executionModeLabelElement);

            const executionModeSelect = document.createElement('select');
            executionModeSelect.id = `session-execution-mode-${exerciseIndex}`;
            executionModeSelect.name = 'session-execution-mode';
            executionModeSelect.innerHTML = `
                <option value="one_hand">${t('execution_mode.one_hand')}</option>
                <option value="two_hand">${t('execution_mode.two_hand')}</option>
                <option value="machine">${t('execution_mode.machine')}</option>
                <option value="pulley">${t('execution_mode.pulley')}</option>
                <option value="other">${t('execution_mode.other')}</option>
            `;
            executionModeSelect.value = initialExecutionMode;
            executionModeField.appendChild(executionModeSelect);
            variantControls.appendChild(executionModeField);

            const loadTypeField = document.createElement('div');
            loadTypeField.className = 'session-variant-field';
            const loadTypeLabelElement = document.createElement('label');
            loadTypeLabelElement.htmlFor = `session-load-type-${exerciseIndex}`;
            loadTypeLabelElement.textContent = t('session.load_type');
            loadTypeField.appendChild(loadTypeLabelElement);

            const loadTypeSelect = document.createElement('select');
            loadTypeSelect.id = `session-load-type-${exerciseIndex}`;
            loadTypeSelect.name = 'session-load-type';
            loadTypeSelect.innerHTML = `
                <option value="external">${t('load_type.external')}</option>
                <option value="bodyweight">${t('load_type.bodyweight_with_sign')}</option>
            `;
            loadTypeSelect.value = initialLoadType;
            loadTypeField.appendChild(loadTypeSelect);
            variantControls.appendChild(loadTypeField);

            exerciseBlock.appendChild(variantControls);

            const { exerciseCache } = await import('./exercise-cache.js');
            const buildVariantSuffix = (executionMode, loadType) => {
                const variantLabels = [];
                if (executionMode !== DEFAULT_EXECUTION_MODE) {
                    variantLabels.push(getExecutionModeLabel(executionMode));
                }
                if (loadType !== DEFAULT_LOAD_TYPE) {
                    variantLabels.push(getLoadTypeLabel(loadType));
                }

                return variantLabels.length > 0 ? ' (' + variantLabels.join(', ') + ')' : '';
            };
            const getSuggestionsForVariant = (executionMode, loadType) => exerciseCache.getExerciseSuggestions(
                exercise.name,
                executionMode,
                loadType
            );
            let suggestions = getSuggestionsForVariant(initialExecutionMode, initialLoadType);
            const historyInfoContainer = document.createElement('div');
            exerciseBlock.appendChild(historyInfoContainer);

            const renderHistoryInfo = (suggestionsData, allowSignedLoad, variantSuffix) => {
                historyInfoContainer.innerHTML = '';

                if (suggestionsData.hasHistory) {
                    const lastWorkoutInfo = document.createElement('div');
                    lastWorkoutInfo.className = 'last-workout-info';

                    const daysAgo = suggestionsData.daysSinceLastSession;
                    const timeText = daysAgo === 0 ? t('session.time_today')
                        : daysAgo === 1 ? t('session.time_yesterday')
                            : t('session.time_days_ago', { days: daysAgo });

                    const header = document.createElement('div');
                    header.className = 'last-workout-header';
                    const titleElement = document.createElement('span');
                    titleElement.className = 'last-workout-title';
                    titleElement.textContent = `${t('session.last_workout')}${variantSuffix}`;
                    const timeElement = document.createElement('span');
                    timeElement.className = 'workout-time-ago';
                    timeElement.textContent = timeText;
                    header.appendChild(titleElement);
                    header.appendChild(timeElement);

                    const details = document.createElement('div');
                    details.className = 'last-workout-details';
                    suggestionsData.suggestions.lastSets.forEach((set, idx) => {
                        const loadValue = allowSignedLoad
                            ? `${formatSignedWeight(set.peso)}kg ${t('session.extra_load')}`
                            : `${set.peso}kg`;
                        const detail = document.createElement('span');
                        detail.className = 'last-set';
                        detail.textContent = `${t('session.set_short')}${idx + 1}: ${loadValue} x ${set.reps}`;
                        details.appendChild(detail);
                    });

                    lastWorkoutInfo.appendChild(header);
                    lastWorkoutInfo.appendChild(details);

                    if (!inProgressExercise) {
                        const useLastBtn = document.createElement('button');
                        useLastBtn.type = 'button';
                        useLastBtn.className = 'btn btn-secondary btn-sm';
                        useLastBtn.textContent = `\uD83D\uDCCB ${t('session.use_last_values')}`;
                        useLastBtn.style.marginTop = '8px';
                        useLastBtn.addEventListener('click', () => {
                            fillExerciseWithLastValues(exerciseIndex, suggestionsData.suggestions.lastSets);
                        });
                        lastWorkoutInfo.appendChild(useLastBtn);
                    }

                    historyInfoContainer.appendChild(lastWorkoutInfo);
                    return;
                }

                const noHistoryInfo = document.createElement('div');
                noHistoryInfo.className = 'no-exercise-history';
                noHistoryInfo.textContent = `\uD83D\uDCA1 ${t('session.first_time_exercise')}`;
                historyInfoContainer.appendChild(noHistoryInfo);
            };

            const bodyweightInfo = document.createElement('p');
            bodyweightInfo.className = 'target-info session-bodyweight-hint';
            bodyweightInfo.textContent = t('session.bodyweight_hint');
            exerciseBlock.appendChild(bodyweightInfo);

            const isBodyweightSelected = () => normalizeLoadType(loadTypeSelect.value) === 'bodyweight';

            const sanitizeWeightInputValue = (rawValue, allowSignedLoad = isBodyweightSelected()) => {
                let value = (rawValue || '').replace(',', '.');

                if (allowSignedLoad) {
                    value = value.replace(/[^0-9.+-]/g, '');
                    const sign = value.startsWith('-')
                        ? '-'
                        : value.startsWith('+')
                            ? '+'
                            : '';
                    const numericSection = value.replace(/[+-]/g, '');
                    const numericParts = numericSection.split('.');
                    const integerPart = numericParts.shift() || '';
                    const decimalPart = numericParts.join('').substring(0, 2);
                    return `${sign}${integerPart}${decimalPart ? `.${decimalPart}` : ''}`;
                }

                value = value.replace(/[^0-9.]/g, '');
                const parts = value.split('.');
                const integerPart = parts.shift() || '';
                const decimalPart = parts.join('').substring(0, 2);
                return `${integerPart}${decimalPart ? `.${decimalPart}` : ''}`;
            };

            const formatWeightSuggestionPlaceholder = (rawWeight, placeholderType, allowSignedLoad) => {
                const normalizedPlaceholderType = placeholderType || '';
                const numericWeight = Number(rawWeight);

                if (Number.isFinite(numericWeight) && normalizedPlaceholderType === 'last') {
                    return allowSignedLoad
                        ? t('session.last_extra', { value: `${formatSignedWeight(numericWeight)}kg` })
                        : t('session.last_value', { value: `${numericWeight}kg` });
                }

                if (Number.isFinite(numericWeight) && normalizedPlaceholderType === 'suggested') {
                    return allowSignedLoad
                        ? t('session.suggested_extra', { value: `${formatSignedWeight(numericWeight)}kg` })
                        : t('session.suggested_value', { value: `${numericWeight}kg` });
                }

                return allowSignedLoad ? t('session.weight_placeholder_signed') : t('session.weight_placeholder_default');
            };

            const numberOfSets = parseInt(exercise.sets, 10) || 0;
            for (let i = 0; i < numberOfSets; i++) {
                const setRow = document.createElement('div');
                setRow.className = 'set-row';
                setRow.dataset.setIndex = i;

                const setLabel = document.createElement('label');
                setLabel.textContent = t('session.set_label', { index: i + 1 });
                setLabel.htmlFor = `weight-${exerciseIndex}-${i}`;
                setRow.appendChild(setLabel);

                const weightInput = document.createElement('input');
                weightInput.type = 'text';
                weightInput.id = `weight-${exerciseIndex}-${i}`;
                weightInput.name = `weight-${exerciseIndex}-${i}`;

                let placeholderType = 'default';
                let suggestionWeight = null;
                if (suggestions.hasHistory && suggestions.suggestions.lastSets[i]) {
                    const lastSet = suggestions.suggestions.lastSets[i];
                    if (lastSet && Number.isFinite(Number(lastSet.peso))) {
                        placeholderType = 'last';
                        suggestionWeight = Number(lastSet.peso);
                        weightInput.dataset.suggestion = String(suggestionWeight);
                    }
                } else if (suggestions.hasHistory && Number.isFinite(Number(suggestions.suggestions.peso))) {
                    placeholderType = 'suggested';
                    suggestionWeight = Number(suggestions.suggestions.peso);
                    weightInput.dataset.suggestion = String(suggestionWeight);
                }

                weightInput.dataset.placeholderType = placeholderType;
                weightInput.placeholder = formatWeightSuggestionPlaceholder(
                    suggestionWeight,
                    placeholderType,
                    initialLoadType === 'bodyweight'
                );
                weightInput.inputMode = 'decimal';
                weightInput.pattern = initialLoadType === 'bodyweight'
                    ? '[+-]?[0-9]*[.,]?[0-9]*'
                    : '[0-9]*[.,]?[0-9]*';

                weightInput.addEventListener('input', function(e) {
                    e.target.value = sanitizeWeightInputValue(e.target.value);
                });

                weightInput.addEventListener('blur', function(e) {
                    const allowSignedLoad = isBodyweightSelected();
                    const sanitizedValue = sanitizeWeightInputValue(e.target.value, allowSignedLoad);
                    if (!sanitizedValue || sanitizedValue === '+' || sanitizedValue === '-') {
                        e.target.value = '';
                        return;
                    }

                    const parsed = parseFloat(sanitizedValue);
                    if (!Number.isFinite(parsed)) {
                        e.target.value = '';
                        return;
                    }

                    const minValue = allowSignedLoad ? -500 : 0;
                    const maxValue = 500;
                    const bounded = Math.min(maxValue, Math.max(minValue, parsed));
                    const rounded = Math.round(bounded * 10) / 10;
                    e.target.value = rounded;
                });

                if (inProgressExercise?.sets?.[i]) {
                    weightInput.value = inProgressExercise.sets[i].peso || '';
                }
                setRow.appendChild(weightInput);

                const repsInput = document.createElement('input');
                repsInput.type = 'number';
                repsInput.id = `reps-${exerciseIndex}-${i}`;
                repsInput.name = `reps-${exerciseIndex}-${i}`;

                let repsPlaceholder = t('session.reps_placeholder');
                if (suggestions.hasHistory && suggestions.suggestions.lastSets[i]) {
                    const lastSet = suggestions.suggestions.lastSets[i];
                    if (lastSet && lastSet.reps > 0) {
                        repsPlaceholder = t('session.last_value', { value: lastSet.reps });
                        repsInput.dataset.suggestion = lastSet.reps;
                    }
                } else if (suggestions.hasHistory && suggestions.suggestions.reps > 0) {
                    repsPlaceholder = t('session.suggested_value', { value: suggestions.suggestions.reps });
                    repsInput.dataset.suggestion = suggestions.suggestions.reps;
                }
                repsInput.placeholder = repsPlaceholder;
                repsInput.min = '0';
                if (inProgressExercise?.sets?.[i]) {
                    repsInput.value = inProgressExercise.sets[i].reps || '';
                }
                setRow.appendChild(repsInput);

                const timerContainer = document.createElement('div');
                timerContainer.className = 'set-timer';
                timerContainer.dataset.timerId = `${exerciseIndex}-${i}`;

                const timerDisplay = document.createElement('div');
                timerDisplay.id = `timer-display-${exerciseIndex}-${i}`;
                timerDisplay.className = 'timer-display';
                timerDisplay.textContent = inProgressExercise?.sets?.[i]?.tiempoDescanso || '00:00';
                timerContainer.appendChild(timerDisplay);

                const timerButton = document.createElement('button');
                timerButton.id = `timer-button-${exerciseIndex}-${i}`;
                timerButton.className = 'timer-button';
                timerButton.type = 'button';
                timerButton.dataset.timerId = `${exerciseIndex}-${i}`;
                timerButton.textContent = t('session.timer_start');
                timerContainer.appendChild(timerButton);

                setRow.appendChild(timerContainer);
                exerciseBlock.appendChild(setRow);
            }

            const syncVariantState = () => {
                const selectedExecutionMode = normalizeExecutionMode(executionModeSelect.value);
                const selectedLoadType = normalizeLoadType(loadTypeSelect.value);
                exerciseBlock.dataset.executionMode = selectedExecutionMode;
                exerciseBlock.dataset.loadType = selectedLoadType;
                const allowSignedLoad = selectedLoadType === 'bodyweight';
                suggestions = getSuggestionsForVariant(selectedExecutionMode, selectedLoadType);
                renderHistoryInfo(
                    suggestions,
                    allowSignedLoad,
                    buildVariantSuffix(selectedExecutionMode, selectedLoadType)
                );

                if (allowSignedLoad) {
                    bodyweightInfo.classList.remove('hidden');
                } else {
                    bodyweightInfo.classList.add('hidden');
                }

                const weightInputs = exerciseBlock.querySelectorAll('input[name^="weight-"]');
                weightInputs.forEach((weightInput, setIndex) => {
                    let placeholderType = 'default';
                    let suggestionWeight = null;
                    const lastSetSuggestion = suggestions.hasHistory
                        ? suggestions.suggestions.lastSets[setIndex]
                        : null;

                    if (lastSetSuggestion && Number.isFinite(Number(lastSetSuggestion.peso))) {
                        placeholderType = 'last';
                        suggestionWeight = Number(lastSetSuggestion.peso);
                    } else if (suggestions.hasHistory && Number.isFinite(Number(suggestions.suggestions.peso))) {
                        placeholderType = 'suggested';
                        suggestionWeight = Number(suggestions.suggestions.peso);
                    }

                    if (Number.isFinite(suggestionWeight)) {
                        weightInput.dataset.suggestion = String(suggestionWeight);
                    } else {
                        delete weightInput.dataset.suggestion;
                    }
                    weightInput.dataset.placeholderType = placeholderType;
                    weightInput.pattern = allowSignedLoad
                        ? '[+-]?[0-9]*[.,]?[0-9]*'
                        : '[0-9]*[.,]?[0-9]*';
                    weightInput.placeholder = formatWeightSuggestionPlaceholder(
                        suggestionWeight,
                        placeholderType,
                        allowSignedLoad
                    );
                    weightInput.value = sanitizeWeightInputValue(weightInput.value, allowSignedLoad);
                });

                const repsInputs = exerciseBlock.querySelectorAll('input[name^="reps-"]');
                repsInputs.forEach((repsInput, setIndex) => {
                    let repsPlaceholder = t('session.reps_placeholder');
                    delete repsInput.dataset.suggestion;
                    const lastSetSuggestion = suggestions.hasHistory
                        ? suggestions.suggestions.lastSets[setIndex]
                        : null;

                    if (lastSetSuggestion && lastSetSuggestion.reps > 0) {
                        repsPlaceholder = t('session.last_value', { value: lastSetSuggestion.reps });
                        repsInput.dataset.suggestion = String(lastSetSuggestion.reps);
                    } else if (suggestions.hasHistory && suggestions.suggestions.reps > 0) {
                        repsPlaceholder = t('session.suggested_value', { value: suggestions.suggestions.reps });
                        repsInput.dataset.suggestion = String(suggestions.suggestions.reps);
                    }
                    repsInput.placeholder = repsPlaceholder;
                });
            };

            executionModeSelect.addEventListener('change', syncVariantState);
            loadTypeSelect.addEventListener('change', syncVariantState);
            syncVariantState();
        } else if (exercise.type === 'cardio') {
            const infoPara = document.createElement('p');
            infoPara.textContent = t('session.cardio_info');
            infoPara.style.fontSize = '0.9em';
            infoPara.style.color = '#666';
            exerciseBlock.appendChild(infoPara);
        }

        const notesLabel = document.createElement('label');
        notesLabel.textContent = t('session.notes_label');
        notesLabel.htmlFor = `notes-${exerciseIndex}`;
        notesLabel.style.marginTop = '10px';
        exerciseBlock.appendChild(notesLabel);

        const notesTextarea = document.createElement('textarea');
        notesTextarea.id = `notes-${exerciseIndex}`;
        notesTextarea.name = `notes-${exerciseIndex}`;
        notesTextarea.placeholder = exercise.type === 'cardio'
            ? t('session.notes_placeholder_cardio')
            : t('session.notes_placeholder_other');
        notesTextarea.className = 'exercise-notes';

        if (inProgressExercise?.notasEjercicio) {
            notesTextarea.value = inProgressExercise.notasEjercicio;
        } else if (exercise.notes) {
            notesTextarea.value = exercise.notes;
        }

        exerciseBlock.appendChild(notesTextarea);
        sessionElements.exerciseList.appendChild(exerciseBlock);
    }

    showView('session');

    import('./timer.js').then(module => {
        module.initSetTimers();
    });
}
export function renderHistoryList(sessions) {
    historyElements.loadingSpinner.classList.add('hidden');
    historyElements.list.innerHTML = '';

    if (!sessions || sessions.length === 0) {
        const li = document.createElement('li');
        li.textContent = t('history.empty');
        historyElements.list.appendChild(li);
        return;
    }

    sessions.forEach(session => {
        const li = document.createElement('li');
        li.dataset.sessionId = session.id;
        li.classList.add('session-card');
        
        const nameEl = document.createElement('div');
        nameEl.classList.add('session-name');
        nameEl.textContent = session.nombreEntrenamiento || session.diaEntrenamiento;
        li.appendChild(nameEl);
        
        const inlineInfoEl = document.createElement('div');
        inlineInfoEl.classList.add('session-inline-info');
        
        const dateEl = document.createElement('div');
        dateEl.classList.add('session-date');
        dateEl.textContent = session.fecha && session.fecha.toDate ? formatDateShort(session.fecha.toDate()) : t('history.date_unavailable');
        inlineInfoEl.appendChild(dateEl);
        
        if (session.pesoUsuario) {
            const weightEl = document.createElement('div');
            weightEl.classList.add('session-weight');
            weightEl.textContent = `${session.pesoUsuario} kg`;
            inlineInfoEl.appendChild(weightEl);
        }
        
        li.appendChild(inlineInfoEl);
        
        if (session.ejercicios && session.ejercicios.length > 0) {
            const summaryEl = document.createElement('div');
            summaryEl.classList.add('session-summary');
            summaryEl.textContent = t('history.exercises_done_count', { count: session.ejercicios.length });
            li.appendChild(summaryEl);
        }
        
        const actionsEl = document.createElement('div');
        actionsEl.classList.add('session-actions');
        
        const viewBtn = document.createElement('button');
        viewBtn.textContent = t('history.view_details');
        viewBtn.classList.add('session-action-btn', 'view');
        viewBtn.dataset.action = 'view-session';
        actionsEl.appendChild(viewBtn);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = t('history.delete');
        deleteBtn.classList.add('session-action-btn', 'delete');
        deleteBtn.dataset.action = 'delete-session';
        deleteBtn.dataset.sessionId = session.id;
        actionsEl.appendChild(deleteBtn);
        
        li.appendChild(actionsEl);
        
        li.addEventListener('click', (e) => {
            if (e.target.classList.contains('session-action-btn')) {
                return;
            }
            viewBtn.click();
        });
        
        historyElements.list.appendChild(li);
    });
    
    applyHistoryFilters(); 
}

export function showSessionDetail(sessionData) {
    if (!sessionData) return;
    
    sessionDetailModal.title.textContent = sessionData.nombreEntrenamiento || sessionData.diaEntrenamiento || t('history.detail_title');
    
    const dateInfo = `${formatDate(sessionData.fecha.toDate())}`;
    sessionDetailModal.date.textContent = dateInfo;
    
    if (sessionData.pesoUsuario) {
        const weightBadge = document.createElement('span');
        weightBadge.classList.add('user-weight-badge');
        weightBadge.textContent = t('history.weight_badge', { weight: sessionData.pesoUsuario });
        sessionDetailModal.date.appendChild(weightBadge);
    }
    
    sessionDetailModal.exercises.innerHTML = '';
    
    if (sessionData.ejercicios && sessionData.ejercicios.length > 0) {
        sessionData.ejercicios.forEach(ex => {
            const exLi = document.createElement('li');
            exLi.classList.add('exercise-detail');
            
            const nameEl = document.createElement('strong');
            nameEl.textContent = ex.nombreEjercicio;
            exLi.appendChild(nameEl);
            
            const typeEl = document.createElement('span');
            typeEl.classList.add('exercise-type-badge');
            
            if (ex.tipoEjercicio === 'strength') {
                typeEl.classList.add('strength');
                typeEl.textContent = t('history.type_strength');
            } else if (ex.tipoEjercicio === 'cardio') {
                typeEl.classList.add('cardio');
                typeEl.textContent = t('history.type_cardio');
            } else {
                typeEl.classList.add('other');
                typeEl.textContent = ex.tipoEjercicio || t('history.type_other');
            }
            
            exLi.appendChild(typeEl);

            const hasExecutionMode =
                ex.modoEjecucion !== undefined
                || ex.executionMode !== undefined
                || ex.execution_mode !== undefined
                || ex.modo !== undefined;

            const hasLoadType =
                ex.tipoCarga !== undefined
                || ex.loadType !== undefined
                || ex.load_type !== undefined
                || ex.tipo_carga !== undefined;

            if (ex.tipoEjercicio === 'strength' && hasExecutionMode) {
                const executionMode = resolveExerciseExecutionMode(ex);
                const modeEl = document.createElement('span');
                modeEl.classList.add('exercise-execution-mode-badge');
                modeEl.classList.add(`mode-${executionMode}`);
                modeEl.textContent = t('history.execution_mode', { value: getExecutionModeLabel(executionMode) });
                exLi.appendChild(modeEl);
            }

            if (ex.tipoEjercicio === 'strength' && hasLoadType) {
                const loadType = resolveExerciseLoadType(ex);
                const loadTypeEl = document.createElement('span');
                loadTypeEl.classList.add('exercise-execution-mode-badge');
                loadTypeEl.classList.add(`load-${loadType}`);
                loadTypeEl.textContent = t('history.load_type', { value: getLoadTypeLabel(loadType) });
                exLi.appendChild(loadTypeEl);
            }
            
            if (ex.tipoEjercicio === 'strength' && ex.sets && ex.sets.length > 0) {
                const loadType = resolveExerciseLoadType(ex);
                const isBodyweightExercise = loadType === 'bodyweight';
                const setsUl = document.createElement('ul');
                setsUl.classList.add('sets-list');
                
                ex.sets.forEach((set, index) => {
                    const setLi = document.createElement('li');
                    let setContent = '';

                    if (isBodyweightExercise) {
                        const extraLoad = Number(set.peso);
                        const extraLoadText = Number.isFinite(extraLoad)
                            ? `${formatSignedWeight(extraLoad)}`
                            : escapeHtml(set.peso);
                        setContent = t('history.series_bodyweight', { index: index + 1, extraLoad: `${extraLoadText}` });

                        const totalLoad = Number(set.pesoTotal ?? set.totalWeight);
                        if (Number.isFinite(totalLoad)) {
                            setContent += t('history.total_weight', { total: totalLoad });
                        }

                        setContent += t('history.reps_suffix', { reps: escapeHtml(set.reps) });
                    } else {
                        setContent = t('history.series_line', {
                            index: index + 1,
                            weight: escapeHtml(set.peso),
                            reps: escapeHtml(set.reps)
                        });
                    }
                    
                    if (set.tiempoDescanso && set.tiempoDescanso !== '00:00') {
                        setContent += ` <span class="rest-time-badge">${t('history.rest_badge', { rest: escapeHtml(set.tiempoDescanso) })}</span>`;
                    }
                    
                    setLi.innerHTML = setContent;
                    setsUl.appendChild(setLi);
                });
                
                exLi.appendChild(setsUl);
            }
            if (ex.notasEjercicio) {
                const notesEl = document.createElement('p');
                notesEl.classList.add('exercise-notes');
                notesEl.innerHTML = `<em>${t('history.notes_prefix')}: ${escapeHtml(ex.notasEjercicio)}</em>`;
                exLi.appendChild(notesEl);
            }
            
            sessionDetailModal.exercises.appendChild(exLi);
        });
    } else {
        const noExercisesEl = document.createElement('p');
        noExercisesEl.textContent = t('history.exercise_none');
        sessionDetailModal.exercises.appendChild(noExercisesEl);
    }
    
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
                <div class="routine-name">${t('routines.empty_title')}</div>
                <div class="routine-description">${t('routines.empty_description')}</div>
            </div>
        `;
        manageRoutinesElements.list.appendChild(li);
        return;
    }

    routines.forEach(routine => {
        const li = document.createElement('li');
        li.className = 'routine-card';

        const routineInfo = document.createElement('div');
        routineInfo.className = 'routine-info';

        const nameContainer = document.createElement('div');
        nameContainer.className = 'routine-name-container';
        
        const nameSpan = document.createElement('div');
        nameSpan.className = 'routine-name';
        nameSpan.textContent = routine.name;
        nameContainer.appendChild(nameSpan);

        routineInfo.appendChild(nameContainer);

        const description = document.createElement('div');
        description.className = 'routine-description';
        const exerciseCount = routine.exercises ? routine.exercises.length : 0;
        description.textContent = t('routines.exercise_count', { count: exerciseCount });
        routineInfo.appendChild(description);

        li.appendChild(routineInfo);

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'routine-actions';

        const editBtn = document.createElement('button');
        editBtn.textContent = t('routines.edit');
        editBtn.className = 'routine-action-btn edit';
        editBtn.dataset.routineId = routine.id;
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const event = new CustomEvent('editRoutineClicked', { detail: { routineId: e.target.dataset.routineId }});
            document.dispatchEvent(event);
        });
        actionsDiv.appendChild(editBtn);

        li.appendChild(actionsDiv);

        li.addEventListener('click', (e) => {
            if (!e.target.closest('.routine-actions')) {
                editBtn.click();
            }
        });

        manageRoutinesElements.list.appendChild(li);
    });
    
    showView('manageRoutines');
}

let exerciseEditorCounter = 0;

export function renderRoutineEditor(routine = null) {
    routineEditorElements.form.reset();
    routineEditorElements.exercisesContainer.innerHTML = '';
    exerciseEditorCounter = 0;

    if (routine) {
        routineEditorElements.title.textContent = t('routines.editor_edit_title');
        routineEditorElements.routineIdInput.value = routine.id;
        routineEditorElements.routineNameInput.value = routine.name;
        routineEditorElements.deleteRoutineBtn.classList.remove('hidden');
        routineEditorElements.deleteRoutineBtn.dataset.routineId = routine.id;

        routine.exercises.forEach(ex => addExerciseToEditorForm(ex));
    } else {
        routineEditorElements.title.textContent = t('routines.editor_create_title');
        routineEditorElements.routineIdInput.value = '';
        routineEditorElements.deleteRoutineBtn.classList.add('hidden');
        addExerciseToEditorForm();
    }
    showView('routineEditor');
}


export function addExerciseToEditorForm(exerciseData = null) {
    exerciseEditorCounter++;
    const exerciseDiv = document.createElement('div');
    exerciseDiv.className = 'routine-exercise-editor';
    exerciseDiv.dataset.editorId = `exEditor-${exerciseEditorCounter}`;

    const exerciseType = exerciseData?.type || 'strength';
    const exerciseExecutionMode = normalizeExecutionMode(
        exerciseData?.executionMode ?? exerciseData?.modoEjecucion
    );
    const exerciseLoadType = normalizeLoadType(
        exerciseData?.loadType ?? exerciseData?.tipoCarga
    );

    exerciseDiv.innerHTML = `
        <button type="button" class="remove-exercise-btn" data-target="${exerciseDiv.dataset.editorId}" title="${t('routines.editor_remove_exercise_title')}">x</button>
        
        <div class="exercise-header">
            <label for="ex-name-${exerciseEditorCounter}">${t('routines.editor_exercise_name')}</label>
            <input type="text" id="ex-name-${exerciseEditorCounter}" name="ex-name" value="${escapeHtml(exerciseData?.name || '')}" required placeholder="${t('routines.editor_exercise_name_placeholder')}">
        </div>

        <div class="exercise-type-selector">
            <label for="ex-type-${exerciseEditorCounter}">${t('routines.editor_exercise_type')}</label>
            <select id="ex-type-${exerciseEditorCounter}" name="ex-type">
                <option value="strength" ${exerciseType === 'strength' ? 'selected' : ''}>${t('routines.editor_type_strength')}</option>
                <option value="cardio" ${exerciseType === 'cardio' ? 'selected' : ''}>${t('routines.editor_type_cardio')}</option>
            </select>
        </div>

        <div class="strength-fields exercise-fields" style="display: ${exerciseType === 'strength' ? 'block' : 'none'};">
            <div class="field-group-header">
                <span class="field-group-icon">[S]</span>
                <span class="field-group-title">${t('routines.editor_strength_config')}</span>
            </div>
            <div class="form-grid">
                <div class="form-field">
                    <label for="ex-sets-${exerciseEditorCounter}">${t('routines.editor_sets')}</label>
                    <input type="number" id="ex-sets-${exerciseEditorCounter}" name="ex-sets" min="0" value="${escapeHtml(exerciseData?.sets || '')}" placeholder="3">
                </div>
                <div class="form-field">
                    <label for="ex-reps-${exerciseEditorCounter}">${t('routines.editor_reps')}</label>
                    <input type="text" id="ex-reps-${exerciseEditorCounter}" name="ex-reps" value="${escapeHtml(exerciseData?.reps || '')}" placeholder="8-12">
                </div>
                <div class="form-field">
                    <label for="ex-execution-mode-${exerciseEditorCounter}">${t('routines.editor_execution_mode')}</label>
                    <select id="ex-execution-mode-${exerciseEditorCounter}" name="ex-execution-mode">
                        <option value="one_hand" ${exerciseExecutionMode === 'one_hand' ? 'selected' : ''}>${t('execution_mode.one_hand')}</option>
                        <option value="two_hand" ${exerciseExecutionMode === 'two_hand' ? 'selected' : ''}>${t('execution_mode.two_hand')}</option>
                        <option value="machine" ${exerciseExecutionMode === 'machine' ? 'selected' : ''}>${t('execution_mode.machine')}</option>
                        <option value="pulley" ${exerciseExecutionMode === 'pulley' ? 'selected' : ''}>${t('execution_mode.pulley')}</option>
                        <option value="other" ${exerciseExecutionMode === 'other' ? 'selected' : ''}>${t('execution_mode.other')}</option>
                    </select>
                </div>
                <div class="form-field">
                    <label for="ex-load-type-${exerciseEditorCounter}">${t('routines.editor_load_type')}</label>
                    <select id="ex-load-type-${exerciseEditorCounter}" name="ex-load-type">
                        <option value="external" ${exerciseLoadType === 'external' ? 'selected' : ''}>${t('load_type.external')}</option>
                        <option value="bodyweight" ${exerciseLoadType === 'bodyweight' ? 'selected' : ''}>${t('load_type.bodyweight_with_sign')}</option>
                    </select>
                </div>
            </div>
        </div>
        
        <div class="cardio-fields exercise-fields" style="display: ${exerciseType === 'cardio' ? 'block' : 'none'};">
            <div class="field-group-header">
                <span class="field-group-icon">[C]</span>
                <span class="field-group-title">${t('routines.editor_cardio_config')}</span>
            </div>
            <div class="form-field">
                <label for="ex-duration-${exerciseEditorCounter}">${t('routines.editor_duration')}</label>
                <input type="text" id="ex-duration-${exerciseEditorCounter}" name="ex-duration" value="${escapeHtml(exerciseData?.duration || '')}" placeholder="30 min, 5km, etc.">
            </div>
        </div>
        
        <div class="exercise-notes">
            <label for="ex-notes-${exerciseEditorCounter}">${t('routines.editor_notes')}</label>
            <textarea id="ex-notes-${exerciseEditorCounter}" name="ex-notes" placeholder="${exerciseType === 'strength' ? t('session.notes_placeholder_strength') : t('session.notes_placeholder_cardio')}">${escapeHtml(exerciseData?.notes || '')}</textarea>
        </div>
    `;
    
    routineEditorElements.exercisesContainer.appendChild(exerciseDiv);

    const typeSelect = exerciseDiv.querySelector('select[name="ex-type"]');
    const strengthFields = exerciseDiv.querySelector('.strength-fields');
    const cardioFields = exerciseDiv.querySelector('.cardio-fields');

    typeSelect.addEventListener('change', (e) => {
        const notesTextarea = exerciseDiv.querySelector('textarea[name="ex-notes"]');
        
        if (e.target.value === 'strength') {
            strengthFields.style.display = 'block';
            cardioFields.style.display = 'none';
            notesTextarea.placeholder = t('session.notes_placeholder_strength');
        } else {
            strengthFields.style.display = 'none';
            cardioFields.style.display = 'block';
            notesTextarea.placeholder = t('session.notes_placeholder_cardio');
        }
    });

    const removeBtn = exerciseDiv.querySelector('.remove-exercise-btn');
    removeBtn.addEventListener('click', () => {
        exerciseDiv.style.animation = 'slideOutUp 0.3s ease forwards';
        setTimeout(() => {
            exerciseDiv.remove();
        }, 300);
    });
    
    exerciseDiv.style.animation = 'slideInUp 0.3s ease forwards';
}


export function showLoading(buttonElement, text = t('common.loading')) {
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
logger.debug('Calendar elements loaded:', {
    container: !!calendarElements.container,
    calendarView: !!calendarElements.calendarView,
    prevMonthBtn: !!calendarElements.prevMonthBtn,
    nextMonthBtn: !!calendarElements.nextMonthBtn,
    currentMonthDisplay: !!calendarElements.currentMonthDisplay,
    loadingSpinner: !!calendarElements.loadingSpinner
});

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
                dateEl ? dateEl.textContent.toLowerCase() : '',
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
    logger.warn('History search input not found for attaching event listener in ui.js');
}

// Helper function to fill exercise inputs with last workout values
function fillExerciseWithLastValues(exerciseIndex, lastSets) {
    const exerciseBlock = sessionElements.exerciseList.querySelector(`[data-exercise-index="${exerciseIndex}"]`);
    if (!exerciseBlock) return;
    
    lastSets.forEach((set, setIndex) => {
        const weightInput = exerciseBlock.querySelector(`input[name="weight-${exerciseIndex}-${setIndex}"]`);
        const repsInput = exerciseBlock.querySelector(`input[name="reps-${exerciseIndex}-${setIndex}"]`);
        
        if (weightInput && Number.isFinite(Number(set.peso))) {
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
    
    // Show feedback message using toast notification
    toast.success(t('session.last_values_applied'));
}


