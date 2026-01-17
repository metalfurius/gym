// Exercise Cache Manager
// Manages local caching of exercise history for better UX and reduced Firebase calls

import { logger } from './utils/logger.js';

export class ExerciseCacheManager {
    constructor() {
        this.cacheKey = 'gym-tracker-exercise-cache';
        this.backupKey = 'gym-tracker-exercise-backup';
        this.maxCacheAge = 7 * 24 * 60 * 60 * 1000; // 7 días en milisegundos
        // NOTE: Exercise history is unlimited by count but subject to 7-day age cleanup via cleanOldEntries()
    }

    /**
     * Obtiene el cache completo del localStorage
     * @returns {Object} Cache de ejercicios
     */
    getFullCache() {
        try {
            const cached = localStorage.getItem(this.cacheKey);
            return cached ? JSON.parse(cached) : {};
        } catch (error) {
            logger.error('Error leyendo cache de ejercicios:', error);
            return {};
        }
    }

    /**
     * Guarda el cache completo en localStorage
     * @param {Object} cache - Cache a guardar
     */
    saveFullCache(cache) {
        try {
            localStorage.setItem(this.cacheKey, JSON.stringify(cache));
        } catch (error) {
            logger.error('Error guardando cache de ejercicios:', error);
        }
    }

    /**
     * Obtiene el historial de un ejercicio específico
     * @param {string} exerciseName - Nombre del ejercicio
     * @returns {Array} Array con el historial del ejercicio (más reciente primero)
     */
    getExerciseHistory(exerciseName) {
        const cache = this.getFullCache();
        const normalizedName = this.normalizeExerciseName(exerciseName);
        
        if (!cache[normalizedName]) {
            return [];
        }

        const history = cache[normalizedName].history || [];
        return history;
    }    /**
     * Obtiene los datos más recientes de un ejercicio
     * @param {string} exerciseName - Nombre del ejercicio
     * @returns {Object|null} Datos más recientes o null si no hay historial
     */
    getLastExerciseData(exerciseName) {
        const history = this.getExerciseHistory(exerciseName);
        const result = history.length > 0 ? history[0] : null;
        return result;
    }    /**
     * Añade datos de ejercicio al cache
     * @param {string} exerciseName - Nombre del ejercicio
     * @param {Array} sets - Array de sets con peso y reps
     * @param {Date} sessionDate - Fecha de la sesión
     */
    addExerciseData(exerciseName, sets, sessionDate = new Date()) {
        if (!exerciseName || !sets || sets.length === 0) {
            return;
        }

        const cache = this.getFullCache();
        const normalizedName = this.normalizeExerciseName(exerciseName);
        
        if (!cache[normalizedName]) {
            cache[normalizedName] = {
                originalName: exerciseName,
                history: []
            };
        }

        // Crear entrada de historial
        const historyEntry = {
            date: sessionDate.toISOString(),
            timestamp: sessionDate.getTime(),
            sets: sets.map(set => ({
                peso: parseFloat(set.peso) || 0,
                reps: parseInt(set.reps) || 0
            }))
        };

        // Añadir al principio del array (más reciente primero)
        cache[normalizedName].history.unshift(historyEntry);

        // No limitar el historial - necesitamos todos los datos para gráficos de progreso. El historial se limpará automáticamente por edad usando cleanOldEntries()

        this.saveFullCache(cache);
    }

    /**
     * Obtiene sugerencias para peso/reps basadas en el historial
     * @param {string} exerciseName - Nombre del ejercicio
     * @returns {Object} Sugerencias de peso y reps
     */
    getExerciseSuggestions(exerciseName) {
        const lastData = this.getLastExerciseData(exerciseName);
        
        if (!lastData) {
            return {
                hasHistory: false,
                suggestions: null,
                lastSessionDate: null
            };
        }

        // Encontrar el peso máximo y reps promedio de la última sesión
        const lastSets = lastData.sets;
        const maxWeight = Math.max(...lastSets.map(set => set.peso));
        const avgReps = Math.round(lastSets.reduce((sum, set) => sum + set.reps, 0) / lastSets.length);
        
        const suggestions = {
            hasHistory: true,
            suggestions: {
                peso: maxWeight,
                reps: avgReps,
                lastSets: lastSets
            },
            lastSessionDate: new Date(lastData.date),
            daysSinceLastSession: Math.floor((Date.now() - lastData.timestamp) / (1000 * 60 * 60 * 24))
        };
        
        return suggestions;
    }

