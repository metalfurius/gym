import { t, getLocale } from '../i18n.js';
export const QUICK_LOG_DEFAULT_LABEL = 'Quick Log';
export const QUICK_LOG_DEFAULT_NOTE_TITLE_PREFIX = 'Nota';

function normalizeText(value) {
    return (value || '').toString().trim();
}

function isValidDate(value) {
    return value instanceof Date && !Number.isNaN(value.getTime());
}

function parseDateCandidate(value) {
    if (value instanceof Date) {
        return isValidDate(value) ? value : null;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        const parsed = new Date(value);
        return isValidDate(parsed) ? parsed : null;
    }

    if (typeof value === 'string') {
        const raw = value.trim();
        if (!raw) return null;

        // datetime-local values are timezone-less; interpret them in local timezone.
        const normalized = raw.includes('T') && raw.length === 16 ? `${raw}:00` : raw;
        const parsed = new Date(normalized);
        return isValidDate(parsed) ? parsed : null;
    }

    if (value && typeof value.toDate === 'function') {
        const parsed = value.toDate();
        return isValidDate(parsed) ? parsed : null;
    }

    return null;
}

export function normalizeQuickLogDate(value, fallbackDate = new Date()) {
    const parsed = parseDateCandidate(value);
    if (parsed) return parsed;

    const safeFallback = parseDateCandidate(fallbackDate);
    return safeFallback || new Date();
}

export function splitQuickLogNotes(value) {
    if (Array.isArray(value)) {
        return value
            .map((entry) => normalizeText(entry))
            .filter(Boolean);
    }

    const rawText = normalizeText(value);
    if (!rawText) return [];

    return rawText
        .split(/\r?\n/)
        .map((line) => normalizeText(line))
        .filter(Boolean);
}

export function normalizeQuickLogPayload(input = {}, options = {}) {
    const now = normalizeQuickLogDate(options.now || new Date(), new Date());
    const label = normalizeText(input.label) || t('quicklog.default_label');
    const notes = splitQuickLogNotes(input.notes ?? input.notesText ?? input.exerciseNotes);
    const entryDate = normalizeQuickLogDate(input.dateTime ?? input.fechaIso ?? input.fecha, now);
    const noteTitlePrefix = t('quicklog.default_note_prefix');

    if (notes.length === 0) {
        return {
            isValid: false,
            errors: ['at_least_one_note_required'],
            value: null
        };
    }

    return {
        isValid: true,
        errors: [],
        value: {
            nombreEntrenamiento: label,
            fechaIso: entryDate.toISOString(),
            ejercicios: notes.map((note, index) => ({
                nombreEjercicio: `${noteTitlePrefix} ${index + 1}`,
                tipoEjercicio: 'other',
                objetivoSets: null,
                objetivoReps: null,
                objetivoDuracion: null,
                sets: [],
                notasEjercicio: note
            })),
            quickLog: {
                source: 'quick_log',
                noteCount: notes.length,
                createdAtIso: now.toISOString()
            }
        }
    };
}

export function buildQuickLogSessionModel(userId, normalizedPayload, timestampFactory) {
    if (!userId) {
        throw new Error('buildQuickLogSessionModel requires userId');
    }

    if (!normalizedPayload || !Array.isArray(normalizedPayload.ejercicios) || normalizedPayload.ejercicios.length === 0) {
        throw new Error('buildQuickLogSessionModel requires a normalized payload with exercises');
    }

    const entryDate = normalizeQuickLogDate(normalizedPayload.fechaIso, new Date());
    const timestamp = typeof timestampFactory?.fromDate === 'function'
        ? timestampFactory.fromDate(entryDate)
        : {
            toDate: () => entryDate
        };

    return {
        fecha: timestamp,
        routineId: null,
        nombreEntrenamiento: normalizedPayload.nombreEntrenamiento || t('quicklog.default_label'),
        userId,
        ejercicios: normalizedPayload.ejercicios,
        pesoUsuario: null,
        quickLog: normalizedPayload.quickLog || {
            source: 'quick_log',
            noteCount: normalizedPayload.ejercicios.length
        }
    };
}

function toLocalMonthKey(dateValue) {
    const date = normalizeQuickLogDate(dateValue, new Date());
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0')
    ].join('-');
}

function resolveSessionDate(session = {}) {
    return parseDateCandidate(session.fecha)
        || parseDateCandidate(session.fechaIso)
        || parseDateCandidate(session.quickLog?.createdAtIso)
        || null;
}

function formatLastWorkoutLabel(lastWorkoutDate) {
    if (!isValidDate(lastWorkoutDate)) {
        return t('dashboard.last_workout_none');
    }

    return lastWorkoutDate.toLocaleString(getLocale(), {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

export function computeDailyHubState(input = {}) {
    const now = normalizeQuickLogDate(input.now, new Date());
    const sessions = Array.isArray(input.sessions) ? input.sessions : [];
    const routines = Array.isArray(input.routines) ? input.routines : [];
    const selectedRoutineId = normalizeText(input.selectedRoutineId);
    const isOnline = input.isOnline !== false;
    const pendingCount = Number.isFinite(Number(input.pendingCount))
        ? Math.max(0, Math.trunc(Number(input.pendingCount)))
        : 0;

    let lastWorkoutDate = null;
    let logsMonthCount = 0;
    const currentMonthKey = toLocalMonthKey(now);

    sessions.forEach((session) => {
        const sessionDate = resolveSessionDate(session);
        if (!sessionDate) return;

        if (toLocalMonthKey(sessionDate) === currentMonthKey) {
            logsMonthCount += 1;
        }

        if (!lastWorkoutDate || sessionDate > lastWorkoutDate) {
            lastWorkoutDate = sessionDate;
        }
    });

    const selectedRoutine = selectedRoutineId
        ? routines.find((routine) => normalizeText(routine?.id) === selectedRoutineId)
        : null;
    const fallbackRoutine = selectedRoutine || routines[0] || null;
    const routineShortcut = normalizeText(fallbackRoutine?.name) || t('dashboard.routine_none');

    let syncStatus = t('dashboard.sync_online');
    let syncClass = 'sync-online';
    if (!isOnline && pendingCount > 0) {
        syncStatus = t('dashboard.sync_offline_queued', { count: pendingCount });
        syncClass = 'sync-offline';
    } else if (!isOnline) {
        syncStatus = t('dashboard.sync_offline');
        syncClass = 'sync-offline';
    } else if (pendingCount > 0) {
        syncStatus = t('dashboard.sync_online_queued', { count: pendingCount });
        syncClass = 'sync-queued';
    }

    return {
        logsMonthCount,
        // Keep backward compatibility while callers/tests migrate naming.
        logsTodayCount: logsMonthCount,
        lastWorkoutDate,
        lastWorkoutLabel: formatLastWorkoutLabel(lastWorkoutDate),
        routineShortcut,
        syncStatus,
        syncClass,
        isEmpty: sessions.length === 0
    };
}

export function toDatetimeLocalValue(value = new Date()) {
    const date = normalizeQuickLogDate(value, new Date());
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}`;
}
