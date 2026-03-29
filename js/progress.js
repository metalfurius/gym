// progress.js - Progress view and charting logic

import { progressElements } from './ui.js';
import { logger } from './utils/logger.js';
import { localFirstCache } from './utils/local-first-cache.js';
import { firebaseUsageTracker } from './utils/firebase-usage-tracker.js';
import { serializeSessionsForCache, deserializeSessionsFromCache } from './utils/firestore-serialization.js';
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

let progressChart = null;
const exerciseDataCache = new Map();

const PROGRESS_SESSIONS_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_PROGRESS_SESSIONS = 300;

const progressTabCache = {
    exercisesList: null,
    exercisesWithCount: null,
    lastCacheTime: null,
    isInitialized: false,
    cacheValidityTime: 5 * 60 * 1000
};

export function normalizeExerciseName(name) {
    if (!name) return '';
    return name.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, '_');
}

const EXERCISE_MODE_SEPARATOR = '::mode=';
const EXERCISE_LOAD_TYPE_SEPARATOR = '::load=';

function safeDecodeExerciseName(value) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function buildExerciseLabel(
    exerciseName,
    executionMode = DEFAULT_EXECUTION_MODE,
    loadType = DEFAULT_LOAD_TYPE
) {
    const mode = normalizeExecutionMode(executionMode);
    const normalizedLoadType = normalizeLoadType(loadType);
    const variants = [];

    if (mode !== DEFAULT_EXECUTION_MODE) {
        variants.push(getExecutionModeLabel(mode));
    }

    if (normalizedLoadType !== DEFAULT_LOAD_TYPE) {
        variants.push(getLoadTypeLabel(normalizedLoadType));
    }

    return variants.length > 0
        ? `${exerciseName} (${variants.join(', ')})`
        : exerciseName;
}

function buildExerciseSelectionValue(
    exerciseName,
    executionMode = DEFAULT_EXECUTION_MODE,
    loadType = DEFAULT_LOAD_TYPE
) {
    const mode = normalizeExecutionMode(executionMode);
    const normalizedLoadType = normalizeLoadType(loadType);
    return `${encodeURIComponent(exerciseName)}${EXERCISE_MODE_SEPARATOR}${mode}${EXERCISE_LOAD_TYPE_SEPARATOR}${normalizedLoadType}`;
}

function parseExerciseSelectionValue(value) {
    if (!value || typeof value !== 'string') {
        return null;
    }

    if (!value.includes(EXERCISE_MODE_SEPARATOR)) {
        const fallbackName = safeDecodeExerciseName(value);
        return {
            value: buildExerciseSelectionValue(fallbackName, DEFAULT_EXECUTION_MODE, DEFAULT_LOAD_TYPE),
            name: fallbackName,
            executionMode: DEFAULT_EXECUTION_MODE,
            loadType: DEFAULT_LOAD_TYPE,
            label: buildExerciseLabel(fallbackName, DEFAULT_EXECUTION_MODE, DEFAULT_LOAD_TYPE)
        };
    }

    const [encodedName, modeAndLoad] = value.split(EXERCISE_MODE_SEPARATOR);
    const hasLoadType = modeAndLoad.includes(EXERCISE_LOAD_TYPE_SEPARATOR);
    const [rawMode, rawLoadType] = hasLoadType
        ? modeAndLoad.split(EXERCISE_LOAD_TYPE_SEPARATOR)
        : [modeAndLoad, DEFAULT_LOAD_TYPE];
    const name = safeDecodeExerciseName(encodedName || '');
    const executionMode = normalizeExecutionMode(rawMode);
    const loadType = normalizeLoadType(rawLoadType);
    const label = buildExerciseLabel(name, executionMode, loadType);

    return {
        value: buildExerciseSelectionValue(name, executionMode, loadType),
        name,
        executionMode,
        loadType,
        label
    };
}

function buildExerciseDescriptor(
    exerciseName,
    executionMode = DEFAULT_EXECUTION_MODE,
    loadType = DEFAULT_LOAD_TYPE
) {
    const mode = normalizeExecutionMode(executionMode);
    const normalizedLoadType = normalizeLoadType(loadType);
    return parseExerciseSelectionValue(buildExerciseSelectionValue(exerciseName, mode, normalizedLoadType));
}