    /**
     * Procesa una sesión completa y actualiza el cache
     * @param {Object} sessionData - Datos de la sesión guardada
     */
    processCompletedSession(sessionData) {
        if (!sessionData.ejercicios) {
            logger.warn('⚠️ Sesión sin ejercicios, saltando');
            return;
        }

        const sessionDate = sessionData.fecha && sessionData.fecha.toDate ? 
            sessionData.fecha.toDate() : new Date();

        sessionData.ejercicios.forEach((ejercicio) => {
            if (ejercicio.tipoEjercicio === 'strength' && ejercicio.sets && ejercicio.sets.length > 0) {
                this.addExerciseData(ejercicio.nombreEjercicio, ejercicio.sets, sessionDate);
            }
        });
    }

    /**
     * Limpia el cache por completo (para forzar reconstrucción)
     */
    clearCache() {
        try {
            localStorage.removeItem(this.cacheKey);
            logger.info('🧹 Exercise cache cleared - will rebuild on next use');
        } catch (error) {
            logger.error('Error clearing cache:', error);
        }
    }

    /**
     * Sincroniza el cache con Firebase (para backup)
     * @param {string} userId - ID del usuario
     * @param {Object} db - Instancia de Firestore
     */
    async syncWithFirebase(userId, db) {
        if (!userId || !db) return;

        try {
            const cache = this.getFullCache();
            const backupData = {
                cache: cache,
                lastSync: new Date().toISOString(),
                version: '1.0'
            };

            // Guardar backup en Firestore
            const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
            const backupDocRef = doc(db, "users", userId, "app_data", "exercise_cache");
            await setDoc(backupDocRef, backupData, { merge: true });
        } catch (error) {
            logger.error('Error sincronizando cache con Firebase:', error);
        }
    }

    /**
     * Restaura el cache desde Firebase
     * @param {string} userId - ID del usuario
     * @param {Object} db - Instancia de Firestore
     */
    async restoreFromFirebase(userId, db) {
        if (!userId || !db) return false;

        try {
            const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
            const backupDocRef = doc(db, "users", userId, "app_data", "exercise_cache");
            const backupDoc = await getDoc(backupDocRef);

            if (backupDoc.exists()) {
                const backupData = backupDoc.data();
                if (backupData.cache) {
                    this.saveFullCache(backupData.cache);
                    logger.info('Cache de ejercicios restaurado desde Firebase');
                    return true;
                }
            }
        } catch (error) {
            logger.error('Error restaurando cache desde Firebase:', error);
        }

        return false;
    }

    /**
     * Construye el cache inicial desde el historial de sesiones existente
     * @param {string} userId - ID del usuario
     * @param {Object} db - Instancia de Firestore
     */
    async buildCacheFromHistory(userId, db) {
        if (!userId || !db) return;

        try {
            const { collection, query, orderBy, limit, getDocs } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
            
            // Get last 200 sessions to build comprehensive cache (reduced from 500 for better performance)
            const sessionsRef = collection(db, "users", userId, "sesiones_entrenamiento");
            const q = query(sessionsRef, orderBy("fecha", "desc"), limit(200));
            const querySnapshot = await getDocs(q);
            // Procesar sesiones en orden cronológico inverso (más antigua primero)
            const sessions = querySnapshot.docs.reverse();
            
            sessions.forEach((docSnap) => {
                const sessionData = { id: docSnap.id, ...docSnap.data() };
                this.processCompletedSession(sessionData);
            });
        } catch (error) {
            logger.error('Error construyendo cache desde historial:', error);
        }
    }

    /**
     * Normaliza el nombre del ejercicio para usar como clave
     * @param {string} exerciseName - Nombre original del ejercicio
     * @returns {string} Nombre normalizado
     */
    normalizeExerciseName(exerciseName) {
        return exerciseName
            .toLowerCase()
            .trim()
            .replace(/[^\w\s]/g, '') // Quitar signos de puntuación
            .replace(/\s+/g, '_'); // Reemplazar espacios por guiones bajos
    }

