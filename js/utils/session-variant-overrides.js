import { normalizeExecutionMode } from './execution-mode.js';
import { normalizeLoadType } from './load-type.js';

const STORAGE_PREFIX = 'gym-tracker:session-variant-overrides:';
const KEY_SEPARATOR = '::';

function normalizeExerciseIdentity(exerciseName = '') {
    return String(exerciseName || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function sanitizeOverrideEntry(entry = {}) {
    return {
        executionMode: normalizeExecutionMode(entry.executionMode),
        loadType: normalizeLoadType(entry.loadType)
    };
}

function getSafeLocalStorage() {
    if (typeof localStorage === 'undefined') {
        return null;
    }

    return localStorage;
}

function writeSessionVariantOverrides(userId, overridesMap) {
    const storage = getSafeLocalStorage();
    const storageKey = buildSessionVariantOverridesStorageKey(userId);

    if (!storage || !storageKey) {
        return;
    }

    try {
        storage.setItem(storageKey, JSON.stringify(overridesMap));
    } catch {
        // Ignore storage write failures (e.g. quota/privacy mode) to avoid blocking session flows.
    }
}

export function buildSessionVariantOverridesStorageKey(userId) {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) {
        return null;
    }

    return `${STORAGE_PREFIX}${normalizedUserId}`;
}

export function buildSessionVariantOverrideMapKey(routineId, exerciseName) {
    const normalizedRoutineId = String(routineId || '').trim();
    const normalizedExerciseName = normalizeExerciseIdentity(exerciseName);

    if (!normalizedRoutineId || !normalizedExerciseName) {
        return null;
    }

    return `${normalizedRoutineId}${KEY_SEPARATOR}${normalizedExerciseName}`;
}

export function readSessionVariantOverrides(userId) {
    const storage = getSafeLocalStorage();
    const storageKey = buildSessionVariantOverridesStorageKey(userId);

    if (!storage || !storageKey) {
        return {};
    }

    let raw = null;
    try {
        raw = storage.getItem(storageKey);
    } catch {
        return {};
    }

    if (!raw) {
        return {};
    }

    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed
            : {};
    } catch {
        return {};
    }
}

export function getSessionVariantOverride(userId, routineId, exerciseName) {
    const mapKey = buildSessionVariantOverrideMapKey(routineId, exerciseName);
    if (!mapKey) {
        return null;
    }

    const overrides = readSessionVariantOverrides(userId);
    if (!overrides[mapKey]) {
        return null;
    }

    return sanitizeOverrideEntry(overrides[mapKey]);
}

export function saveSessionVariantOverride(userId, routineId, exerciseName, override = {}) {
    return saveSessionVariantOverrides(userId, [{
        routineId,
        exerciseName,
        executionMode: override.executionMode,
        loadType: override.loadType
    }]);
}

export function saveSessionVariantOverrides(userId, overrides = []) {
    if (!Array.isArray(overrides) || overrides.length === 0) {
        return readSessionVariantOverrides(userId);
    }

    const existing = readSessionVariantOverrides(userId);

    overrides.forEach((override) => {
        const mapKey = buildSessionVariantOverrideMapKey(
            override?.routineId,
            override?.exerciseName
        );

        if (!mapKey) {
            return;
        }

        existing[mapKey] = sanitizeOverrideEntry({
            executionMode: override.executionMode,
            loadType: override.loadType
        });
    });

    writeSessionVariantOverrides(userId, existing);
    return existing;
}

export function resolveSessionVariantSelection({
    inProgressExercise = null,
    localOverride = null,
    routineExercise = null
} = {}) {
    const executionMode = normalizeExecutionMode(
        inProgressExercise?.modoEjecucion
        ?? inProgressExercise?.executionMode
        ?? localOverride?.executionMode
        ?? routineExercise?.executionMode
        ?? routineExercise?.modoEjecucion
    );

    const loadType = normalizeLoadType(
        inProgressExercise?.tipoCarga
        ?? inProgressExercise?.loadType
        ?? localOverride?.loadType
        ?? routineExercise?.loadType
        ?? routineExercise?.tipoCarga
    );

    return {
        executionMode,
        loadType
    };
}
