// progress.js - Progress view and charting logic

import { progressElements } from './ui.js';
import { logger } from './utils/logger.js';
import { localFirstCache } from './utils/local-first-cache.js';
import { firebaseUsageTracker } from './utils/firebase-usage-tracker.js';
import { serializeSessionsForCache, deserializeSessionsFromCache } from './utils/firestore-serialization.js';

let progressChart = null;
let exerciseDataCache = new Map();

const PROGRESS_SESSIONS_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_PROGRESS_SESSIONS = 300;

let progressTabCache = {
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

    exercises.forEach((exerciseName) => {
        const option = document.createElement('option');
        option.value = exerciseName;

        if (exercisesWithCount) {
            const info = exercisesWithCount.find((exercise) => exercise.name === exerciseName);
            option.textContent = `${exerciseName} (${info ? info.sessionCount : 0} sesiones)`;
        } else {
            option.textContent = exerciseName;
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
            if (exercise.originalName && exercise.history && exercise.history.length >= 3) {
                exercisesWithCount.push({
                    name: exercise.originalName,
                    sessionCount: exercise.history.length
                });
            }
        });

        exercisesWithCount.sort((a, b) => {
            if (b.sessionCount !== a.sessionCount) {
                return b.sessionCount - a.sessionCount;
            }
            return a.name.localeCompare(b.name);
        });

        const sortedExercises = exercisesWithCount.map((exercise) => exercise.name);

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
    const selectedExercise = progressElements.exerciseSelect?.value;
    const selectedMetric = progressElements.metricSelect?.value;
    const selectedPeriod = progressElements.periodSelect?.value;

    if (!selectedExercise) {
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
        createOrUpdateChart(chartData, selectedExercise, selectedMetric);
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

async function getExerciseData(exerciseName, period) {
    try {
        const cacheKey = `${exerciseName}_${period}`;
        if (exerciseDataCache.has(cacheKey)) {
            return exerciseDataCache.get(cacheKey);
        }

        const { exerciseCache } = await import('./exercise-cache.js');
        const fullCache = exerciseCache.exportCache();

        const normalizedSelectedName = normalizeExerciseName(exerciseName);
        const exerciseKey = Object.keys(fullCache).find((key) => {
            const normalized = normalizeExerciseName(fullCache[key].originalName);
            return normalized === normalizedSelectedName;
        });

        if (!exerciseKey || !fullCache[exerciseKey].history) {
            return await getExerciseDataFromSessions(exerciseName, period);
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
            let maxWeight = 0;
            let totalVolume = 0;
            let maxReps = 0;

            if (record.sets && Array.isArray(record.sets)) {
                record.sets.forEach((set) => {
                    const weight = parseFloat(set.peso || set.weight || 0);
                    const reps = parseInt(set.reps || set.repeticiones || 0, 10);

                    if (weight > maxWeight) maxWeight = weight;
                    if (reps > maxReps) maxReps = reps;
                    totalVolume += weight * reps;
                });
            }

            return {
                date: recordDate,
                weight: maxWeight,
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

async function getExerciseDataFromSessions(exerciseName, period) {
    try {
        logger.info(`Fallback: Loading ${exerciseName} data directly from sessions`);
        const sessions = await loadSessionHistoryForProgress();

        const exerciseData = [];
        const normalizedSelected = normalizeExerciseName(exerciseName);

        sessions.forEach((sessionData) => {
            const sessionDate = sessionData.fecha && sessionData.fecha.toDate
                ? sessionData.fecha.toDate()
                : new Date();

            if (sessionData.ejercicios && Array.isArray(sessionData.ejercicios)) {
                sessionData.ejercicios.forEach((ejercicio) => {
                    const name = ejercicio.nombreEjercicio || ejercicio.name || ejercicio.ejercicio;
                    const normalizedName = normalizeExerciseName(name);

                    if (normalizedName === normalizedSelected && ejercicio.tipoEjercicio === 'strength' && ejercicio.sets) {
                        let maxWeight = 0;
                        let totalVolume = 0;
                        let maxReps = 0;

                        ejercicio.sets.forEach((set) => {
                            const weight = parseFloat(set.peso || set.weight || 0);
                            const reps = parseInt(set.reps || set.repeticiones || 0, 10);

                            if (weight > maxWeight) maxWeight = weight;
                            if (reps > maxReps) maxReps = reps;
                            totalVolume += weight * reps;
                        });

                        exerciseData.push({
                            date: sessionDate,
                            weight: maxWeight,
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
        const originalNames = new Map();

        sessions.forEach((sessionData) => {
            if (sessionData.ejercicios && Array.isArray(sessionData.ejercicios)) {
                sessionData.ejercicios.forEach((ejercicio) => {
                    const exerciseName = ejercicio.nombreEjercicio || ejercicio.name || ejercicio.ejercicio;
                    if (exerciseName && ejercicio.tipoEjercicio === 'strength') {
                        const normalizedName = normalizeExerciseName(exerciseName);
                        const count = exerciseCount.get(normalizedName) || 0;
                        exerciseCount.set(normalizedName, count + 1);

                        if (!originalNames.has(normalizedName)) {
                            originalNames.set(normalizedName, exerciseName);
                        }
                    }
                });
            }
        });

        const exercisesWithCount = [];
        exerciseCount.forEach((count, normalizedName) => {
            if (count >= 3) {
                const originalName = originalNames.get(normalizedName) || normalizedName;
                exercisesWithCount.push({ name: originalName, sessionCount: count });
            }
        });

        exercisesWithCount.sort((a, b) => {
            if (b.sessionCount !== a.sessionCount) {
                return b.sessionCount - a.sessionCount;
            }
            return a.name.localeCompare(b.name);
        });

        return {
            names: exercisesWithCount.map((exercise) => exercise.name),
            withCounts: exercisesWithCount
        };
    } catch (error) {
        logger.error('Error in fallback exercise loading:', error);
        return { names: [], withCounts: [] };
    }
}