function inferExecutionModeFromCacheEntry(entry = {}, cacheKey = '') {
    if (entry.executionMode) {
        return normalizeExecutionMode(entry.executionMode);
    }

    const modeMatch = cacheKey.match(/__(one_hand|two_hand|machine|pulley|other)(?:__(external|bodyweight))?$/);
    if (modeMatch && modeMatch[1]) {
        return normalizeExecutionMode(modeMatch[1]);
    }

    return DEFAULT_EXECUTION_MODE;
}

function inferLoadTypeFromCacheEntry(entry = {}, cacheKey = '') {
    if (entry.loadType) {
        return normalizeLoadType(entry.loadType);
    }

    const loadTypeMatch = cacheKey.match(/__(external|bodyweight)$/);
    if (loadTypeMatch && loadTypeMatch[1]) {
        return normalizeLoadType(loadTypeMatch[1]);
    }

    return DEFAULT_LOAD_TYPE;
}

function resolveSetWeightForMetrics(set = {}, loadType = DEFAULT_LOAD_TYPE, fallbackBodyweight = null) {
    const normalizedLoadType = normalizeLoadType(loadType);

    if (normalizedLoadType === 'bodyweight') {
        const totalWeight = Number(set.pesoTotal ?? set.totalWeight);
        if (Number.isFinite(totalWeight)) {
            return totalWeight;
        }

        const externalLoad = Number(set.peso ?? set.weight);
        const bodyweight = Number(fallbackBodyweight);
        if (Number.isFinite(externalLoad) && Number.isFinite(bodyweight) && bodyweight > 0) {
            return externalLoad + bodyweight;
        }
    }

    const parsedWeight = Number(set.peso ?? set.weight);
    return Number.isFinite(parsedWeight) ? parsedWeight : 0;
}

function isProgressCacheValid() {
    if (!progressTabCache.exercisesList || !progressTabCache.lastCacheTime) {
        return false;
    }

    const cacheAge = Date.now() - progressTabCache.lastCacheTime;
    return cacheAge < progressTabCache.cacheValidityTime;
}

export function invalidateProgressCache() {
    progressTabCache.exercisesList = null;
    progressTabCache.exercisesWithCount = null;
    progressTabCache.lastCacheTime = null;
    progressTabCache.isInitialized = false;
    exerciseDataCache.clear();

    localFirstCache.clearByPrefix('progress:sessions:').catch((error) => {
        logger.warn('Could not invalidate cached progress sessions:', error);
    });
}

function cacheExercisesList(exercises, exercisesWithCount = null) {
    progressTabCache.exercisesList = [...exercises];
    progressTabCache.exercisesWithCount = exercisesWithCount ? [...exercisesWithCount] : null;
    progressTabCache.lastCacheTime = Date.now();
    progressTabCache.isInitialized = true;
}

export async function initializeProgressView() {
    if (!progressElements.exerciseSelect) {
        logger.error('Progress elements not found');
        return;
    }

    if (typeof Chart === 'undefined') {
        setTimeout(initializeProgressView, 100);
        return;
    }

    logger.info('Progress view initialized');
}

function populateExerciseSelector(exercises, fromCache = false, exercisesWithCount = null) {
    if (!progressElements.exerciseSelect) return;

    progressElements.exerciseSelect.innerHTML = '<option value="">-- Selecciona un ejercicio --</option>';

    if (exercises.length === 0) {
        progressElements.exerciseSelect.innerHTML = '<option value="">No hay ejercicios en el historial</option>';
        showNoDataMessage();
        return;
    }

    exercises.forEach((exerciseItem) => {
        const descriptor = typeof exerciseItem === 'string'
            ? buildExerciseDescriptor(exerciseItem, DEFAULT_EXECUTION_MODE, DEFAULT_LOAD_TYPE)
            : exerciseItem;

        if (!descriptor) {
            return;
        }

        const option = document.createElement('option');
        option.value = descriptor.value;

        if (exercisesWithCount) {
            const info = exercisesWithCount.find((exercise) => exercise.value === descriptor.value);
            option.textContent = `${descriptor.label} (${info ? info.sessionCount : 0} sesiones)`;
        } else {
            option.textContent = descriptor.label;
        }

        progressElements.exerciseSelect.appendChild(option);
    });

    if (!fromCache) {
        cacheExercisesList(exercises, exercisesWithCount);
    } else {
        showCacheIndicator();
    }

    hideProgressLoading();
}

