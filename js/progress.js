// progress.js - Funcionalidad para la vista de progreso

import { progressElements } from './ui.js';

// Chart.js instance
let progressChart = null;

// Cache de datos de ejercicios
let exerciseDataCache = new Map();

// Cache para la pestaña de progreso
let progressTabCache = {
    exercisesList: null,
    exercisesWithCount: null,
    lastCacheTime: null,
    isInitialized: false,
    cacheValidityTime: 5 * 60 * 1000 // 5 minutos en milisegundos
};

/**
 * Verifica si el caché de la pestaña de progreso es válido
 */
function isProgressCacheValid() {
    if (!progressTabCache.exercisesList || !progressTabCache.lastCacheTime) {
        return false;
    }
    
    const now = Date.now();
    const cacheAge = now - progressTabCache.lastCacheTime;
    return cacheAge < progressTabCache.cacheValidityTime;
}

/**
 * Invalida el caché de la pestaña de progreso
 */
export function invalidateProgressCache() {
    progressTabCache.exercisesList = null;
    progressTabCache.exercisesWithCount = null;
    progressTabCache.lastCacheTime = null;
    progressTabCache.isInitialized = false;
    exerciseDataCache.clear(); // También limpiar el caché de datos de ejercicios
}

/**
 * Guarda la lista de ejercicios en el caché
 */
function cacheExercisesList(exercises, exercisesWithCount = null) {
    progressTabCache.exercisesList = [...exercises]; // Crear una copia
    progressTabCache.exercisesWithCount = exercisesWithCount ? [...exercisesWithCount] : null;
    progressTabCache.lastCacheTime = Date.now();
    progressTabCache.isInitialized = true;
}

/**
 * Inicializa la vista de progreso
 */
export function initializeProgressView() {
    if (!progressElements.exerciseSelect) {
        console.error('Progress elements not found');
        return;
    }

    // Verificar que Chart.js esté disponible
    if (typeof Chart === 'undefined') {
        setTimeout(initializeProgressView, 100);
        return;
    }

    // Event listeners
    progressElements.exerciseSelect.addEventListener('change', handleExerciseChange);
    progressElements.metricSelect.addEventListener('change', updateChart);
    progressElements.periodSelect.addEventListener('change', updateChart);
}

/**
 * Pobla el selector de ejercicios con una lista dada
 */
function populateExerciseSelector(exercises, fromCache = false, exercisesWithCount = null) {
    if (!progressElements.exerciseSelect) return;

    progressElements.exerciseSelect.innerHTML = '<option value="">-- Selecciona un ejercicio --</option>';
    
    if (exercises.length === 0) {
        progressElements.exerciseSelect.innerHTML = '<option value="">No hay ejercicios en el historial</option>';
        showNoDataMessage();
        return;
    }

    exercises.forEach(exerciseName => {
        const option = document.createElement('option');
        option.value = exerciseName;
        
        // Si tenemos información de conteo, mostrarla
        if (exercisesWithCount) {
            const exerciseInfo = exercisesWithCount.find(ex => ex.name === exerciseName);
            const sessionCount = exerciseInfo ? exerciseInfo.sessionCount : '';
            option.textContent = `${exerciseName} (${sessionCount} sesiones)`;
        } else {
            option.textContent = exerciseName;
        }
        
        progressElements.exerciseSelect.appendChild(option);
    });

    // Si no es desde caché, guardar en caché
    if (!fromCache) {
        cacheExercisesList(exercises, exercisesWithCount);
    } else {
        // Mostrar indicador visual discreto de carga desde caché
        showCacheIndicator();
    }

    hideProgressLoading();
}

/**
 * Muestra un indicador discreto de que se cargó desde caché
 */
function showCacheIndicator() {
    // Crear indicador temporal
    const indicator = document.createElement('div');
    indicator.textContent = '⚡ Cargado desde caché';
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
    
    // Mostrar con animación
    requestAnimationFrame(() => {
        indicator.style.opacity = '1';
    });
    
    // Ocultar después de 2 segundos
    setTimeout(() => {
        indicator.style.opacity = '0';
        setTimeout(() => {
            if (indicator.parentNode) {
                document.body.removeChild(indicator);
            }
        }, 300);
    }, 2000);
}

/**
 * Carga la lista de ejercicios únicos del cache de ejercicios
 */
