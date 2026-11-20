// progress.js - Progress view and charting logic

import { getCurrentUser } from './utils/auth-state.js';
import { captureAccountScope, isAccountScopeCurrent } from './utils/account-scope.js';
import { calendarNow, localDateKey } from './utils/calendar-clock.js';
import { registerSessionMutationInvalidator } from './utils/session-mutations.js';
import { progressElements } from './ui.js';
import { logger } from './utils/logger.js';
import { localFirstCache } from './utils/local-first-cache.js';
import { firebaseUsageTracker } from './utils/firebase-usage-tracker.js';
import { serializeSessionsForCache, deserializeSessionsFromCache } from './utils/firestore-serialization.js';
import {
    DEFAULT_EXECUTION_MODE,
    normalizeExecutionMode,
    resolveExerciseExecutionMode,
    getExecutionModeLabel,
} from './utils/execution-mode.js';
import { DEFAULT_LOAD_TYPE, normalizeLoadType, resolveExerciseLoadType, getLoadTypeLabel } from './utils/load-type.js';
import { parseDecimalInput, parseIntegerInput } from './utils/numeric-input.js';
import { t, getLocale } from './i18n.js';

let progressChart = null;
let progressOwnerId = null;
let chartRequestId = 0;
let listRequestId = 0;
let dataGeneration = 0;
let uiRequestId = 0;
let sessionCompleteness = { complete: false };
const exerciseDataCache = new Map();

const PROGRESS_SESSIONS_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_PROGRESS_SESSIONS = 300;

const progressTabCache = {
    exercisesList: null,
    exercisesWithCount: null,
    lastCacheTime: null,
    isInitialized: false,
    cacheValidityTime: 5 * 60 * 1000,
};

export function normalizeExerciseName(name) {
    if (!name) return '';
    return name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, '_');
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

function buildExerciseLabel(exerciseName, executionMode = DEFAULT_EXECUTION_MODE, loadType = DEFAULT_LOAD_TYPE) {
    const mode = normalizeExecutionMode(executionMode);
    const normalizedLoadType = normalizeLoadType(loadType);
    const variants = [];

    if (mode !== DEFAULT_EXECUTION_MODE) {
        variants.push(getExecutionModeLabel(mode));
    }

    if (normalizedLoadType !== DEFAULT_LOAD_TYPE) {
        variants.push(getLoadTypeLabel(normalizedLoadType));
    }

    return variants.length > 0 ? `${exerciseName} (${variants.join(', ')})` : exerciseName;
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
            label: buildExerciseLabel(fallbackName, DEFAULT_EXECUTION_MODE, DEFAULT_LOAD_TYPE),
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
        label,
    };
}

function buildExerciseDescriptor(exerciseName, executionMode = DEFAULT_EXECUTION_MODE, loadType = DEFAULT_LOAD_TYPE) {
    const mode = normalizeExecutionMode(executionMode);
    const normalizedLoadType = normalizeLoadType(loadType);
    return parseExerciseSelectionValue(buildExerciseSelectionValue(exerciseName, mode, normalizedLoadType));
}

function resolveSetWeightForMetrics(set = {}, loadType = DEFAULT_LOAD_TYPE, fallbackBodyweight = null) {
    const normalizedLoadType = normalizeLoadType(loadType);

    if (normalizedLoadType === 'bodyweight') {
        const totalWeightResult = parseDecimalInput(set.pesoTotal ?? set.totalWeight, {
            allowSign: true,
            maxFractionDigits: null,
            roundTo: null,
        });
        if (totalWeightResult.isValid && totalWeightResult.value !== null) {
            return totalWeightResult.value;
        }

        const externalLoadResult = parseDecimalInput(set.peso ?? set.weight, {
            allowSign: true,
            maxFractionDigits: null,
            roundTo: null,
        });
        const bodyweightResult = parseDecimalInput(fallbackBodyweight, {
            maxFractionDigits: null,
            roundTo: null,
        });
        if (
            externalLoadResult.isValid &&
            externalLoadResult.value !== null &&
            bodyweightResult.isValid &&
            bodyweightResult.value !== null &&
            bodyweightResult.value > 0
        ) {
            return externalLoadResult.value + bodyweightResult.value;
        }
    }

    const parsedWeight = parseDecimalInput(set.peso ?? set.weight, {
        allowSign: true,
        maxFractionDigits: null,
        roundTo: null,
    });
    return parsedWeight.isValid && parsedWeight.value !== null ? parsedWeight.value : 0;
}

