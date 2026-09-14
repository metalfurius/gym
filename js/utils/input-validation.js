const ERROR_SUFFIX = '-error';

function getErrorId(input) {
    const identifier = input.id || input.name || 'numeric-input';
    return `${identifier}${ERROR_SUFFIX}`;
}

function getErrorElement(input) {
    const documentRef = input.ownerDocument || document;
    const errorId = getErrorId(input);
    let errorElement = documentRef.getElementById(errorId);

    if (!errorElement) {
        errorElement = documentRef.createElement('p');
        errorElement.id = errorId;
        errorElement.className = 'input-error-message';
        errorElement.setAttribute('role', 'alert');
        errorElement.setAttribute('aria-live', 'polite');
        errorElement.hidden = true;
        input.insertAdjacentElement('afterend', errorElement);
    }

    return errorElement;
}

function updateDescribedBy(input, errorId, includeError) {
    const describedBy = (input.getAttribute('aria-describedby') || '')
        .split(/\s+/)
        .filter(Boolean)
        .filter(id => id !== errorId);

    if (includeError) {
        describedBy.push(errorId);
    }

    if (describedBy.length > 0) {
        input.setAttribute('aria-describedby', describedBy.join(' '));
    } else {
        input.removeAttribute('aria-describedby');
    }
}

/**
 * Apply an accessible validation state without relying on color alone.
 */
export function setInputValidationState(input, { isValid = true, message = '' } = {}) {
    if (!input) {
        return;
    }

    const errorElement = getErrorElement(input);
    const errorId = errorElement.id;

    if (isValid) {
        input.removeAttribute('aria-invalid');
        input.setCustomValidity('');
        updateDescribedBy(input, errorId, false);
        errorElement.hidden = true;
        errorElement.textContent = '';
        return;
    }

    const errorMessage = message || 'Invalid value';
    input.setAttribute('aria-invalid', 'true');
    input.setCustomValidity(errorMessage);
    updateDescribedBy(input, errorId, true);
    errorElement.hidden = false;
    errorElement.textContent = errorMessage;
}

/**
 * Change an input value while retaining the user's selection when possible.
 */
export function replaceInputValuePreservingSelection(input, nextValue) {
    const value = String(nextValue ?? '');
    if (!input || input.value === value) {
        return;
    }

    const isFocused = input.ownerDocument?.activeElement === input;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const lengthDelta = value.length - input.value.length;

    input.value = value;

    if (isFocused && start !== null && end !== null && typeof input.setSelectionRange === 'function') {
        const nextStart = Math.max(0, Math.min(value.length, start + lengthDelta));
        const nextEnd = Math.max(0, Math.min(value.length, end + lengthDelta));
        input.setSelectionRange(nextStart, nextEnd);
    }
}

export default {
    setInputValidationState,
    replaceInputValuePreservingSelection,
};
