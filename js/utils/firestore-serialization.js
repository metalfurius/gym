import { resolveExerciseExecutionMode } from './execution-mode.js';
import { resolveExerciseLoadType } from './load-type.js';

function extractIsoDate(value) {
    if (!value) return null;

    if (typeof value === 'string') {
        return value;
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (typeof value.toDate === 'function') {
        const parsed = value.toDate();
        return parsed instanceof Date ? parsed.toISOString() : null;
    }

    return null;
}

function timestampLikeFromIso(isoString) {
    if (!isoString) return null;

    return {
        toDate: () => new Date(isoString)
    };
}

function toNumberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

export function serializeRoutineForCache(routine) {
    return {
        id: routine.id,
        name: routine.name,
        exercises: Array.isArray(routine.exercises) ? routine.exercises : [],
        createdAtIso: extractIsoDate(routine.createdAt),
        updatedAtIso: extractIsoDate(routine.updatedAt)
    };
}

export function deserializeRoutineFromCache(cachedRoutine) {
    return {
        id: cachedRoutine.id,
        name: cachedRoutine.name,
        exercises: Array.isArray(cachedRoutine.exercises) ? cachedRoutine.exercises : [],
        createdAt: timestampLikeFromIso(cachedRoutine.createdAtIso),
        updatedAt: timestampLikeFromIso(cachedRoutine.updatedAtIso)
    };
}

export function serializeRoutinesForCache(routines) {
    return routines.map(serializeRoutineForCache);
}

export function deserializeRoutinesFromCache(cachedRoutines) {
    return cachedRoutines.map(deserializeRoutineFromCache);
}

export function serializeSessionForCache(session) {
    const { fecha, ...rest } = session;
    return {
        ...rest,
        fechaIso: extractIsoDate(fecha)
    };
}

export function deserializeSessionFromCache(cachedSession) {
    const { fechaIso, ...rest } = cachedSession;

    return {
        ...rest,
        fecha: timestampLikeFromIso(fechaIso)
    };
}

export function serializeSessionsForCache(sessions) {
    return sessions.map(serializeSessionForCache);
}

export function deserializeSessionsFromCache(cachedSessions) {
    return cachedSessions.map(deserializeSessionFromCache);
}

export function serializeActivityMap(activityMap) {
    return Object.fromEntries(activityMap.entries());
}

export function deserializeActivityMap(cachedValue) {
    const entries = Object.entries(cachedValue || {});
    return new Map(entries);
}

/**
 * Normalize a Firestore session document (including legacy field variants)
 * into the app's canonical session model.
 * @param {Object} docData
 * @returns {Object}
 */
export function fromDbToSessionModel(docData = {}) {
    const rawExercises = Array.isArray(docData.ejercicios) ? docData.ejercicios : [];

    return {
        schemaVersion: Number.isInteger(docData.schemaVersion) ? docData.schemaVersion : 0,
        fecha: docData.fecha || timestampLikeFromIso(docData.fechaIso),
        routineId: docData.routineId ?? docData.rutinaId ?? null,
        userId: docData.userId ?? null,
        nombreEntrenamiento: docData.nombreEntrenamiento || docData.diaEntrenamiento || docData.dia || '',
        pesoUsuario: toNumberOrNull(docData.pesoUsuario ?? docData.userWeight),
        ejercicios: rawExercises.map((exercise) => {
            const tipoEjercicio = exercise.tipoEjercicio || exercise.type || exercise.tipo || 'strength';
            const mappedExercise = {
                nombreEjercicio: exercise.nombreEjercicio || exercise.name || exercise.ejercicio || '',
                tipoEjercicio,
                objetivoSets: exercise.objetivoSets ?? exercise.targetSets ?? null,
                objetivoReps: exercise.objetivoReps ?? exercise.targetReps ?? null,
                objetivoDuracion: exercise.objetivoDuracion ?? exercise.targetDuration ?? null,
                notasEjercicio: exercise.notasEjercicio ?? exercise.notes ?? '',
                sets: Array.isArray(exercise.sets)
                    ? exercise.sets.map((set) => {
                        const mappedSet = {
                            peso: toNumberOrNull(set.peso ?? set.weight) ?? 0,
                            reps: Math.trunc(toNumberOrNull(set.reps ?? set.repeticiones) ?? 0),
                            tiempoDescanso: set.tiempoDescanso || set.restTime || '00:00'
                        };

                        const totalWeight = toNumberOrNull(set.pesoTotal ?? set.totalWeight ?? set.total_load);
                        if (totalWeight !== null) {
                            mappedSet.pesoTotal = totalWeight;
                        }

                        return mappedSet;
                    })
                    : []
            };

            if (tipoEjercicio === 'strength') {
                mappedExercise.modoEjecucion = resolveExerciseExecutionMode(exercise);
                mappedExercise.tipoCarga = resolveExerciseLoadType(exercise);
            }

            return mappedExercise;
        })
    };
}

/**
 * Convert app session model into Firestore wire format.
 * Backward-compatible Spanish field names are preserved as canonical output.
 * @param {Object} model
 * @param {Object} [options]
 * @param {number} [options.schemaVersion=1]
 * @returns {Object}
 */
export function fromAppToSessionDbModel(model = {}, options = {}) {
    const schemaVersion = Number.isInteger(options.schemaVersion) ? options.schemaVersion : 1;
    const rawExercises = Array.isArray(model.ejercicios) ? model.ejercicios : [];

    return {
        schemaVersion,
        fecha: model.fecha || timestampLikeFromIso(model.fechaIso),
        routineId: model.routineId ?? null,
        userId: model.userId ?? null,
        nombreEntrenamiento: model.nombreEntrenamiento || model.diaEntrenamiento || model.dia || '',
        pesoUsuario: toNumberOrNull(model.pesoUsuario),
        ejercicios: rawExercises.map((exercise) => {
            const tipoEjercicio = exercise.tipoEjercicio || exercise.type || exercise.tipo || 'strength';
            const mappedExercise = {
                nombreEjercicio: exercise.nombreEjercicio || exercise.name || exercise.ejercicio || '',
                tipoEjercicio,
                objetivoSets: exercise.objetivoSets ?? exercise.targetSets ?? null,
                objetivoReps: exercise.objetivoReps ?? exercise.targetReps ?? null,
                objetivoDuracion: exercise.objetivoDuracion ?? exercise.targetDuration ?? null,
                notasEjercicio: exercise.notasEjercicio ?? exercise.notes ?? '',
                sets: Array.isArray(exercise.sets)
                    ? exercise.sets.map((set) => {
                        const mappedSet = {
                            peso: toNumberOrNull(set.peso ?? set.weight) ?? 0,
                            reps: Math.trunc(toNumberOrNull(set.reps ?? set.repeticiones) ?? 0),
                            tiempoDescanso: set.tiempoDescanso || set.restTime || '00:00'
                        };

                        const totalWeight = toNumberOrNull(set.pesoTotal ?? set.totalWeight ?? set.total_load);
                        if (totalWeight !== null) {
                            mappedSet.pesoTotal = totalWeight;
                        }

                        return mappedSet;
                    })
                    : []
            };

            if (tipoEjercicio === 'strength') {
                mappedExercise.modoEjecucion = resolveExerciseExecutionMode(exercise);
                mappedExercise.tipoCarga = resolveExerciseLoadType(exercise);
            }

            return mappedExercise;
        })
    };
}
