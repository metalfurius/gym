import { describe, it, expect } from '@jest/globals';
import {
    DEFAULT_LOAD_TYPE,
    normalizeLoadType,
    resolveExerciseLoadType,
    getLoadTypeLabel
} from '../../js/utils/load-type.js';

describe('load-type utils', () => {
    it('uses external as default load type', () => {
        expect(DEFAULT_LOAD_TYPE).toBe('external');
    });

    it('normalizes supported values and falls back to external', () => {
        expect(normalizeLoadType('external')).toBe('external');
        expect(normalizeLoadType('BODYWEIGHT')).toBe('bodyweight');
        expect(normalizeLoadType('')).toBe('external');
        expect(normalizeLoadType('invalid')).toBe('external');
    });

    it('resolves load type from canonical and fallback keys', () => {
        expect(resolveExerciseLoadType({ tipoCarga: 'bodyweight' })).toBe('bodyweight');
        expect(resolveExerciseLoadType({ loadType: 'external' })).toBe('external');
        expect(resolveExerciseLoadType({ load_type: 'bodyweight' })).toBe('bodyweight');
        expect(resolveExerciseLoadType({ tipo_carga: 'external' })).toBe('external');
        expect(resolveExerciseLoadType({})).toBe('external');
    });

    it('returns Spanish-first labels', () => {
        expect(getLoadTypeLabel('external')).toBe('Carga externa');
        expect(getLoadTypeLabel('bodyweight')).toBe('Peso corporal');
    });
});