function isProgressCacheValid() {
    if (!progressTabCache.exercisesList || !progressTabCache.lastCacheTime) {
        return false;
    }

    const cacheAge = Date.now() - progressTabCache.lastCacheTime;
    return cacheAge < progressTabCache.cacheValidityTime;
}

function isProgressOnline() {
    return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function resetProgressMemory() {
    ++dataGeneration; ++chartRequestId; ++listRequestId; ++uiRequestId;
    progressTabCache.exercisesList = null; progressTabCache.exercisesWithCount = null;
    progressTabCache.lastCacheTime = null; progressTabCache.isInitialized = false;
    sessionCompleteness = { complete: false }; exerciseDataCache.clear();
}

function ensureProgressOwner() {
    const userId = getCurrentUser()?.uid || null;
    if (progressOwnerId !== userId) {
        resetProgressMemory(); progressOwnerId = userId;
        hideChart(); hideStats(); hideNoDataMessage();
        if (progressChart) { progressChart.destroy(); progressChart = null; }
    }
    return userId;
}

export function invalidateProgressCache(userId = getCurrentUser()?.uid, { durable = true } = {}) {
    if (!progressOwnerId || progressOwnerId === userId) resetProgressMemory();
    if (!durable || !userId) return Promise.resolve();
    return localFirstCache.remove(`progress:sessions:${userId}`);
}

function showDataCompleteness(metadata) {
    const element = document.getElementById('progress-data-status');
    if (element) {
        element.textContent = metadata.complete ? '' : t('progress.limited_data', { limit: MAX_PROGRESS_SESSIONS });
        element.classList.toggle('hidden', metadata.complete === true);
    }
    const allOption = progressElements.periodSelect?.querySelector('option[value="all"]');
    if (allOption) allOption.textContent = t(metadata.complete ? 'progress.period_all' : 'progress.period_available');
}

function staleRead() { const error = new Error('Superseded progress request'); error.code = 'sync/stale'; return error; }

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

    const previousSelection = progressElements.exerciseSelect.value;
    progressElements.exerciseSelect.innerHTML = `<option value="">${t('progress.select_placeholder')}</option>`;

    if (exercises.length === 0) {
        progressElements.exerciseSelect.innerHTML = `<option value="">${t('progress.no_history')}</option>`;
        hideChart(); hideStats();
        showNoDataMessage();
        return;
    }

    exercises.forEach(exerciseItem => {
        const descriptor =
            typeof exerciseItem === 'string'
                ? buildExerciseDescriptor(exerciseItem, DEFAULT_EXECUTION_MODE, DEFAULT_LOAD_TYPE)
                : exerciseItem;

        if (!descriptor) {
            return;
        }

        const option = document.createElement('option');
        option.value = descriptor.value;

        if (exercisesWithCount) {
            const info = exercisesWithCount.find(exercise => exercise.value === descriptor.value);
            option.textContent = `${descriptor.label} (${t('progress.sessions_suffix', { count: info ? info.sessionCount : 0 })})`;
        } else {
            option.textContent = descriptor.label;
        }

        progressElements.exerciseSelect.appendChild(option);
    });

    if ([...progressElements.exerciseSelect.options].some(option => option.value === previousSelection)) {
        progressElements.exerciseSelect.value = previousSelection;
    }
    if (!fromCache) {
        cacheExercisesList(exercises, exercisesWithCount);
    } else {
        showCacheIndicator();
    }

}