export async function loadExerciseList() {
    if (!progressElements.exerciseSelect) return;

    // Verificar si ya tenemos datos en caché válidos
    if (isProgressCacheValid() && progressTabCache.exercisesList) {
        populateExerciseSelector(progressTabCache.exercisesList, true, progressTabCache.exercisesWithCount);
        return;
    }

    showProgressLoading();
    
    try {
        // Usar el cache de ejercicios que ya está construido
        const { exerciseCache } = await import('./exercise-cache.js');
        let fullCache = exerciseCache.exportCache();
        
        // Si el cache está vacío, intentar reconstruirlo
        if (Object.keys(fullCache).length === 0) {
            const { getCurrentUser } = await import('./auth.js');
            const { db } = await import('./firebase-config.js');
            const user = getCurrentUser();
            
            if (user && db) {
                await exerciseCache.validateAndRebuildCache(user.uid, db);
                fullCache = exerciseCache.exportCache();
            }
        }
        
        // Crear lista de ejercicios con su número de sesiones
        const exercisesWithCount = [];
        
        // Extraer todos los ejercicios del cache con su conteo de sesiones
        const exercises = Object.keys(fullCache);
        exercises.forEach(exerciseKey => {
            const exercise = fullCache[exerciseKey];
            // Solo incluir ejercicios con al menos 3 sesiones
            if (exercise.originalName && exercise.history && exercise.history.length >= 3) {
                exercisesWithCount.push({
                    name: exercise.originalName,
                    sessionCount: exercise.history.length
                });
            }
        });

        // Ordenar por número de sesiones (mayor a menor) y luego alfabéticamente
        exercisesWithCount.sort((a, b) => {
            if (b.sessionCount !== a.sessionCount) {
                return b.sessionCount - a.sessionCount; // Mayor número de sesiones primero
            }
            return a.name.localeCompare(b.name); // Alfabéticamente si tienen el mismo número
        });

        // Extraer solo los nombres para el selector
        const sortedExercises = exercisesWithCount.map(ex => ex.name);

        if (sortedExercises.length === 0) {
            // Fallback: si el cache no tiene ejercicios, intentar cargar directamente de las sesiones
            const fallbackExercises = await loadExercisesFromSessions();
            populateExerciseSelector(fallbackExercises);
        } else {
            populateExerciseSelector(sortedExercises, false, exercisesWithCount);
        }
        
    } catch (error) {
        console.error('Error loading exercise list:', error);
        progressElements.exerciseSelect.innerHTML = '<option value="">Error cargando ejercicios</option>';
        hideProgressLoading();
    }
}

/**
 * Maneja el cambio de ejercicio seleccionado
 */
async function handleExerciseChange() {
    const selectedExercise = progressElements.exerciseSelect.value;
    
    if (!selectedExercise) {
        hideChart();
        hideStats();
        hideNoDataMessage();
        return;
    }

    await updateChart();
}

/**
 * Actualiza el gráfico con los datos del ejercicio seleccionado
 */
export async function updateChart() {
    const selectedExercise = progressElements.exerciseSelect.value;
    const selectedMetric = progressElements.metricSelect.value;
    const selectedPeriod = progressElements.periodSelect.value;

    if (!selectedExercise) {
        hideChart();
        hideStats();
        return;
    }

    showProgressLoading();

    try {
        // Obtener datos del ejercicio
        const exerciseData = await getExerciseData(selectedExercise, selectedPeriod);
        
        if (!exerciseData || exerciseData.length < 3) {
            hideChart();
            hideStats();
            showNoDataMessage();
            return;
        }

        // Procesar datos según la métrica seleccionada
        const chartData = processChartData(exerciseData, selectedMetric);
        
        // Crear o actualizar el gráfico
        createOrUpdateChart(chartData, selectedExercise, selectedMetric);
        
        // Actualizar estadísticas
        updateProgressStats(exerciseData, selectedMetric);
        
        showChart();
        showStats();
        hideNoDataMessage();
        
    } catch (error) {
        console.error('Error updating chart:', error);
        hideChart();
        hideStats();
        showNoDataMessage();
    } finally {
        hideProgressLoading();
    }
}

/**
 * Obtiene los datos del ejercicio seleccionado desde el cache
 */
