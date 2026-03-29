export const LAST_KNOWN_BODYWEIGHT_KEY_PREFIX = 'gym-tracker:last-known-bodyweight:';

function toFiniteNumber(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function roundToSingleDecimal(value) {
    return Math.round(value * 10) / 10;
}

export function normalizeBodyweight(value) {
    const parsed = toFiniteNumber(value);
    if (parsed === null || parsed <= 0) {
        return null;
    }

    return roundToSingleDecimal(parsed);
}

export function getLastKnownBodyweight(userId) {
    if (!userId) {
        return null;
    }

    try {
        const stored = localStorage.getItem(`${LAST_KNOWN_BODYWEIGHT_KEY_PREFIX}${userId}`);
        return normalizeBodyweight(stored);
    } catch {
        return null;
    }
}

export function saveLastKnownBodyweight(userId, bodyweight) {
    if (!userId) {
        return;
    }

    const normalized = normalizeBodyweight(bodyweight);
    if (normalized === null) {
        return;
    }

    try {
        localStorage.setItem(`${LAST_KNOWN_BODYWEIGHT_KEY_PREFIX}${userId}`, String(normalized));
    } catch {
        // Ignore localStorage write errors for this optional optimization.
    }
}

export function computeBodyweightTotalLoad(extraLoad, bodyweight) {
    const parsedExtraLoad = toFiniteNumber(extraLoad);
    const normalizedBodyweight = normalizeBodyweight(bodyweight);

    if (parsedExtraLoad === null || normalizedBodyweight === null) {
        return null;
    }

    return roundToSingleDecimal(normalizedBodyweight + parsedExtraLoad);
}