function showCacheIndicator() {
    const indicator = document.createElement('div');
    indicator.textContent = t('progress.cache_loaded');
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
    const userId = ensureProgressOwner();
    const request = ++listRequestId;
    const uiRequest = ++uiRequestId;
    const scope = captureAccountScope(userId);
    const generation = dataGeneration;
    const isCurrent = () => request === listRequestId && uiRequest === uiRequestId && generation === dataGeneration
        && isAccountScopeCurrent(scope, getCurrentUser()?.uid);
    if (!userId) { resetProgressView(); return; }
    if (isProgressCacheValid() && progressTabCache.exercisesWithCount) {
        populateExerciseSelector(progressTabCache.exercisesList, true, progressTabCache.exercisesWithCount);
        showDataCompleteness(sessionCompleteness); hideProgressLoading(); return;
    }
    showProgressLoading();
    try {
        const history = await loadSessionHistoryForProgress(scope, isCurrent);
        if (!isCurrent()) return;
        const result = await loadExercisesFromSessionHistory(history.sessions);
        if (!isCurrent()) return;
        populateExerciseSelector(result.names, false, result.withCounts);
        showDataCompleteness(history);
    } catch (error) {
        if (!isCurrent()) return;
        logger.error('Error loading exercise list:', error);
        progressElements.exerciseSelect.innerHTML = `<option value="">${t('progress.loading_error')}</option>`;
    } finally {
        if (isCurrent()) hideProgressLoading();
    }
}

export async function handleExerciseChange() { await updateChart(); }

export async function updateChart() {
    const userId = ensureProgressOwner();
    const request = ++chartRequestId;
    const uiRequest = ++uiRequestId;
    const generation = dataGeneration;
    const scope = captureAccountScope(userId);
    const selectedValue = progressElements.exerciseSelect?.value;
    const selectedMetric = progressElements.metricSelect?.value;
    const selectedPeriod = progressElements.periodSelect?.value;
    const selectedExercise = parseExerciseSelectionValue(selectedValue);
    const now = calendarNow();
    const isCurrent = () => request === chartRequestId && uiRequest === uiRequestId && generation === dataGeneration
        && isAccountScopeCurrent(scope, getCurrentUser()?.uid)
        && progressElements.exerciseSelect?.value === selectedValue
        && progressElements.metricSelect?.value === selectedMetric
        && progressElements.periodSelect?.value === selectedPeriod;
    if (!selectedValue || !selectedExercise || !userId) {
        hideChart(); hideStats(); hideNoDataMessage(); hideProgressLoading(); return;
    }
    showProgressLoading();
    try {
        const result = await getExerciseData(selectedExercise, selectedPeriod, now, scope, isCurrent);
        if (!isCurrent()) return;
        const exerciseData = result.data;
        showDataCompleteness(result);
        if (!exerciseData || exerciseData.length < 3) {
            hideChart(); hideStats(); showNoDataMessage(); return;
        }
        const chartData = processChartData(exerciseData, selectedMetric);
        createOrUpdateChart(chartData, selectedExercise.label, selectedMetric, isCurrent);
        updateProgressStats(exerciseData, selectedMetric);
        renderAccessibleTable(chartData, selectedExercise.label, selectedMetric);
        showChart(); showStats(); hideNoDataMessage();
    } catch (error) {
        if (!isCurrent()) return;
        logger.error('Error updating chart:', error);
        hideChart(); hideStats(); showNoDataMessage();
    } finally {
        if (isCurrent()) hideProgressLoading();
    }
}

async function getExerciseData(selection, period, now, scope, isCurrent) {
    const key = `${scope.userId}:${selection.value}:${period}:${localDateKey(now)}`;
    const cached = exerciseDataCache.get(key);
    if (cached && isAccountScopeCurrent(cached.scope, getCurrentUser()?.uid)
        && Date.now() - cached.fetchedAt <= PROGRESS_SESSIONS_CACHE_TTL_MS) return cached;
    const history = await loadSessionHistoryForProgress(scope, isCurrent);
    if (!isCurrent()) throw staleRead();
    const data = await getExerciseDataFromSessionHistory(selection, period, history.sessions, now);
    if (!isCurrent()) throw staleRead();
    const result = { data, complete: history.complete, fetchedAt: Date.now(), scope };
    exerciseDataCache.set(key, result);
    return result;
}