async function getExerciseData(exerciseName, period) {
    try {
        // Usar cache si está disponible
        const cacheKey = `${exerciseName}_${period}`;
        if (exerciseDataCache.has(cacheKey)) {
            return exerciseDataCache.get(cacheKey);
        }

        // Obtener datos del cache de ejercicios
        const { exerciseCache } = await import('./exercise-cache.js');
        const fullCache = exerciseCache.exportCache();
        
        // Buscar el ejercicio en el cache
        const exerciseKey = Object.keys(fullCache).find(key => 
            fullCache[key].originalName === exerciseName
        );
        
        if (!exerciseKey || !fullCache[exerciseKey].history) {
            // Fallback: intentar obtener datos directamente de las sesiones
            return await getExerciseDataFromSessions(exerciseName, period);
        }
        
        let exerciseHistory = fullCache[exerciseKey].history;
        
        // Filtrar por período
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
                startDate = new Date('2020-01-01'); // Fecha muy antigua para obtener todo
                break;
        }

        // Filtrar por fecha
        exerciseHistory = exerciseHistory.filter(record => {
            const recordDate = record.date instanceof Date ? record.date : new Date(record.date);
            const isInPeriod = recordDate >= startDate;
            return isInPeriod;
        });

        // Procesar datos para el gráfico
        const processedData = exerciseHistory.map(record => {
            const recordDate = record.date instanceof Date ? record.date : new Date(record.date);
            
            // Calcular métricas
            let maxWeight = 0;
            let totalVolume = 0;
            let maxReps = 0;
            
            if (record.sets && Array.isArray(record.sets)) {
                record.sets.forEach(set => {
                    const weight = parseFloat(set.peso || set.weight || 0);
                    const reps = parseInt(set.reps || set.repeticiones || 0);
                    
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

        // Ordenar por fecha
        processedData.sort((a, b) => a.date - b.date);
        
        // Cachear el resultado
        exerciseDataCache.set(cacheKey, processedData);
        
        return processedData;
        
    } catch (error) {
        console.error('Error getting exercise data:', error);
        return [];
    }
}

/**
 * Función de fallback para obtener datos de ejercicio directamente de las sesiones
 */
async function getExerciseDataFromSessions(exerciseName, period) {
    try {
        const { getCurrentUser } = await import('./auth.js');
        const { db } = await import('./firebase-config.js');
        const { collection, query, orderBy, getDocs, Timestamp } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
        
        const user = getCurrentUser();
        if (!user) return [];
        
        const sessionsRef = collection(db, 'users', user.uid, 'sesiones_entrenamiento');
        const q = query(sessionsRef, orderBy('fecha', 'desc'));
        const querySnapshot = await getDocs(q);
        
        const exerciseData = [];
        
        querySnapshot.forEach(doc => {
            const sessionData = doc.data();
            const sessionDate = sessionData.fecha && sessionData.fecha.toDate ? 
                sessionData.fecha.toDate() : new Date();
            
            if (sessionData.ejercicios && Array.isArray(sessionData.ejercicios)) {
                sessionData.ejercicios.forEach(ejercicio => {
                    const name = ejercicio.nombreEjercicio || ejercicio.name || ejercicio.ejercicio;
                    
                    if (name === exerciseName && ejercicio.tipoEjercicio === 'strength' && ejercicio.sets) {
                        // Calcular métricas
                        let maxWeight = 0;
                        let totalVolume = 0;
                        let maxReps = 0;
                        
                        ejercicio.sets.forEach(set => {
                            const weight = parseFloat(set.peso || set.weight || 0);
                            const reps = parseInt(set.reps || set.repeticiones || 0);
                            
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
        
        // Filtrar por período
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
        
        const filteredData = exerciseData.filter(record => record.date >= startDate);
        
        // Ordenar por fecha
        filteredData.sort((a, b) => a.date - b.date);
        
        return filteredData;
        
    } catch (error) {
        console.error('❌ Error in fallback exercise data loading:', error);
        return [];
    }
}

/**
 * Procesa los datos para el gráfico según la métrica seleccionada
 */
function processChartData(exerciseData, metric) {
    if (!exerciseData || exerciseData.length < 3) return { labels: [], data: [] };

    // Agrupar datos por fecha
    const dataByDate = new Map();
    
    exerciseData.forEach(entry => {
        const dateKey = entry.date.toISOString().split('T')[0]; // YYYY-MM-DD format
        
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

    // Procesar según la métrica
    const chartData = [];
    const labels = [];

    Array.from(dataByDate.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([dateKey, dayData]) => {
            labels.push(formatDateForChart(dayData.date));
            
            let value;
            switch (metric) {
                case 'weight':
                    value = Math.max(...dayData.weights); // Peso máximo del día
                    break;
                case 'reps':
                    value = Math.max(...dayData.reps); // Repeticiones máximas del día
                    break;
                case 'volume':
                    value = dayData.volumes.reduce((sum, vol) => sum + vol, 0); // Volumen total del día
                    break;
                default:
                    value = Math.max(...dayData.weights);
            }
            
            chartData.push(value);
        });

    return { labels, data: chartData };
}

/**
 * Crea o actualiza el gráfico
 */
function createOrUpdateChart(chartData, exerciseName, metric) {
    // Verificar que Chart.js esté disponible con reintentos
    if (typeof Chart === 'undefined') {
        // Límite de reintentos
        if (!createOrUpdateChart.retryCount) {
            createOrUpdateChart.retryCount = 0;
        }
        
        if (createOrUpdateChart.retryCount < 10) {
            createOrUpdateChart.retryCount++;
            setTimeout(() => createOrUpdateChart(chartData, exerciseName, metric), 200);
            return;
        } else {
            progressElements.chart.parentElement.innerHTML = '<p class="error-message">Error: No se pudo cargar el sistema de gráficos</p>';
            return;
        }
    }

    // Resetear contador de reintentos
    createOrUpdateChart.retryCount = 0;

    const ctx = progressElements.chart.getContext('2d');
    
    // Destruir gráfico anterior si existe
    if (progressChart) {
        progressChart.destroy();
    }

    const metricLabels = {
        weight: 'Peso (kg)',
        reps: 'Repeticiones',
        volume: 'Volumen (kg)'
    };

    const config = {
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
    };

    progressChart = new Chart(ctx, config);
}

/**
 * Actualiza las estadísticas de progreso
 */
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
    
    // Contar sesiones únicas por fecha (cada fecha representa una sesión)
    const uniqueDates = new Set(exerciseData.map(entry => entry.date.toDateString()));
    const sessionCount = uniqueDates.size;

    // Actualizar elementos de estadísticas
    const units = {
        weight: 'kg',
        reps: 'reps',
        volume: 'kg'
    };

    progressElements.bestRecord.textContent = `${bestRecord.toFixed(1)} ${units[metric]}`;
    progressElements.sessionCount.textContent = sessionCount;
    
    // Calcular tendencia
    let trendClass = 'trend-stable';
    let progressText = '';
    
    if (totalProgress > 0) {
        trendClass = 'trend-up';
        progressText = `+${totalProgress.toFixed(1)} ${units[metric]}`;
    } else if (totalProgress < 0) {
        trendClass = 'trend-down';
        progressText = `${totalProgress.toFixed(1)} ${units[metric]}`;
    } else {
        progressText = '0';
    }
    
    progressElements.totalProgress.textContent = progressText;
    progressElements.trendIndicator.className = trendClass;
    progressElements.trendIndicator.textContent = trendClass === 'trend-up' ? 'Mejorando' : 
                                                  trendClass === 'trend-down' ? 'Descendiendo' : 'Estable';
}

/**
 * Formatea la fecha para mostrar en el gráfico
 */
function formatDateForChart(date) {
    return date.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short'
    });
}

// Funciones de utilidad para mostrar/ocultar elementos
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

/**
 * Limpia la cache de datos de ejercicios
 */
export function clearExerciseCache() {
    exerciseDataCache.clear();
}

/**
 * Limpia la vista de progreso
 */
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

/**
 * Función de fallback para cargar ejercicios directamente de las sesiones
 */
async function loadExercisesFromSessions() {
    try {
        const { getCurrentUser } = await import('./auth.js');
        const { db } = await import('./firebase-config.js');
        const { collection, query, orderBy, getDocs } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
        
        const user = getCurrentUser();
        if (!user) return [];

        
        const sessionsRef = collection(db, 'users', user.uid, 'sesiones_entrenamiento');
        const q = query(sessionsRef, orderBy('fecha', 'desc'));
        const querySnapshot = await getDocs(q);
        
        const exerciseCount = new Map(); // Para contar cuántas veces aparece cada ejercicio
        
        querySnapshot.forEach(doc => {
            const sessionData = doc.data();
            
            if (sessionData.ejercicios && Array.isArray(sessionData.ejercicios)) {
                sessionData.ejercicios.forEach(ejercicio => {
                    const exerciseName = ejercicio.nombreEjercicio || ejercicio.name || ejercicio.ejercicio;
                    if (exerciseName && ejercicio.tipoEjercicio === 'strength') {
                        const count = exerciseCount.get(exerciseName) || 0;
                        exerciseCount.set(exerciseName, count + 1);
                    }
                });
            }
        });
        
        // Solo devolver ejercicios con al menos 3 sesiones
        const validExercises = [];
        exerciseCount.forEach((count, exerciseName) => {
            if (count >= 3) {
                validExercises.push(exerciseName);
            }
        });
        
        return validExercises.sort();
        
    } catch (error) {
        console.error('❌ Error in fallback exercise loading:', error);
        return [];
    }
}