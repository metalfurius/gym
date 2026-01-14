import { describe, it, expect } from '@jest/globals';
import {
    LIMITS,
    validateNumber,
    validateWeight,
    validateReps,
    validateSeries,
    validateUserWeight,
    validateCalories,
    validateText,
    validateOptionalText
} from '../../js/utils/validation.js';

/**
 * Tests for validation utility module
 * Provides input validation functions for gym tracker data
 */
describe('Validation utilities', () => {
    describe('LIMITS constants', () => {
        it('should have defined weight limits', () => {
            expect(LIMITS.WEIGHT).toEqual({ min: 0, max: 500 });
        });

        it('should have defined reps limits', () => {
            expect(LIMITS.REPS).toEqual({ min: 0, max: 1000 });
        });

        it('should have defined series limits', () => {
            expect(LIMITS.SERIES).toEqual({ min: 1, max: 20 });
        });

        it('should have defined user weight limits', () => {
            expect(LIMITS.USER_WEIGHT).toEqual({ min: 20, max: 300 });
        });

        it('should have defined calories limits', () => {
            expect(LIMITS.CALORIES).toEqual({ min: 0, max: 10000 });
        });
    });

    describe('validateNumber', () => {
        it('should validate a number within range', () => {
            const result = validateNumber(50, 0, 100, 'Test');
            expect(result.isValid).toBe(true);
            expect(result.value).toBe(50);
            expect(result.error).toBeNull();
        });

        it('should reject a number below minimum', () => {
            const result = validateNumber(-5, 0, 100, 'Test');
            expect(result.isValid).toBe(false);
            expect(result.value).toBeNull();
            expect(result.error).toContain('no puede ser menor que 0');
        });

        it('should reject a number above maximum', () => {
            const result = validateNumber(150, 0, 100, 'Test');
            expect(result.isValid).toBe(false);
            expect(result.value).toBeNull();
            expect(result.error).toContain('no puede ser mayor que 100');
        });

        it('should accept empty/null values', () => {
            expect(validateNumber(null, 0, 100).isValid).toBe(true);
            expect(validateNumber(undefined, 0, 100).isValid).toBe(true);
            expect(validateNumber('', 0, 100).isValid).toBe(true);
        });

        it('should normalize comma to decimal point', () => {
            const result = validateNumber('12,5', 0, 100, 'Test');
            expect(result.isValid).toBe(true);
            expect(result.value).toBe(12.5);
        });

        it('should reject non-numeric values', () => {
            const result = validateNumber('abc', 0, 100, 'Test');
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('debe ser un número válido');
        });

        it('should use custom field name in error messages', () => {
            const result = validateNumber(150, 0, 100, 'Mi Campo');
            expect(result.error).toContain('Mi Campo');
        });

        it('should validate boundary values', () => {
            expect(validateNumber(0, 0, 100).isValid).toBe(true);
            expect(validateNumber(100, 0, 100).isValid).toBe(true);
        });
    });

    describe('validateWeight', () => {
        it('should validate valid weights', () => {
            expect(validateWeight(60).isValid).toBe(true);
            expect(validateWeight(100.5).isValid).toBe(true);
            expect(validateWeight(0).isValid).toBe(true);
        });

        it('should reject weights above 500 kg', () => {
            const result = validateWeight(501);
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('El peso');
        });

        it('should reject negative weights', () => {
            const result = validateWeight(-5);
            expect(result.isValid).toBe(false);
        });

        it('should handle comma as decimal separator', () => {
            const result = validateWeight('75,5');
            expect(result.isValid).toBe(true);
            expect(result.value).toBe(75.5);
        });
    });

    describe('validateReps', () => {
        it('should validate valid reps', () => {
            expect(validateReps(10).isValid).toBe(true);
            expect(validateReps(0).isValid).toBe(true);
            expect(validateReps(100).isValid).toBe(true);
        });

        it('should round reps to integers', () => {
            const result = validateReps(10.7);
            expect(result.isValid).toBe(true);
            expect(result.value).toBe(11);
        });

        it('should reject reps above 1000', () => {
            const result = validateReps(1001);
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Las repeticiones');
        });

        it('should reject negative reps', () => {
            const result = validateReps(-1);
            expect(result.isValid).toBe(false);
        });
    });

    describe('validateSeries', () => {
        it('should validate valid series counts', () => {
            expect(validateSeries(3).isValid).toBe(true);
            expect(validateSeries(1).isValid).toBe(true);
            expect(validateSeries(10).isValid).toBe(true);
        });

        it('should round series to integers', () => {
            const result = validateSeries(3.7);
            expect(result.isValid).toBe(true);
            expect(result.value).toBe(4);
        });

        it('should reject series count below 1', () => {
            const result = validateSeries(0);
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('El número de series');
        });

        it('should reject series count above 20', () => {
            const result = validateSeries(21);
            expect(result.isValid).toBe(false);
        });
    });

    describe('validateUserWeight', () => {
        it('should validate valid user weights', () => {
            expect(validateUserWeight(70).isValid).toBe(true);
            expect(validateUserWeight(75.5).isValid).toBe(true);
        });

        it('should round to 1 decimal place', () => {
            const result = validateUserWeight(75.67);
            expect(result.isValid).toBe(true);
            expect(result.value).toBe(75.7);
        });

        it('should reject weight below 20 kg', () => {
            const result = validateUserWeight(19);
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Tu peso');
        });

        it('should reject weight above 300 kg', () => {
            const result = validateUserWeight(301);
            expect(result.isValid).toBe(false);
        });

        it('should handle comma as decimal separator', () => {
            const result = validateUserWeight('75,5');
            expect(result.isValid).toBe(true);
            expect(result.value).toBe(75.5);
        });
    });

    describe('validateCalories', () => {
        it('should validate valid calorie values', () => {
            expect(validateCalories(2000).isValid).toBe(true);
            expect(validateCalories(0).isValid).toBe(true);
            expect(validateCalories(5000).isValid).toBe(true);
        });

        it('should round calories to integers', () => {
            const result = validateCalories(2000.7);
            expect(result.isValid).toBe(true);
            expect(result.value).toBe(2001);
        });

        it('should reject negative calories', () => {
            const result = validateCalories(-100);
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Las calorías');
        });

        it('should reject calories above 10000', () => {
            const result = validateCalories(10001);
            expect(result.isValid).toBe(false);
        });
    });

    describe('validateText', () => {
        it('should validate non-empty text', () => {
            const result = validateText('Some text', 'Field');
            expect(result.isValid).toBe(true);
            expect(result.value).toBe('Some text');
            expect(result.error).toBeNull();
        });

        it('should trim whitespace', () => {
            const result = validateText('  Some text  ', 'Field');
            expect(result.isValid).toBe(true);
            expect(result.value).toBe('Some text');
        });

        it('should reject empty strings', () => {
            const result = validateText('', 'Field');
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('es obligatorio');
        });

        it('should reject whitespace-only strings', () => {
            const result = validateText('   ', 'Field');
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('no puede estar vacío');
        });

        it('should reject null/undefined', () => {
            expect(validateText(null, 'Field').isValid).toBe(false);
            expect(validateText(undefined, 'Field').isValid).toBe(false);
        });

        it('should reject non-string values', () => {
            const result = validateText(123, 'Field');
            expect(result.isValid).toBe(false);
        });

        it('should reject text exceeding max length', () => {
            const longText = 'a'.repeat(501);
            const result = validateText(longText, 'Field');
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('no puede tener más de 500 caracteres');
        });

        it('should accept text at max length', () => {
            const text = 'a'.repeat(500);
            const result = validateText(text, 'Field');
            expect(result.isValid).toBe(true);
        });

        it('should support custom max length', () => {
            const text = 'a'.repeat(100);
            const result = validateText(text, 'Field', 50);
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('50 caracteres');
        });

        it('should use custom field name in error messages', () => {
            const result = validateText('', 'Mi Campo');
            expect(result.error).toContain('Mi Campo');
        });
    });

    describe('validateOptionalText', () => {
        it('should accept empty strings', () => {
            const result = validateOptionalText('', 'Field');
            expect(result.isValid).toBe(true);
            expect(result.value).toBe('');
            expect(result.error).toBeNull();
        });

        it('should accept null/undefined', () => {
            expect(validateOptionalText(null, 'Field').isValid).toBe(true);
            expect(validateOptionalText(undefined, 'Field').isValid).toBe(true);
        });

        it('should accept whitespace-only strings', () => {
            const result = validateOptionalText('   ', 'Field');
            expect(result.isValid).toBe(true);
            expect(result.value).toBe('');
        });

        it('should trim and validate non-empty text', () => {
            const result = validateOptionalText('  Some text  ', 'Field');
            expect(result.isValid).toBe(true);
            expect(result.value).toBe('Some text');
        });

        it('should reject text exceeding max length', () => {
            const longText = 'a'.repeat(1001);
            const result = validateOptionalText(longText, 'Field');
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('no puede tener más de 1000 caracteres');
        });

        it('should accept text at max length', () => {
            const text = 'a'.repeat(1000);
            const result = validateOptionalText(text, 'Field');
            expect(result.isValid).toBe(true);
        });

        it('should support custom max length', () => {
            const text = 'a'.repeat(200);
            const result = validateOptionalText(text, 'Field', 100);
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('100 caracteres');
        });

        it('should use custom field name in error messages', () => {
            const longText = 'a'.repeat(1001);
            const result = validateOptionalText(longText, 'Mi Campo');
            expect(result.error).toContain('Mi Campo');
        });

        it('should convert non-string values to empty string', () => {
            const result = validateOptionalText(123, 'Field');
            expect(result.isValid).toBe(true);
            expect(result.value).toBe('');
        });
    });

    describe('ValidationResult structure', () => {
        it('should return consistent result structure for valid values', () => {
            const result = validateNumber(50, 0, 100);
            expect(result).toHaveProperty('isValid');
            expect(result).toHaveProperty('value');
            expect(result).toHaveProperty('error');
            expect(typeof result.isValid).toBe('boolean');
        });

        it('should return consistent result structure for invalid values', () => {
            const result = validateNumber(150, 0, 100);
            expect(result).toHaveProperty('isValid');
            expect(result).toHaveProperty('value');
            expect(result).toHaveProperty('error');
            expect(result.isValid).toBe(false);
            expect(result.value).toBeNull();
            expect(typeof result.error).toBe('string');
        });
    });
});