async function loadSessionHistoryForProgress(scope, isCurrent) {
    const cacheKey = `progress:sessions:${scope.userId}`;
    const cached = await localFirstCache.getEntry(cacheKey);
    if (!isCurrent()) throw staleRead();
    const cachedArray = Array.isArray(cached?.value) ? cached.value : cached?.value?.sessions;
    const fromCache = { sessions: deserializeSessionsFromCache(cachedArray || []).slice(0, MAX_PROGRESS_SESSIONS),
        complete: isProgressOnline() && cached?.metadata?.complete === true && localFirstCache.isFresh(cached, PROGRESS_SESSIONS_CACHE_TTL_MS) };
    if (Array.isArray(cachedArray) && (localFirstCache.isFresh(cached, PROGRESS_SESSIONS_CACHE_TTL_MS) || !isProgressOnline())) {
        sessionCompleteness = fromCache; return fromCache;
    }
    if (!isProgressOnline()) { sessionCompleteness = { ...fromCache, complete: false }; return sessionCompleteness; }
    const { db } = await import('./firebase-config.js');
    const { collection, query, orderBy, limit, getDocs } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
    if (!isCurrent()) throw staleRead();
    const snapshot = await getDocs(query(collection(db, 'users', scope.userId, 'sesiones_entrenamiento'),
        orderBy('fecha', 'desc'), limit(MAX_PROGRESS_SESSIONS + 1)));
    if (!isCurrent()) throw staleRead();
    firebaseUsageTracker.trackRead(snapshot.docs.length || 1, 'progress.sessionHistoryFallback', { limit: MAX_PROGRESS_SESSIONS + 1 });
    const seen = new Set();
    const sessions = snapshot.docs.slice(0, MAX_PROGRESS_SESSIONS).map(item => ({ ...item.data(), id: item.id }))
        .filter(item => { if (seen.has(item.id)) return false; seen.add(item.id); return true; });
    const complete = snapshot.docs.length <= MAX_PROGRESS_SESSIONS && snapshot.metadata?.fromCache !== true
        && snapshot.metadata?.hasPendingWrites !== true;
    await localFirstCache.set(cacheKey, serializeSessionsForCache(sessions), {
        metadata: { source: 'firestore', ownerId: scope.userId, limit: MAX_PROGRESS_SESSIONS, complete }, ifCurrent: isCurrent,
    });
    if (!isCurrent()) throw staleRead();
    sessionCompleteness = { sessions, complete };
    return sessionCompleteness;
}

async function getExerciseDataFromSessionHistory(exerciseSelection, period, sessions, now) {
    try {
        logger.info(`Analytical history: Loading ${exerciseSelection.label} data from bounded sessions`);

        const exerciseData = [];
        const normalizedSelectedName = normalizeExerciseName(exerciseSelection.name);
        const selectedMode = normalizeExecutionMode(exerciseSelection.executionMode);
        const selectedLoadType = normalizeLoadType(exerciseSelection.loadType);
        let lastKnownBodyweight = null;

        const seenSessionIds = new Set();
        const distinctSessions = sessions.filter((session, index) => {
            const id = session.id || session.sessionId || `legacy-${index}`;
            if (seenSessionIds.has(id)) return false;
            seenSessionIds.add(id); return true;
        });
        const sortedSessions = [...distinctSessions].sort((a, b) => {
            const dateA = a.fecha && a.fecha.toDate ? a.fecha.toDate() : new Date(0);
            const dateB = b.fecha && b.fecha.toDate ? b.fecha.toDate() : new Date(0);
            return dateA - dateB;
        });

        sortedSessions.forEach((sessionData, sessionIndex) => {
            const sessionDate = sessionData.fecha?.toDate?.();
            if (!(sessionDate instanceof Date) || Number.isNaN(sessionDate.getTime())) return;
            const sessionBodyweightResult = parseDecimalInput(sessionData.pesoUsuario ?? sessionData.userWeight, {
                maxFractionDigits: null,
                roundTo: null,
            });
            if (
                sessionBodyweightResult.isValid &&
                sessionBodyweightResult.value !== null &&
                sessionBodyweightResult.value > 0
            ) {
                lastKnownBodyweight = sessionBodyweightResult.value;
            }

            if (sessionData.ejercicios && Array.isArray(sessionData.ejercicios)) {
                sessionData.ejercicios.forEach(ejercicio => {
                    const name = ejercicio.nombreEjercicio || ejercicio.name || ejercicio.ejercicio;
                    const normalizedName = normalizeExerciseName(name);

                    const executionMode = resolveExerciseExecutionMode(ejercicio);
                    const loadType = normalizeLoadType(resolveExerciseLoadType(ejercicio));

                    if (
                        normalizedName === normalizedSelectedName &&
                        ejercicio.tipoEjercicio === 'strength' &&
                        executionMode === selectedMode &&
                        loadType === selectedLoadType &&
                        ejercicio.sets
                    ) {
                        let maxWeight = Number.NEGATIVE_INFINITY;
                        let totalVolume = 0;
                        let maxReps = 0;

                        ejercicio.sets.forEach(set => {
                            const weight = resolveSetWeightForMetrics(set, loadType, lastKnownBodyweight);
                            const repsResult = parseIntegerInput(set.reps ?? set.repeticiones, {
                                min: 0,
                                max: 1000,
                            });
                            const reps = repsResult.isValid ? (repsResult.value ?? 0) : 0;

                            if (weight > maxWeight) maxWeight = weight;
                            if (reps > maxReps) maxReps = reps;
                            totalVolume += weight * reps;
                        });

                        exerciseData.push({
                            date: sessionDate,
                            sessionId: sessionData.id || sessionData.sessionId || `legacy-${sessionIndex}`,
                            weight: maxWeight === Number.NEGATIVE_INFINITY ? 0 : maxWeight,
                            volume: totalVolume,
                            reps: maxReps,
                            sets: ejercicio.sets,
                        });
                    }
                });
            }
        });

        let startDate = new Date(now);

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
                startDate = new Date(0);
                break;
        }

        const filteredData = exerciseData.filter(record => record.date >= startDate);
        filteredData.sort((a, b) => a.date - b.date);

        const bySession = new Map();
        for (const record of filteredData) {
            const current = bySession.get(record.sessionId);
            if (!current) bySession.set(record.sessionId, record);
            else { current.weight = Math.max(current.weight, record.weight); current.reps = Math.max(current.reps, record.reps); current.volume += record.volume; }
        }
        return [...bySession.values()];
    } catch (error) {
        logger.error('Error in analytical exercise history loading:', error);
        return [];
    }
}

