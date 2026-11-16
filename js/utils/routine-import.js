import {
    collection,
    doc,
    Timestamp,
    writeBatch,
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

// Keep requests comfortably below Firestore's write-count and request-size limits.
const MAX_BATCH_ROUTINES = 100;
const MAX_BATCH_ESTIMATED_BYTES = 4 * 1024 * 1024;
const ISO_DATE_PATTERN =
    /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

export class RoutineImportError extends Error {
    constructor(code, details = {}) {
        super(code);
        this.name = 'RoutineImportError';
        this.code = code;
        this.details = details;
    }
}

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isValidDate(value) {
    if (typeof value !== 'string') return false;
    const match = ISO_DATE_PATTERN.exec(value);
    if (!match || !Number.isFinite(Date.parse(value))) return false;

    const calendarDate = new Date(`${match[1]}T00:00:00.000Z`);
    return Number.isFinite(calendarDate.getTime()) && calendarDate.toISOString().slice(0, 10) === match[1];
}

/** Parse the clipboard export without modifying any data or writing to Firestore. */
export function parseRoutineImport(text) {
    if (typeof text !== 'string' || !text.trim()) {
        throw new RoutineImportError('empty');
    }

    let payload;
    try {
        payload = JSON.parse(text);
    } catch (_error) {
        throw new RoutineImportError('json');
    }

    if (!isObject(payload) || !Array.isArray(payload.routines)) {
        throw new RoutineImportError('format');
    }
    if (payload.routines.length === 0) {
        throw new RoutineImportError('no_routines');
    }

    payload.routines.forEach((routine, routineIndex) => {
        const details = { routine: routineIndex + 1 };
        if (
            !isObject(routine) ||
            typeof routine.name !== 'string' ||
            !routine.name.trim() ||
            !Array.isArray(routine.exercises)
        ) {
            throw new RoutineImportError('routine', details);
        }

        routine.exercises.forEach((exercise, exerciseIndex) => {
            if (!isObject(exercise) || typeof exercise.name !== 'string' || !exercise.name.trim()) {
                throw new RoutineImportError('exercise', { ...details, exercise: exerciseIndex + 1 });
            }
        });

        for (const field of ['createdAt', 'updatedAt']) {
            if (routine[field] !== null && routine[field] !== undefined && !isValidDate(routine[field])) {
                throw new RoutineImportError('date', { ...details, field });
            }
        }
    });

    return payload;
}

/** Allocate stable new document IDs once, so a retry cannot duplicate a failed batch. */
export function prepareRoutineImport(db, userId, payload) {
    const routinesRef = collection(db, 'users', userId, 'routines');
    const entries = payload.routines.map(routine => {
        const now = Timestamp.now();
        return {
            source: routine,
            ref: doc(routinesRef),
            data: {
                name: routine.name,
                exercises: routine.exercises,
                createdAt: routine.createdAt ? Timestamp.fromDate(new Date(routine.createdAt)) : now,
                updatedAt: routine.updatedAt ? Timestamp.fromDate(new Date(routine.updatedAt)) : now,
            },
        };
    });

    return { userId, exportDate: payload.exportDate, entries, nextIndex: 0, reflectedCount: 0 };
}

export async function commitNextRoutineImportBatch(db, operation) {
    const batch = writeBatch(db);
    const start = operation.nextIndex;
    let end = start;
    let estimatedBytes = 0;

    while (end < operation.entries.length && end - start < MAX_BATCH_ROUTINES) {
        const entry = operation.entries[end];
        const entryBytes = new Blob([JSON.stringify({ name: entry.data.name, exercises: entry.data.exercises })]).size;
        if (end > start && estimatedBytes + entryBytes > MAX_BATCH_ESTIMATED_BYTES) break;
        batch.set(entry.ref, entry.data);
        estimatedBytes += entryBytes;
        end++;
    }

    if (end === start) return 0;
    await batch.commit();
    operation.nextIndex = end;
    return end - start;
}

/** Return a valid export containing only routines that have not been confirmed. */
export function pendingRoutineImportJson(operation) {
    const routines = operation.entries.slice(operation.nextIndex).map(entry => entry.source);
    return JSON.stringify(
        {
            exportDate: operation.exportDate || new Date().toISOString(),
            totalRoutines: routines.length,
            routines,
        },
        null,
        2
    );
}
