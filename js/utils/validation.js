/**
 * Input validation utilities with configurable range limits
 * Provides validation functions for gym tracker inputs
 */

// Validation limits
export const LIMITS = {
    WEIGHT: { min: 0, max: 500 },           // Exercise weight in kg
    REPS: { min: 0, max: 1000 },            // Repetitions
    SERIES: { min: 1, max: 20 },            // Number of series/sets
    USER_WEIGHT: { min: 20, max: 300 },     // User body weight in kg
    CALORIES: { min: 0, max: 10000 },       // Daily calorie intake
};

/**
 * Validation result object
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid - Whether the value is valid
 * @property {*} value - The sanitized/parsed value (or null if invalid)
 * @property {string|null} error - Error message if invalid
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
    // Handle empty/null values
    if (value === null || value === undefined || value === '') {
        return { isValid: true, value: null, error: null };
    }

    // Normalize comma to decimal point
    const normalizedValue = String(value).replace(',', '.');
    const numValue = parseFloat(normalizedValue);

    if (isNaN(numValue)) {
        return {
            isValid: false,
            value: null,
            error: `${fieldName} debe ser un número válido`
        };
    }

    if (numValue < min) {
        return {
            isValid: false,
            value: null,
            error: `${fieldName} no puede ser menor que ${min}`
        };
    }

    if (numValue > max) {
        return {
            isValid: false,
            value: null,
            error: `${fieldName} no puede ser mayor que ${max}`
        };
    }

    return { isValid: true, value: numValue, error: null };
}

/**
 * Validates exercise weight (0-500 kg)
 * @param {*} value - The weight value to validate
 * @returns {ValidationResult}
 */
export function validateWeight(value) {
    return validateNumber(value, LIMITS.WEIGHT.min, LIMITS.WEIGHT.max, 'El peso');
}

/**
 * Validates repetitions (0-1000)
 * @param {*} value - The reps value to validate
 * @returns {ValidationResult}
 */
export function validateReps(value) {
    const result = validateNumber(value, LIMITS.REPS.min, LIMITS.REPS.max, 'Las repeticiones');
    
    // Reps should be integers
    if (result.isValid && result.value !== null) {
        result.value = Math.round(result.value);
    }
    
    return result;
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
    const result = validateNumber(value, LIMITS.USER_WEIGHT.min, LIMITS.USER_WEIGHT.max, 'Tu peso');
    
    // Round to 1 decimal place
    if (result.isValid && result.value !== null) {
        result.value = Math.round(result.value * 10) / 10;
    }
    
    return result;
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
            error: `${fieldName} es obligatorio`
        };
    }

    const trimmed = value.trim();
    
    if (trimmed.length === 0) {
        return {
            isValid: false,
            value: null,
            error: `${fieldName} no puede estar vacío`
        };
    }

    if (trimmed.length > maxLength) {
        return {
            isValid: false,
            value: null,
            error: `${fieldName} no puede tener más de ${maxLength} caracteres`
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
            error: `${fieldName} no puede tener más de ${maxLength} caracteres`
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
    validateText,
    validateOptionalText
};