function processChartData(exerciseData, metric) {
    if (!exerciseData || exerciseData.length < 3) return { labels: [], data: [] };

    const dataByDate = new Map();

    exerciseData.forEach(entry => {
        const dateKey = localDateKey(entry.date);

        if (!dataByDate.has(dateKey)) {
            dataByDate.set(dateKey, {
                date: entry.date,
                weights: [],
                reps: [],
                volumes: [],
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

function createOrUpdateChart(chartData, exerciseName, metric, isCurrent = () => true, attempt = 0) {
    if (!isCurrent()) return;
    if (typeof Chart === 'undefined') {
        if (!createOrUpdateChart.retryCount) {
            createOrUpdateChart.retryCount = 0;
        }

        if (attempt < 10) {
            createOrUpdateChart.retryCount = attempt + 1;
            setTimeout(() => createOrUpdateChart(chartData, exerciseName, metric, isCurrent, attempt + 1), 200);
            return;
        }

        if (progressElements.chart?.parentElement) {
            progressElements.chart.parentElement.innerHTML = `<p class="error-message">${t('progress.chart_error')}</p>`;
        }
        return;
    }

    createOrUpdateChart.retryCount = 0;

    const ctx = progressElements.chart.getContext('2d');
    if (progressChart) {
        progressChart.destroy();
    }

    const metricLabels = {
        weight: `${t('progress.metric_weight')} (${t('progress.unit_weight')})`,
        reps: t('progress.metric_reps'),
        volume: `${t('progress.metric_volume')} (${t('progress.unit_volume')})`,
    };
    const metricLabel = metricLabels[metric] || t('progress.value');
    const chartTitle = t('progress.chart_title', { exercise: exerciseName, metric: metricLabel });
    const accessibleData = chartData.labels.map((label, index) => `${label}: ${chartData.data[index]}`).join('; ');

    progressElements.chart.setAttribute('role', 'img');
    progressElements.chart.setAttribute('aria-label', `${chartTitle}. ${accessibleData}`);

    progressChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: [
                {
                    label: metricLabel,
                    data: chartData.data,
                    borderColor: 'rgb(102, 126, 234)',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    tension: 0.4,
                    pointBackgroundColor: 'rgb(102, 126, 234)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    fill: true,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: chartTitle,
                    font: {
                        size: 16,
                        weight: 'bold',
                    },
                    color: 'var(--text-color)',
                },
                legend: {
                    display: false,
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)',
                    },
                    ticks: {
                        color: 'var(--text-secondary-color)',
                    },
                },
                x: {
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)',
                    },
                    ticks: {
                        color: 'var(--text-secondary-color)',
                        maxTicksLimit: 10,
                    },
                },
            },
            interaction: {
                intersect: false,
                mode: 'index',
            },
        },
    });
}

