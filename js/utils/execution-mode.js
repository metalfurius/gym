import { t } from '../i18n.js';

export const DEFAULT_EXECUTION_MODE = 'two_hand';

export const EXECUTION_MODE_VALUES = [
    'one_hand',
    'two_hand',
    'machine',
    'pulley',
    'other'
];

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
    const keyByMode = {
        one_hand: 'execution_mode.one_hand',
        two_hand: 'execution_mode.two_hand',
        machine: 'execution_mode.machine',
        pulley: 'execution_mode.pulley',
        other: 'execution_mode.other'
    };
    const key = keyByMode[mode] || keyByMode.other;
    return t(key);
}
