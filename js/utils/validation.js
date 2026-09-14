/**
 * Input validation utilities with configurable range limits
 * Provides validation functions for gym tracker inputs
 */

import { t } from '../i18n.js';
import { parseDecimalInput, parseIntegerInput } from './numeric-input.js';

// Validation limits
export const LIMITS = {
    WEIGHT: { min: 0, max: 500 }, // Exercise weight in kg
    REPS: { min: 0, max: 1000 }, // Repetitions
    SERIES: { min: 1, max: 20 }, // Number of series/sets
    USER_WEIGHT: { min: 20, max: 300 }, // User body weight in kg
    CALORIES: { min: 0, max: 10000 }, // Daily calorie intake
};

/**
 * Validation result object
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid - Whether the value is valid
 * @property {*} value - The sanitized/parsed value (or null if invalid)
 * @property {string|null} error - Error message if invalid
 * @property {string|null} errorCode - Stable machine-readable error code
 */

/**
 * Validates a numeric value within a range
 * @param {*} value - The value to validate
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @param {string} fieldName - Name of the field for error messages
 * @returns {ValidationResult}
 */
export function validateNumber(value, min, max, fieldName = 'Valor') {
    const result = parseDecimalInput(value, {
        allowSign: true,
        min,
        max,
        maxFractionDigits: null,
        roundTo: null,
    });

    return withLegacyError(result, fieldName, min, max);
}

function withLegacyError(result, fieldName, min, max) {
    if (result.isValid) {
        return { ...result, error: null };
    }

    if (result.errorCode === 'min') {
        return {
            ...result,
            error: `${fieldName} no puede ser menor que ${min}`,
        };
    }

    if (result.errorCode === 'max') {
        return {
            ...result,
            error: `${fieldName} no puede ser mayor que ${max}`,
        };
    }

    if (result.errorCode === 'incomplete') {
        return {
            ...result,
            error: `${fieldName} debe estar completo`,
        };
    }

    return {
        ...result,
        error: `${fieldName} debe ser un número válido`,
    };
}

/**
 * Validates exercise weight (0-500 kg)
 * @param {*} value - The weight value to validate
 * @returns {ValidationResult}
 */
export function validateWeight(value, options = {}) {
    const min = options.allowSigned ? (options.min ?? -LIMITS.WEIGHT.max) : (options.min ?? LIMITS.WEIGHT.min);
    const max = options.max ?? LIMITS.WEIGHT.max;
    const result = parseDecimalInput(value, {
        allowSign: options.allowSigned === true,
        min,
        max,
        roundTo: 1,
    });

    return withLegacyError(result, 'El peso', min, max);
}

/**
 * Validates repetitions (0-1000)
 * @param {*} value - The reps value to validate
 * @returns {ValidationResult}
 */
export function validateReps(value) {
    const result = parseIntegerInput(value, {
        min: LIMITS.REPS.min,
        max: LIMITS.REPS.max,
    });

    if (result.isValid) {
        return { ...result, error: null };
    }

    if (result.errorCode === 'min') {
        return {
            ...result,
            error: `Las repeticiones no pueden ser menores que ${LIMITS.REPS.min}`,
        };
    }

    if (result.errorCode === 'max') {
        return {
            ...result,
            error: `Las repeticiones no pueden ser mayores que ${LIMITS.REPS.max}`,
        };
    }

    return {
        ...result,
        error: 'Las repeticiones deben ser números enteros no negativos',
    };
}

/**
 * Validates series/sets count (1-20)
 * @param {*} value - The series value to validate
 * @returns {ValidationResult}
 */
export function validateSeries(value) {
    const result = validateNumber(value, LIMITS.SERIES.min, LIMITS.SERIES.max, 'El número de series');

    // Series should be integers
    if (result.isValid && result.value !== null) {
        result.value = Math.round(result.value);
    }

    return result;
}

/**
 * Validates user body weight (20-300 kg)
 * @param {*} value - The user weight value to validate
 * @returns {ValidationResult}
 */
