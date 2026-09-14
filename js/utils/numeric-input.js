/**
 * Shared numeric input normalization for workout editing and persistence.
 *
 * Editing and committing are intentionally separate operations. Editing keeps
 * incomplete values such as `62.` or `-` intact so a user can continue typing;
 * committing requires a complete value and never truncates malformed input.
 */

export const DEFAULT_DECIMAL_INPUT_DIGITS = 2;

function toInputString(value) {
    if (value === null || value === undefined) {
        return '';
    }

    return String(value);
}

function invalidEditResult(value, errorCode = 'format') {
    return {
        value,
        normalized: value,
        isValid: false,
        isComplete: false,
        isEmpty: false,
        errorCode,
    };
}

/**
 * Normalize a decimal field while it is being edited.
 *
 * The returned value uses `.` internally, but a trailing separator and a
 * leading sign remain visible. Invalid text is returned unchanged so it can
 * be reported instead of being silently reinterpreted as another number.
 */
export function normalizeDecimalEditValue(
    value,
    { allowSign = false, maxFractionDigits = DEFAULT_DECIMAL_INPUT_DIGITS } = {}
) {
    const source = toInputString(value);

    if (source === '') {
        return {
            value: '',
            normalized: '',
            isValid: true,
            isComplete: false,
            isEmpty: true,
            errorCode: null,
        };
    }

    const signPattern = allowSign ? '[+-]?' : '';
    const editPattern = new RegExp(`^${signPattern}(?:\\d*(?:[.,]\\d*)?)?$`);
    if (!editPattern.test(source)) {
        return invalidEditResult(source);
    }

    const separatorIndexes = [source.indexOf('.'), source.indexOf(',')].filter(index => index >= 0);
    const separatorIndex = separatorIndexes.length > 0 ? separatorIndexes[0] : -1;
    const fractionDigits = separatorIndex >= 0 ? source.slice(separatorIndex + 1) : '';
    if (maxFractionDigits !== null && fractionDigits.length > maxFractionDigits) {
        return invalidEditResult(source, 'too_many_fraction_digits');
    }

    const normalized = source.replace(',', '.');
    const unsignedValue = normalized.replace(/^[+-]/, '');
    const isComplete = /\d/.test(unsignedValue) && !normalized.endsWith('.');

    return {
        value: normalized,
        normalized,
        isValid: true,
        isComplete,
        isEmpty: false,
        errorCode: isComplete ? null : 'incomplete',
    };
}

/**
 * Normalize a non-negative integer field while it is being edited.
 */
export function normalizeIntegerEditValue(value) {
    const source = toInputString(value);

    if (source === '') {
        return {
            value: '',
            normalized: '',
            isValid: true,
            isComplete: false,
            isEmpty: true,
            errorCode: null,
        };
    }

    if (!/^\d+$/.test(source)) {
        return invalidEditResult(source);
    }

    return {
        value: source,
        normalized: source,
        isValid: true,
        isComplete: true,
        isEmpty: false,
        errorCode: null,
    };
}

function roundToDecimals(value, decimals) {
    if (decimals === null || decimals === undefined) {
        return value;
    }

    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}

/**
 * Parse and validate a decimal value for a committed model.
 */
export function parseDecimalInput(
    value,
    {
        allowSign = false,
        allowEmpty = true,
        min = Number.NEGATIVE_INFINITY,
        max = Number.POSITIVE_INFINITY,
        maxFractionDigits = DEFAULT_DECIMAL_INPUT_DIGITS,
        roundTo = null,
    } = {}
) {
    const editResult = normalizeDecimalEditValue(value, { allowSign, maxFractionDigits });

    if (editResult.isEmpty) {
        return {
            ...editResult,
            isValid: allowEmpty,
            value: null,
            errorCode: allowEmpty ? 'empty' : 'required',
        };
    }

    if (!editResult.isValid) {
        return {
            ...editResult,
            value: null,
        };
    }

    if (!editResult.isComplete) {
        return {
            ...editResult,
            isValid: false,
            value: null,
            errorCode: 'incomplete',
        };
    }

    const parsed = Number(editResult.normalized);
    if (!Number.isFinite(parsed)) {
        return {
            ...editResult,
            isValid: false,
            value: null,
            errorCode: 'format',
        };
    }

    if (parsed < min) {
        return {
            ...editResult,
            isValid: false,
            value: null,
            errorCode: 'min',
        };
    }

    if (parsed > max) {
        return {
            ...editResult,
            isValid: false,
            value: null,
            errorCode: 'max',
        };
    }

    return {
        ...editResult,
        isValid: true,
        value: roundToDecimals(parsed, roundTo),
        errorCode: null,
    };
}

/**
 * Parse and validate a non-negative integer value for a committed model.
 */
export function parseIntegerInput(value, { allowEmpty = true, min = 0, max = Number.POSITIVE_INFINITY } = {}) {
    const editResult = normalizeIntegerEditValue(value);

    if (editResult.isEmpty) {
        return {
            ...editResult,
            isValid: allowEmpty,
            value: null,
            errorCode: allowEmpty ? 'empty' : 'required',
        };
    }

    if (!editResult.isValid || !editResult.isComplete) {
        return {
            ...editResult,
            isValid: false,
            value: null,
            errorCode: editResult.errorCode || 'format',
        };
    }

    const parsed = Number(editResult.normalized);
    if (!Number.isSafeInteger(parsed)) {
        return {
            ...editResult,
            isValid: false,
            value: null,
            errorCode: 'format',
        };
    }

    if (parsed < min) {
        return {
            ...editResult,
            isValid: false,
            value: null,
            errorCode: 'min',
        };
    }

    if (parsed > max) {
        return {
            ...editResult,
            isValid: false,
            value: null,
            errorCode: 'max',
        };
    }

    return {
        ...editResult,
        isValid: true,
        value: parsed,
        errorCode: null,
    };
}

export default {
    DEFAULT_DECIMAL_INPUT_DIGITS,
    normalizeDecimalEditValue,
    normalizeIntegerEditValue,
    parseDecimalInput,
    parseIntegerInput,
};
