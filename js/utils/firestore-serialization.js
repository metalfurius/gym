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