function updateProgressStats(exerciseData, metric) {
    if (!exerciseData || exerciseData.length < 3) return;

    const values = exerciseData.map(entry => {
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

    const sessionCount = new Set(exerciseData.map(entry => entry.sessionId)).size;

    const units = {
        weight: t('progress.unit_weight'),
        reps: t('progress.unit_reps'),
        volume: t('progress.unit_volume'),
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
    progressElements.trendIndicator.textContent =
        trendClass === 'trend-up'
            ? t('progress.trend_up')
            : trendClass === 'trend-down'
                ? t('progress.trend_down')
                : t('progress.trend_stable');
}

function formatDateForChart(date) {
    return date.toLocaleDateString(getLocale(), {
        day: '2-digit',
        month: 'short',
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

function renderAccessibleTable(chartData, exerciseName, metric) {
    const container = progressElements.chartContainer;
    if (!container) return;
    let table = document.getElementById('progress-data-table');
    if (!table) { table = document.createElement('table'); table.id = 'progress-data-table'; container.appendChild(table); }
    table.replaceChildren();
    const caption = table.createCaption(); caption.textContent = t('progress.chart_title', { exercise: exerciseName, metric: t(`progress.metric_${metric}`) });
    const header = table.createTHead().insertRow();
    for (const label of [t('progress.table_date'), t(`progress.metric_${metric}`)]) {
        const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = label; header.appendChild(cell);
    }
    const body = table.createTBody();
    chartData.labels.forEach((label, index) => { const row = body.insertRow(); row.insertCell().textContent = label; row.insertCell().textContent = `${chartData.data[index]}`; });
}

function hideChart() {
    document.getElementById('progress-data-table')?.remove();
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
    return invalidateProgressCache();
}

export function resetProgressView() {
    if (progressChart) {
        progressChart.destroy();
        progressChart = null;
    }

    hideChart();
    hideStats();
    hideNoDataMessage();
    resetProgressMemory();
    hideProgressLoading();

    if (progressElements.exerciseSelect) {
        progressElements.exerciseSelect.innerHTML = `<option value="">${t('progress.loading_exercises')}</option>`;
    }
}

registerSessionMutationInvalidator(({ userId }) => invalidateProgressCache(userId, { durable: false }));

async function loadExercisesFromSessionHistory(sessions) {
    try {

        const exerciseCount = new Map();
        const descriptors = new Map();

        const seenSessions = new Set();
        sessions.forEach((sessionData, sessionIndex) => {
            const sessionId = sessionData.id || sessionData.sessionId || `legacy-${sessionIndex}`;
            if (seenSessions.has(sessionId)) return;
            seenSessions.add(sessionId);
            const seenExercises = new Set();
            if (sessionData.ejercicios && Array.isArray(sessionData.ejercicios)) {
                sessionData.ejercicios.forEach(ejercicio => {
                    const exerciseName = ejercicio.nombreEjercicio || ejercicio.name || ejercicio.ejercicio;
                    if (
                        exerciseName &&
                        ejercicio.tipoEjercicio === 'strength' &&
                        Array.isArray(ejercicio.sets) &&
                        ejercicio.sets.length > 0
                    ) {
                        const executionMode = resolveExerciseExecutionMode(ejercicio);
                        const loadType = normalizeLoadType(resolveExerciseLoadType(ejercicio));
                        const descriptor = buildExerciseDescriptor(exerciseName, executionMode, loadType);
                        const key = descriptor.value;
                        if (seenExercises.has(key)) return;
                        seenExercises.add(key);
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
                        sessionCount: count,
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
            names: exercisesWithCount.map(exercise => ({
                value: exercise.value,
                label: exercise.label,
                name: exercise.name,
                executionMode: exercise.executionMode,
                loadType: exercise.loadType,
            })),
            withCounts: exercisesWithCount,
        };
    } catch (error) {
        logger.error('Error in analytical exercise history selector loading:', error);
        return { names: [], withCounts: [] };
    }
}
