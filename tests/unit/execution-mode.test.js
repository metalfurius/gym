import { describe, it, expect, beforeEach } from '@jest/globals';
import {
    DEFAULT_EXECUTION_MODE,
    normalizeExecutionMode,
    resolveExerciseExecutionMode,
    getExecutionModeLabel
} from '../../js/utils/execution-mode.js';
import { setLanguage } from '../../js/i18n.js';

describe('execution-mode utils', () => {
    beforeEach(() => {
        setLanguage('es', { persist: false, apply: false });
    });

    it('uses two_hand as default mode', () => {
        expect(DEFAULT_EXECUTION_MODE).toBe('two_hand');
    });

    it('normalizes supported values and falls back to default for unknown values', () => {
        expect(normalizeExecutionMode('one_hand')).toBe('one_hand');
        expect(normalizeExecutionMode('MACHINE')).toBe('machine');
        expect(normalizeExecutionMode('')).toBe(DEFAULT_EXECUTION_MODE);
        expect(normalizeExecutionMode('invalid-mode')).toBe(DEFAULT_EXECUTION_MODE);
    });

    it('resolves mode from canonical and fallback exercise keys', () => {
        expect(resolveExerciseExecutionMode({ modoEjecucion: 'two_hand' })).toBe('two_hand');
        expect(resolveExerciseExecutionMode({ executionMode: 'pulley' })).toBe('pulley');
        expect(resolveExerciseExecutionMode({ execution_mode: 'machine' })).toBe('machine');
        expect(resolveExerciseExecutionMode({})).toBe(DEFAULT_EXECUTION_MODE);
    });

    it('returns Spanish-first labels', () => {
        expect(getExecutionModeLabel('one_hand')).toBe('Una mano');
        expect(getExecutionModeLabel('two_hand')).toBe('Dos manos');
        expect(getExecutionModeLabel('machine')).toBe('Máquina');
        expect(getExecutionModeLabel('pulley')).toBe('Polea');
        expect(getExecutionModeLabel('other')).toBe('Otro');
    });

    it('returns English labels after language switch', () => {
        setLanguage('en', { persist: false, apply: false });
        expect(getExecutionModeLabel('one_hand')).toBe('One hand');
        expect(getExecutionModeLabel('two_hand')).toBe('Two hands');
        expect(getExecutionModeLabel('machine')).toBe('Machine');
        expect(getExecutionModeLabel('pulley')).toBe('Pulley');
        expect(getExecutionModeLabel('other')).toBe('Other');
    });
});