export function validateUserWeight(value) {
    const result = parseDecimalInput(value, {
        min: LIMITS.USER_WEIGHT.min,
        max: LIMITS.USER_WEIGHT.max,
        roundTo: 1,
    });

    return withLegacyError(result, 'Tu peso', LIMITS.USER_WEIGHT.min, LIMITS.USER_WEIGHT.max);
}

/**
 * Return a localized correction message for a session numeric field.
 * @param {Object} result - Result from validateWeight/validateReps/validateUserWeight
 * @param {'weight'|'reps'|'userWeight'} fieldType
 * @param {Object} options
 * @returns {string}
 */
export function getValidationMessage(result, fieldType, options = {}) {
    if (!result || result.isValid) {
        return '';
    }

    const fieldConfig = {
        weight: {
            invalid: 'session.weight_input_invalid',
            incomplete: 'session.weight_input_incomplete',
            range: 'session.weight_input_range',
        },
        reps: {
            invalid: 'session.reps_input_invalid',
            incomplete: 'session.reps_input_incomplete',
            range: 'session.reps_input_range',
        },
        userWeight: {
            invalid: 'session.user_weight_input_invalid',
            incomplete: 'session.user_weight_input_incomplete',
            range: 'session.user_weight_input_range',
        },
    }[fieldType] || {
        invalid: 'session.input_invalid',
        incomplete: 'session.input_incomplete',
        range: 'session.input_range',
    };

    if (result.errorCode === 'min' || result.errorCode === 'max') {
        const min = options.min ?? '';
        const max = options.max ?? '';
        return t(fieldConfig.range, { min, max });
    }

    if (result.errorCode === 'incomplete' || result.errorCode === 'required') {
        return t(fieldConfig.incomplete);
    }

    return t(fieldConfig.invalid);
}

/**
 * Validates calorie intake (0-10000)
 * @param {*} value - The calorie value to validate
 * @returns {ValidationResult}
 */
export function validateCalories(value) {
    const result = validateNumber(value, LIMITS.CALORIES.min, LIMITS.CALORIES.max, 'Las calorías');

    // Calories should be integers
    if (result.isValid && result.value !== null) {
        result.value = Math.round(result.value);
    }

    return result;
}

/**
 * Validates a text field is not empty
 * @param {string} value - The text value to validate
 * @param {string} fieldName - Name of the field for error messages
 * @param {number} maxLength - Maximum allowed length (default 500)
 * @returns {ValidationResult}
 */
export function validateText(value, fieldName = 'El campo', maxLength = 500) {
    if (!value || typeof value !== 'string') {
        return {
            isValid: false,
            value: null,
            error: `${fieldName} es obligatorio`,
        };
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
        return {
            isValid: false,
            value: null,
            error: `${fieldName} no puede estar vacío`,
        };
    }

    if (trimmed.length > maxLength) {
        return {
            isValid: false,
            value: null,
            error: `${fieldName} no puede tener más de ${maxLength} caracteres`,
        };
    }

    return { isValid: true, value: trimmed, error: null };
}

/**
 * Validates an optional text field (can be empty)
 * @param {string} value - The text value to validate
 * @param {string} fieldName - Name of the field for error messages
 * @param {number} maxLength - Maximum allowed length (default 1000)
 * @returns {ValidationResult}
 */
export function validateOptionalText(value, fieldName = 'El campo', maxLength = 1000) {
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
        return { isValid: true, value: '', error: null };
    }

    const trimmed = value.trim();

    if (trimmed.length > maxLength) {
        return {
            isValid: false,
            value: null,
            error: `${fieldName} no puede tener más de ${maxLength} caracteres`,
        };
    }

    return { isValid: true, value: trimmed, error: null };
}

export default {
    LIMITS,
    validateNumber,
    validateWeight,
    validateReps,
    validateSeries,
    validateUserWeight,
    validateCalories,
    getValidationMessage,
    validateText,
    validateOptionalText,
};
