export const DEFAULT_EXECUTION_MODE = 'other';

export const EXECUTION_MODE_VALUES = [
    'one_hand',
    'two_hand',
    'machine',
    'pulley',
    DEFAULT_EXECUTION_MODE
];

export const EXECUTION_MODE_LABELS = {
    one_hand: 'Una mano',
    two_hand: 'Dos manos',
    machine: 'Maquina',
    pulley: 'Polea',
    other: 'Otro'
};

export function normalizeExecutionMode(value) {
    const normalized = (value || '').toString().trim().toLowerCase();
    return EXECUTION_MODE_VALUES.includes(normalized) ? normalized : DEFAULT_EXECUTION_MODE;
}

export function resolveExerciseExecutionMode(exercise = {}) {
    return normalizeExecutionMode(
        exercise.modoEjecucion
        ?? exercise.executionMode
        ?? exercise.execution_mode
        ?? exercise.modo
    );
}

export function getExecutionModeLabel(value) {
    const mode = normalizeExecutionMode(value);
    return EXECUTION_MODE_LABELS[mode] || EXECUTION_MODE_LABELS.other;
}
