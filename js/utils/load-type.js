export const DEFAULT_LOAD_TYPE = 'external';

export const LOAD_TYPE_VALUES = [
    DEFAULT_LOAD_TYPE,
    'bodyweight'
];

export const LOAD_TYPE_LABELS = {
    external: 'Carga externa',
    bodyweight: 'Peso corporal'
};

export function normalizeLoadType(value) {
    const normalized = (value || '').toString().trim().toLowerCase();
    return LOAD_TYPE_VALUES.includes(normalized) ? normalized : DEFAULT_LOAD_TYPE;
}

export function resolveExerciseLoadType(exercise = {}) {
    return normalizeLoadType(
        exercise.tipoCarga
        ?? exercise.loadType
        ?? exercise.load_type
        ?? exercise.tipo_carga
    );
}

export function getLoadTypeLabel(value) {
    const loadType = normalizeLoadType(value);
    return LOAD_TYPE_LABELS[loadType] || LOAD_TYPE_LABELS.external;
}
