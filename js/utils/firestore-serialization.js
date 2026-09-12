import { resolveExerciseExecutionMode } from './execution-mode.js';
import { resolveExerciseLoadType } from './load-type.js';
import { parseDecimalInput, parseIntegerInput } from './numeric-input.js';

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
        toDate: () => new Date(isoString),
    };
}

function toNumberOrNull(value) {
    const result = parseDecimalInput(value, {
        allowSign: true,
        maxFractionDigits: null,
        roundTo: null,
    });
    return result.isValid && result.value !== null ? result.value : null;
}

function normalizeRepsFromDb(value) {
    const result = parseIntegerInput(value, { min: 0, max: 1000 });
    if (result.isValid) {
        return result.value ?? 0;
    }

    // Preserve malformed legacy values for inspection instead of silently
    // truncating them into a different repetition count.
    return value === null || value === undefined || value === '' ? 0 : value;
}

function normalizeOptionalBodyweightForWire(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const result = parseDecimalInput(value, {
        min: 20,
        max: 300,
        maxFractionDigits: null,
        roundTo: 1,
    });
    if (!result.isValid || result.value === null) {
        throw new Error('Invalid user bodyweight value');
    }

    return result.value;
}

function normalizeSetForWire(set = {}, allowSignedLoad = false) {
    const rawWeight = set.peso ?? set.weight;
    const weightResult = parseDecimalInput(rawWeight, {
        allowSign: allowSignedLoad,
        min: allowSignedLoad ? -500 : 0,
        max: 500,
        roundTo: 1,
    });
    if (!weightResult.isValid) {
        throw new Error('Invalid set weight value');
    }

    const rawReps = set.reps ?? set.repeticiones;
    const repsResult = parseIntegerInput(rawReps, { min: 0, max: 1000 });
    if (!repsResult.isValid) {
        throw new Error('Invalid set repetition value');
    }

    const mappedSet = {
        peso: weightResult.value ?? 0,
        reps: repsResult.value ?? 0,
        tiempoDescanso: set.tiempoDescanso || set.restTime || '00:00',
    };

    const totalWeight = toNumberOrNull(set.pesoTotal ?? set.totalWeight ?? set.total_load);
    if (totalWeight !== null) {
        mappedSet.pesoTotal = totalWeight;
    }

    return mappedSet;
}

export function serializeRoutineForCache(routine) {
    return {
        id: routine.id,
        name: routine.name,
        exercises: Array.isArray(routine.exercises) ? routine.exercises : [],
        createdAtIso: extractIsoDate(routine.createdAt),
        updatedAtIso: extractIsoDate(routine.updatedAt),
    };
}

export function deserializeRoutineFromCache(cachedRoutine) {
    return {
        id: cachedRoutine.id,
        name: cachedRoutine.name,
        exercises: Array.isArray(cachedRoutine.exercises) ? cachedRoutine.exercises : [],
        createdAt: timestampLikeFromIso(cachedRoutine.createdAtIso),
        updatedAt: timestampLikeFromIso(cachedRoutine.updatedAtIso),
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
        fechaIso: extractIsoDate(fecha),
    };
}

export function deserializeSessionFromCache(cachedSession) {
    const { fechaIso, ...rest } = cachedSession;

    return {
        ...rest,
        fecha: timestampLikeFromIso(fechaIso),
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
        ejercicios: rawExercises.map(exercise => {
            const tipoEjercicio = exercise.tipoEjercicio || exercise.type || exercise.tipo || 'strength';
            const mappedExercise = {
                nombreEjercicio: exercise.nombreEjercicio || exercise.name || exercise.ejercicio || '',
                tipoEjercicio,
                objetivoSets: exercise.objetivoSets ?? exercise.targetSets ?? null,
                objetivoReps: exercise.objetivoReps ?? exercise.targetReps ?? null,
                objetivoDuracion: exercise.objetivoDuracion ?? exercise.targetDuration ?? null,
                notasEjercicio: exercise.notasEjercicio ?? exercise.notes ?? '',
                sets: Array.isArray(exercise.sets)
                    ? exercise.sets.map(set => {
                        const mappedSet = {
                            peso: toNumberOrNull(set.peso ?? set.weight) ?? 0,
                            reps: normalizeRepsFromDb(set.reps ?? set.repeticiones),
                            tiempoDescanso: set.tiempoDescanso || set.restTime || '00:00',
                        };

                        const totalWeight = toNumberOrNull(set.pesoTotal ?? set.totalWeight ?? set.total_load);
                        if (totalWeight !== null) {
                            mappedSet.pesoTotal = totalWeight;
                        }

                        return mappedSet;
                    })
                    : [],
            };

            if (tipoEjercicio === 'strength') {
                mappedExercise.modoEjecucion = resolveExerciseExecutionMode(exercise);
                mappedExercise.tipoCarga = resolveExerciseLoadType(exercise);
            }

            return mappedExercise;
        }),
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
        pesoUsuario: normalizeOptionalBodyweightForWire(model.pesoUsuario),
        ejercicios: rawExercises.map(exercise => {
            const tipoEjercicio = exercise.tipoEjercicio || exercise.type || exercise.tipo || 'strength';
            const loadType = tipoEjercicio === 'strength' ? resolveExerciseLoadType(exercise) : 'external';
            const mappedExercise = {
                nombreEjercicio: exercise.nombreEjercicio || exercise.name || exercise.ejercicio || '',
                tipoEjercicio,
                objetivoSets: exercise.objetivoSets ?? exercise.targetSets ?? null,
                objetivoReps: exercise.objetivoReps ?? exercise.targetReps ?? null,
                objetivoDuracion: exercise.objetivoDuracion ?? exercise.targetDuration ?? null,
                notasEjercicio: exercise.notasEjercicio ?? exercise.notes ?? '',
                sets: Array.isArray(exercise.sets)
                    ? exercise.sets.map(set => normalizeSetForWire(set, loadType === 'bodyweight'))
                    : [],
            };

            if (tipoEjercicio === 'strength') {
                mappedExercise.modoEjecucion = resolveExerciseExecutionMode(exercise);
                mappedExercise.tipoCarga = resolveExerciseLoadType(exercise);
            }

            return mappedExercise;
        }),
    };
}
