import { t } from '../i18n.js';

export const DEFAULT_LOAD_TYPE = 'external';

export const LOAD_TYPE_VALUES = [
    DEFAULT_LOAD_TYPE,
    'bodyweight'
];

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
    const keyByLoadType = {
        external: 'load_type.external',
        bodyweight: 'load_type.bodyweight'
    };
    const key = keyByLoadType[loadType] || keyByLoadType.external;
    return t(key);
}