function showCacheIndicator() {
    const indicator = document.createElement('div');
    indicator.textContent = 'Cargado desde cache';
    indicator.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--accent-color, #667eea);
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 12px;
        z-index: 1000;
        opacity: 0;
        transition: opacity 0.3s ease;
        pointer-events: none;
    `;

    document.body.appendChild(indicator);
    requestAnimationFrame(() => {
        indicator.style.opacity = '1';
    });

    setTimeout(() => {
        indicator.style.opacity = '0';
        setTimeout(() => {
            if (indicator.parentNode) {
                document.body.removeChild(indicator);
            }
        }, 300);
    }, 2000);
}

export async function loadExerciseList() {
    if (!progressElements.exerciseSelect) return;

    if (isProgressCacheValid() && progressTabCache.exercisesList && progressTabCache.exercisesWithCount) {
        populateExerciseSelector(progressTabCache.exercisesList, true, progressTabCache.exercisesWithCount);
        return;
    }

    showProgressLoading();

    try {
        const { exerciseCache } = await import('./exercise-cache.js');
        let fullCache = exerciseCache.exportCache();

        if (Object.keys(fullCache).length === 0) {
            const { getCurrentUser } = await import('./auth.js');
            const { db } = await import('./firebase-config.js');
            const user = getCurrentUser();

            if (user && db) {
                await exerciseCache.validateAndRebuildCache(user.uid, db);
                fullCache = exerciseCache.exportCache();
            }
        }

        const exercisesWithCount = [];
        Object.keys(fullCache).forEach((exerciseKey) => {
            const exercise = fullCache[exerciseKey];
            if (!exercise.originalName || !exercise.history || exercise.history.length < 3) {
                return;
            }

            const executionMode = inferExecutionModeFromCacheEntry(exercise, exerciseKey);
            const loadType = inferLoadTypeFromCacheEntry(exercise, exerciseKey);
            const descriptor = buildExerciseDescriptor(exercise.originalName, executionMode, loadType);
            exercisesWithCount.push({
                ...descriptor,
                sessionCount: exercise.history.length
            });
        });

        exercisesWithCount.sort((a, b) => {
            if (b.sessionCount !== a.sessionCount) {
                return b.sessionCount - a.sessionCount;
            }
            return a.label.localeCompare(b.label);
        });

        const sortedExercises = exercisesWithCount.map((exercise) => ({
            value: exercise.value,
            label: exercise.label,
            name: exercise.name,
            executionMode: exercise.executionMode,
            loadType: exercise.loadType
        }));

        if (sortedExercises.length === 0) {
            const fallbackData = await loadExercisesFromSessions();
            populateExerciseSelector(fallbackData.names, false, fallbackData.withCounts);
        } else {
            populateExerciseSelector(sortedExercises, false, exercisesWithCount);
        }
    } catch (error) {
        logger.error('Error loading exercise list:', error);
        progressElements.exerciseSelect.innerHTML = '<option value="">Error cargando ejercicios</option>';
        hideProgressLoading();
    }
}

export async function handleExerciseChange() {
    const selectedExercise = progressElements.exerciseSelect?.value;

    if (!selectedExercise) {
        hideChart();
        hideStats();
        hideNoDataMessage();
        return;
    }

    await updateChart();
}

export async function updateChart() {
    const selectedExerciseValue = progressElements.exerciseSelect?.value;
    const selectedMetric = progressElements.metricSelect?.value;
    const selectedPeriod = progressElements.periodSelect?.value;
    const selectedExercise = parseExerciseSelectionValue(selectedExerciseValue);

    if (!selectedExerciseValue || !selectedExercise) {
        hideChart();
        hideStats();
        return;
    }

    showProgressLoading();

    try {
        const exerciseData = await getExerciseData(selectedExercise, selectedPeriod);

        if (!exerciseData || exerciseData.length < 3) {
            hideChart();
            hideStats();
            showNoDataMessage();
            return;
        }

        const chartData = processChartData(exerciseData, selectedMetric);
        createOrUpdateChart(chartData, selectedExercise.label, selectedMetric);
        updateProgressStats(exerciseData, selectedMetric);

        showChart();
        showStats();
        hideNoDataMessage();
    } catch (error) {
        logger.error('Error updating chart:', error);
        hideChart();
        hideStats();
        showNoDataMessage();
    } finally {
        hideProgressLoading();
    }
}

async function getExerciseData(exerciseSelection, period) {
    try {
        const cacheKey = `${exerciseSelection.value}_${period}`;
        if (exerciseDataCache.has(cacheKey)) {
            return exerciseDataCache.get(cacheKey);
        }

        const { exerciseCache } = await import('./exercise-cache.js');
        const fullCache = exerciseCache.exportCache();

        const normalizedSelectedName = normalizeExerciseName(exerciseSelection.name);
        const selectedMode = normalizeExecutionMode(exerciseSelection.executionMode);
        const selectedLoadType = normalizeLoadType(exerciseSelection.loadType);

        const exerciseKey = Object.keys(fullCache).find((key) => {
            const cacheEntry = fullCache[key];
            const normalizedName = normalizeExerciseName(cacheEntry.originalName);
            const cacheMode = inferExecutionModeFromCacheEntry(cacheEntry, key);
            const cacheLoadType = inferLoadTypeFromCacheEntry(cacheEntry, key);
            return (
                normalizedName === normalizedSelectedName
                && cacheMode === selectedMode
                && cacheLoadType === selectedLoadType
            );
        });

        if (!exerciseKey || !fullCache[exerciseKey].history) {
            return await getExerciseDataFromSessions(exerciseSelection, period);
        }

        let exerciseHistory = fullCache[exerciseKey].history;

        const now = new Date();
        let startDate = new Date();
        switch (period) {
            case '3m':
                startDate.setMonth(now.getMonth() - 3);
                break;
            case '6m':
                startDate.setMonth(now.getMonth() - 6);
                break;
            case '1y':
                startDate.setFullYear(now.getFullYear() - 1);
                break;
            case 'all':
            default:
                startDate = new Date('2020-01-01');
                break;
        }

        exerciseHistory = exerciseHistory.filter((record) => {
            const recordDate = record.date instanceof Date ? record.date : new Date(record.date);
            return recordDate >= startDate;
        });

        const processedData = exerciseHistory.map((record) => {
            const recordDate = record.date instanceof Date ? record.date : new Date(record.date);
            let maxWeight = Number.NEGATIVE_INFINITY;
            let totalVolume = 0;
            let maxReps = 0;

            if (record.sets && Array.isArray(record.sets)) {
                record.sets.forEach((set) => {
                    const weight = resolveSetWeightForMetrics(set, selectedLoadType);
                    const reps = parseInt(set.reps || set.repeticiones || 0, 10);

                    if (weight > maxWeight) maxWeight = weight;
                    if (reps > maxReps) maxReps = reps;
                    totalVolume += weight * reps;
                });
            }

            return {
                date: recordDate,
                weight: maxWeight === Number.NEGATIVE_INFINITY ? 0 : maxWeight,
                volume: totalVolume,
                reps: maxReps,
                sets: record.sets
            };
        });

        processedData.sort((a, b) => a.date - b.date);
        exerciseDataCache.set(cacheKey, processedData);

        return processedData;
    } catch (error) {
        logger.error('Error getting exercise data:', error);
        return [];
    }
}

async function loadSessionHistoryForProgress() {
    const { getCurrentUser } = await import('./auth.js');
    const user = getCurrentUser();
    if (!user) return [];

    const cacheKey = `progress:sessions:${user.uid}`;
    const cachedEntry = await localFirstCache.getEntry(cacheKey);

    if (cachedEntry?.value && Array.isArray(cachedEntry.value) && localFirstCache.isFresh(cachedEntry, PROGRESS_SESSIONS_CACHE_TTL_MS)) {
        return deserializeSessionsFromCache(cachedEntry.value);
    }

    const { db } = await import('./firebase-config.js');
    const { collection, query, orderBy, limit, getDocs } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');

    const sessionsRef = collection(db, 'users', user.uid, 'sesiones_entrenamiento');
    const q = query(sessionsRef, orderBy('fecha', 'desc'), limit(MAX_PROGRESS_SESSIONS));
    const querySnapshot = await getDocs(q);

    firebaseUsageTracker.trackRead(querySnapshot.docs.length || 1, 'progress.sessionHistoryFallback', {
        limit: MAX_PROGRESS_SESSIONS
    });

    const sessions = querySnapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));

    await localFirstCache.set(cacheKey, serializeSessionsForCache(sessions), {
        metadata: {
            source: 'firestore',
            limit: MAX_PROGRESS_SESSIONS
        }
    });

    return sessions;
}

async function getExerciseDataFromSessions(exerciseSelection, period) {
    try {
        logger.info(`Fallback: Loading ${exerciseSelection.label} data directly from sessions`);
        const sessions = await loadSessionHistoryForProgress();

        const exerciseData = [];
        const normalizedSelectedName = normalizeExerciseName(exerciseSelection.name);
        const selectedMode = normalizeExecutionMode(exerciseSelection.executionMode);
        const selectedLoadType = normalizeLoadType(exerciseSelection.loadType);
        let lastKnownBodyweight = null;

        const sortedSessions = [...sessions].sort((a, b) => {
            const dateA = a.fecha && a.fecha.toDate ? a.fecha.toDate() : new Date(0);
            const dateB = b.fecha && b.fecha.toDate ? b.fecha.toDate() : new Date(0);
            return dateA - dateB;
        });

        sortedSessions.forEach((sessionData) => {
            const sessionDate = sessionData.fecha && sessionData.fecha.toDate
                ? sessionData.fecha.toDate()
                : new Date();
            const sessionBodyweight = Number(sessionData.pesoUsuario ?? sessionData.userWeight);
            if (Number.isFinite(sessionBodyweight) && sessionBodyweight > 0) {
                lastKnownBodyweight = sessionBodyweight;
            }

            if (sessionData.ejercicios && Array.isArray(sessionData.ejercicios)) {
                sessionData.ejercicios.forEach((ejercicio) => {
                    const name = ejercicio.nombreEjercicio || ejercicio.name || ejercicio.ejercicio;
                    const normalizedName = normalizeExerciseName(name);

                    const executionMode = resolveExerciseExecutionMode(ejercicio);
                    const loadType = normalizeLoadType(resolveExerciseLoadType(ejercicio));

                    if (
                        normalizedName === normalizedSelectedName
                        && ejercicio.tipoEjercicio === 'strength'
                        && executionMode === selectedMode
                        && loadType === selectedLoadType
                        && ejercicio.sets
                    ) {
                        let maxWeight = Number.NEGATIVE_INFINITY;
                        let totalVolume = 0;
                        let maxReps = 0;

                        ejercicio.sets.forEach((set) => {
                            const weight = resolveSetWeightForMetrics(set, loadType, lastKnownBodyweight);
                            const reps = parseInt(set.reps || set.repeticiones || 0, 10);

                            if (weight > maxWeight) maxWeight = weight;
                            if (reps > maxReps) maxReps = reps;
                            totalVolume += weight * reps;
                        });

                        exerciseData.push({
                            date: sessionDate,
                            weight: maxWeight === Number.NEGATIVE_INFINITY ? 0 : maxWeight,
                            volume: totalVolume,
                            reps: maxReps,
                            sets: ejercicio.sets
                        });
                    }
                });
            }
        });

        const now = new Date();
        let startDate = new Date();

        switch (period) {
            case '3m':
                startDate.setMonth(now.getMonth() - 3);
                break;
            case '6m':
                startDate.setMonth(now.getMonth() - 6);
                break;
            case '1y':
                startDate.setFullYear(now.getFullYear() - 1);
                break;
            case 'all':
            default:
                startDate = new Date('2020-01-01');
                break;
        }

        const filteredData = exerciseData.filter((record) => record.date >= startDate);
        filteredData.sort((a, b) => a.date - b.date);

        return filteredData;
    } catch (error) {
        logger.error('Error in fallback exercise data loading:', error);
        return [];
    }
}

function processChartData(exerciseData, metric) {
    if (!exerciseData || exerciseData.length < 3) return { labels: [], data: [] };

    const dataByDate = new Map();

    exerciseData.forEach((entry) => {
        const dateKey = entry.date.toISOString().split('T')[0];

        if (!dataByDate.has(dateKey)) {
            dataByDate.set(dateKey, {
                date: entry.date,
                weights: [],
                reps: [],
                volumes: []
            });
        }

        const dayData = dataByDate.get(dateKey);
        dayData.weights.push(entry.weight);
        dayData.reps.push(entry.reps);
        dayData.volumes.push(entry.volume);
    });

    const chartData = [];
    const labels = [];

    Array.from(dataByDate.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([, dayData]) => {
            labels.push(formatDateForChart(dayData.date));

            let value;
            switch (metric) {
                case 'weight':
                    value = Math.max(...dayData.weights);
                    break;
                case 'reps':
                    value = Math.max(...dayData.reps);
                    break;
                case 'volume':
                    value = dayData.volumes.reduce((sum, vol) => sum + vol, 0);
                    break;
                default:
                    value = Math.max(...dayData.weights);
            }

            chartData.push(value);
        });

    return { labels, data: chartData };
}

function createOrUpdateChart(chartData, exerciseName, metric) {
    if (typeof Chart === 'undefined') {
        if (!createOrUpdateChart.retryCount) {
            createOrUpdateChart.retryCount = 0;
        }

        if (createOrUpdateChart.retryCount < 10) {
            createOrUpdateChart.retryCount++;
            setTimeout(() => createOrUpdateChart(chartData, exerciseName, metric), 200);
            return;
        }

        if (progressElements.chart?.parentElement) {
            progressElements.chart.parentElement.innerHTML = '<p class="error-message">Error: No se pudo cargar el sistema de gráficos</p>';
        }
        return;
    }

    createOrUpdateChart.retryCount = 0;

    const ctx = progressElements.chart.getContext('2d');
    if (progressChart) {
        progressChart.destroy();
    }

    const metricLabels = {
        weight: 'Peso (kg)',
        reps: 'Repeticiones',
        volume: 'Volumen (kg)'
    };

    progressChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: [{
                label: metricLabels[metric] || 'Valor',
                data: chartData.data,
                borderColor: 'rgb(102, 126, 234)',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                tension: 0.4,
                pointBackgroundColor: 'rgb(102, 126, 234)',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 6,
                pointHoverRadius: 8,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `Progreso de ${exerciseName} - ${metricLabels[metric]}`,
                    font: {
                        size: 16,
                        weight: 'bold'
                    },
                    color: 'var(--text-color)'
                },
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    },
                    ticks: {
                        color: 'var(--text-secondary-color)'
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    },
                    ticks: {
                        color: 'var(--text-secondary-color)',
                        maxTicksLimit: 10
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        }
    });
}

function updateProgressStats(exerciseData, metric) {
    if (!exerciseData || exerciseData.length < 3) return;

    const values = exerciseData.map((entry) => {
        switch (metric) {
            case 'weight':
                return entry.weight;
            case 'reps':
                return entry.reps;
            case 'volume':
                return entry.volume;
            default:
                return entry.weight;
        }
    });

    const bestRecord = Math.max(...values);
    const firstValue = values[0];
    const lastValue = values[values.length - 1];
    const totalProgress = lastValue - firstValue;

    const uniqueDates = new Set(exerciseData.map((entry) => entry.date.toDateString()));
    const sessionCount = uniqueDates.size;

    const units = {
        weight: 'kg',
        reps: 'reps',
        volume: 'kg'
    };

    progressElements.bestRecord.textContent = `${bestRecord.toFixed(1)} ${units[metric]}`;
    progressElements.sessionCount.textContent = sessionCount;

    let trendClass = 'trend-stable';
    let progressText = '0';

    if (totalProgress > 0) {
        trendClass = 'trend-up';
        progressText = `+${totalProgress.toFixed(1)} ${units[metric]}`;
    } else if (totalProgress < 0) {
        trendClass = 'trend-down';
        progressText = `${totalProgress.toFixed(1)} ${units[metric]}`;
    }

    progressElements.totalProgress.textContent = progressText;
    progressElements.trendIndicator.className = trendClass;
    progressElements.trendIndicator.textContent = trendClass === 'trend-up'
        ? 'Mejorando'
        : trendClass === 'trend-down'
            ? 'Descendiendo'
            : 'Estable';
}

function formatDateForChart(date) {
    return date.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short'
    });
}

function showProgressLoading() {
    if (progressElements.loadingSpinner) {
        progressElements.loadingSpinner.classList.remove('hidden');
    }
}

function hideProgressLoading() {
    if (progressElements.loadingSpinner) {
        progressElements.loadingSpinner.classList.add('hidden');
    }
}

function showChart() {
    if (progressElements.chartContainer) {
        progressElements.chartContainer.classList.remove('hidden');
    }
}

function hideChart() {
    if (progressElements.chartContainer) {
        progressElements.chartContainer.classList.add('hidden');
    }
}

function showStats() {
    if (progressElements.statsContainer) {
        progressElements.statsContainer.classList.remove('hidden');
    }
}

function hideStats() {
    if (progressElements.statsContainer) {
        progressElements.statsContainer.classList.add('hidden');
    }
}

function showNoDataMessage() {
    if (progressElements.noDataMessage) {
        progressElements.noDataMessage.classList.remove('hidden');
    }
}

function hideNoDataMessage() {
    if (progressElements.noDataMessage) {
        progressElements.noDataMessage.classList.add('hidden');
    }
}

export function clearExerciseCache() {
    exerciseDataCache.clear();
    localFirstCache.clearByPrefix('progress:sessions:').catch((error) => {
        logger.warn('Could not clear cached progress sessions:', error);
    });
}

export function resetProgressView() {
    if (progressChart) {
        progressChart.destroy();
        progressChart = null;
    }

    hideChart();
    hideStats();
    hideNoDataMessage();
    clearExerciseCache();

    if (progressElements.exerciseSelect) {
        progressElements.exerciseSelect.innerHTML = '<option value="">-- Cargando ejercicios... --</option>';
    }
}

async function loadExercisesFromSessions() {
    try {
        const sessions = await loadSessionHistoryForProgress();

        const exerciseCount = new Map();
        const descriptors = new Map();

        sessions.forEach((sessionData) => {
            if (sessionData.ejercicios && Array.isArray(sessionData.ejercicios)) {
                sessionData.ejercicios.forEach((ejercicio) => {
                    const exerciseName = ejercicio.nombreEjercicio || ejercicio.name || ejercicio.ejercicio;
                    if (exerciseName && ejercicio.tipoEjercicio === 'strength') {
                        const executionMode = resolveExerciseExecutionMode(ejercicio);
                        const loadType = normalizeLoadType(resolveExerciseLoadType(ejercicio));
                        const descriptor = buildExerciseDescriptor(exerciseName, executionMode, loadType);
                        const key = descriptor.value;
                        const count = exerciseCount.get(key) || 0;
                        exerciseCount.set(key, count + 1);
                        if (!descriptors.has(key)) {
                            descriptors.set(key, descriptor);
                        }
                    }
                });
            }
        });

        const exercisesWithCount = [];
        exerciseCount.forEach((count, key) => {
            if (count >= 3) {
                const descriptor = descriptors.get(key);
                if (descriptor) {
                    exercisesWithCount.push({
                        ...descriptor,
                        sessionCount: count
                    });
                }
            }
        });

        exercisesWithCount.sort((a, b) => {
            if (b.sessionCount !== a.sessionCount) {
                return b.sessionCount - a.sessionCount;
            }
            return a.label.localeCompare(b.label);
        });

        return {
            names: exercisesWithCount.map((exercise) => ({
                value: exercise.value,
                label: exercise.label,
                name: exercise.name,
                executionMode: exercise.executionMode,
                loadType: exercise.loadType
            })),
            withCounts: exercisesWithCount
        };
    } catch (error) {
        logger.error('Error in fallback exercise loading:', error);
        return { names: [], withCounts: [] };
    }
}