    /**
     * Limpia entradas antiguas del cache
     */
    cleanOldEntries() {
        const cache = this.getFullCache();
        const cutoffTime = Date.now() - this.maxCacheAge;
        let cleaned = false;

        Object.keys(cache).forEach(exerciseKey => {
            const exercise = cache[exerciseKey];
            if (exercise.history) {
                const originalLength = exercise.history.length;
                exercise.history = exercise.history.filter(entry => entry.timestamp > cutoffTime);
                
                if (exercise.history.length === 0) {
                    delete cache[exerciseKey];
                    cleaned = true;
                } else if (exercise.history.length !== originalLength) {
                    cleaned = true;
                }
            }
        });

        if (cleaned) {
            this.saveFullCache(cache);
            logger.info('Cache de ejercicios limpiado');
        }
    }

    /**
     * Obtiene estadísticas del cache
     * @returns {Object} Estadísticas del cache
     */
    getCacheStats() {
        const cache = this.getFullCache();
        const exerciseNames = Object.keys(cache);
        
        let totalEntries = 0;
        let oldestEntry = Date.now();
        let newestEntry = 0;

        exerciseNames.forEach(key => {
            const exercise = cache[key];
            if (exercise.history) {
                totalEntries += exercise.history.length;
                exercise.history.forEach(entry => {
                    if (entry.timestamp < oldestEntry) oldestEntry = entry.timestamp;
                    if (entry.timestamp > newestEntry) newestEntry = entry.timestamp;
                });
            }
        });

        return {
            exerciseCount: exerciseNames.length,
            totalEntries,
            oldestEntry: oldestEntry < Date.now() ? new Date(oldestEntry) : null,
            newestEntry: newestEntry > 0 ? new Date(newestEntry) : null,
            cacheSize: JSON.stringify(cache).length
        };
    }

    /**
     * Exporta el cache para debugging
     * @returns {Object} Cache completo
     */
    exportCache() {
        return this.getFullCache();
    }

    /**
     * Verifica la integridad del cache comparando con Firebase
     * @param {string} userId - ID del usuario
     * @param {Object} db - Instancia de Firestore
     * @returns {Promise<boolean>} True si el cache necesita ser reconstruido
     */
    async verifyCacheIntegrity(userId, db) {
        if (!userId || !db) return false;

        try {
            const { collection, query, orderBy, limit, getDocs } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
            
            // Obtener las últimas 10 sesiones para verificar
            const sessionsRef = collection(db, "users", userId, "sesiones_entrenamiento");
            const q = query(sessionsRef, orderBy("fecha", "desc"), limit(10));
            const querySnapshot = await getDocs(q);
            
            const recentSessions = querySnapshot.docs;
            const cacheStats = this.getCacheStats();
            
            // Si no hay sesiones, el cache debería estar vacío
            if (recentSessions.length === 0) {
                return cacheStats.exerciseCount > 0;
            }
            
            // Verificar si hay sesiones recientes con ejercicios de fuerza que no están en el cache
            let foundMissingExercises = false;
            
            for (const docSnap of recentSessions) {
                const sessionData = { id: docSnap.id, ...docSnap.data() };
                
                if (sessionData.ejercicios) {
                    for (const ejercicio of sessionData.ejercicios) {
                        if (ejercicio.tipoEjercicio === 'strength' && ejercicio.sets && ejercicio.sets.length > 0) {
                            const history = this.getExerciseHistory(ejercicio.nombreEjercicio);
                            
                            // Si encontramos un ejercicio sin historial, o con historial muy limitado
                            // comparado con las sesiones disponibles, necesitamos reconstruir
                            if (history.length === 0) {
                                foundMissingExercises = true;
                                break;
                            }
                        }
                    }
                    if (foundMissingExercises) break;
                }
            }
            
            return foundMissingExercises;
        } catch (error) {
            logger.error('Error verificando integridad del cache:', error);
            return false;
        }
    }

    /**
     * Valida y reconstruye automáticamente el cache si es necesario
     * @param {string} userId - ID del usuario
     * @param {Object} db - Instancia de Firestore
     * @returns {Promise<boolean>} True si se realizó reconstrucción
     */
    async validateAndRebuildCache(userId, db) {
        if (!userId || !db) return false;

        try {
            const needsRebuild = await this.verifyCacheIntegrity(userId, db);
            
            if (needsRebuild) {
                await this.buildCacheFromHistory(userId, db);
                return true;
            }
            
            return false;
        } catch (error) {
            logger.error('Error validando cache:', error);
            return false;
        }
    }
}

// Crear instancia singleton
export const exerciseCache = new ExerciseCacheManager();
