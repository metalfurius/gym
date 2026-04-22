import { t, getLocale } from '../i18n.js';
export const QUICK_LOG_DEFAULT_LABEL = 'Quick Log';
export const QUICK_LOG_DEFAULT_NOTE_TITLE_PREFIX = 'Nota';
export const WEEKLY_TARGET_DEFAULT = 3;
export const WEEKLY_STREAK_LOOKBACK_WEEKS = 52;
export const WEEKLY_TARGET_EDIT_WINDOW_DAYS = 3;
export const WEEKLY_TARGET_MAX_SAVES_PER_WEEK = 3;
const WEEKLY_TARGET_MIN = 1;
const WEEKLY_TARGET_MAX = 7;

function normalizeText(value) {
    return (value || '').toString().trim();
}

function isValidDate(value) {
    return value instanceof Date && !Number.isNaN(value.getTime());
}

function clampWeeklyTargetDays(value) {
    return Math.min(WEEKLY_TARGET_MAX, Math.max(WEEKLY_TARGET_MIN, value));
}

function normalizeLookbackWeeks(value, fallback = WEEKLY_STREAK_LOOKBACK_WEEKS) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < 1) {
        return fallback;
    }

    return parsed;
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

export function normalizeWeeklyTargetDays(value, fallback = WEEKLY_TARGET_DEFAULT) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed)) {
        return clampWeeklyTargetDays(fallback);
    }

    return clampWeeklyTargetDays(parsed);
}

function startOfLocalDay(value) {
    const date = normalizeQuickLogDate(value, new Date());
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toLocalDateKey(value) {
    const date = startOfLocalDay(value);
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
    ].join('-');
}

function getWeekStartMonday(value) {
    const date = startOfLocalDay(value);
    const day = date.getDay(); // Sunday=0, Monday=1, ... Saturday=6
    const offsetToMonday = day === 0 ? 6 : day - 1;
    date.setDate(date.getDate() - offsetToMonday);
    return date;
}

function toWeekKey(value) {
    return toLocalDateKey(getWeekStartMonday(value));
}

function normalizeWeeklyTargetsByWeek(value) {
    if (!value || typeof value !== 'object') {
        return {};
    }

    const normalized = {};
    Object.entries(value).forEach(([weekKey, record]) => {
        if (typeof weekKey !== 'string' || !weekKey.trim()) return;
        if (!record || typeof record !== 'object') return;

        const targetDays = normalizeWeeklyTargetDays(record.targetDays, WEEKLY_TARGET_DEFAULT);
        const savesUsedRaw = Number.parseInt(record.savesUsed, 10);
        const savesUsed = Number.isInteger(savesUsedRaw)
            ? Math.max(0, Math.min(WEEKLY_TARGET_MAX_SAVES_PER_WEEK, savesUsedRaw))
            : 0;

        normalized[weekKey] = {
            targetDays,
            savesUsed
        };
    });

    return normalized;
}

function normalizeWeeklyOutcomesByWeek(value) {
    if (!value || typeof value !== 'object') {
        return {};
    }

    const normalized = {};
    Object.entries(value).forEach(([weekKey, record]) => {
        if (typeof weekKey !== 'string' || !weekKey.trim()) return;
        if (!record || typeof record !== 'object') return;

        const activeDaysRaw = Number.parseInt(record.activeDays, 10);
        const activeDays = Number.isInteger(activeDaysRaw)
            ? Math.max(0, activeDaysRaw)
            : null;
        if (activeDays === null || typeof record.met !== 'boolean') {
            return;
        }

        normalized[weekKey] = {
            activeDays,
            met: record.met === true
        };
    });

    return normalized;
}

function resolveBaselineWeeklyTarget({
    normalizedWeeklyTargetsByWeek,
    windowStartKey,
    fallbackTargetDays
}) {
    const fallbackTarget = normalizeWeeklyTargetDays(fallbackTargetDays, WEEKLY_TARGET_DEFAULT);
    const historicalTargets = Object.entries(normalizedWeeklyTargetsByWeek)
        .filter(([weekKey]) => weekKey < windowStartKey)
        .sort(([weekKeyA], [weekKeyB]) => weekKeyA.localeCompare(weekKeyB));

    if (historicalTargets.length === 0) {
        return fallbackTarget;
    }

    const [, latestRecord] = historicalTargets[historicalTargets.length - 1];
    return normalizeWeeklyTargetDays(latestRecord?.targetDays, fallbackTarget);
}

export function getWeekKeyForDate(value) {
    return toWeekKey(value);
}

export function getIsoWeekday(value = new Date()) {
    const date = normalizeQuickLogDate(value, new Date());
    const day = date.getDay();
    return day === 0 ? 7 : day;
}

export function getWeeklyConsistencyWindowStartDate(now = new Date(), lookbackWeeks = WEEKLY_STREAK_LOOKBACK_WEEKS) {
    const resolvedNow = normalizeQuickLogDate(now, new Date());
    const resolvedLookbackWeeks = normalizeLookbackWeeks(lookbackWeeks);
    const currentWeekStart = getWeekStartMonday(resolvedNow);
    const windowStart = new Date(currentWeekStart);
    windowStart.setDate(windowStart.getDate() - ((resolvedLookbackWeeks - 1) * 7));
    return windowStart;
}

export function buildWeeklyConsistencyTimeline(input = {}) {
    const now = normalizeQuickLogDate(input.now, new Date());
    const sessions = Array.isArray(input.sessions) ? input.sessions : [];
    const lookbackWeeks = normalizeLookbackWeeks(input.lookbackWeeks);
    const currentWeekStart = getWeekStartMonday(now);
    const currentWeekKey = toWeekKey(currentWeekStart);
    const windowStart = getWeeklyConsistencyWindowStartDate(now, lookbackWeeks);
    const windowStartKey = toWeekKey(windowStart);
    const todayLocal = startOfLocalDay(now);
    const normalizedWeeklyTargetsByWeek = normalizeWeeklyTargetsByWeek(input.weeklyTargetsByWeek);
    const normalizedWeeklyOutcomesByWeek = normalizeWeeklyOutcomesByWeek(input.weeklyOutcomesByWeek);

    const activeDaysByWeek = new Map();
    sessions.forEach((session) => {
        const sessionDate = resolveSessionDate(session);
        if (!sessionDate) return;

        const sessionDay = startOfLocalDay(sessionDate);
        if (sessionDay < windowStart || sessionDay > todayLocal) return;

        const weekKey = toWeekKey(sessionDay);
        let daySet = activeDaysByWeek.get(weekKey);
        if (!daySet) {
            daySet = new Set();
            activeDaysByWeek.set(weekKey, daySet);
        }

        daySet.add(toLocalDateKey(sessionDay));
    });

    let effectiveTargetDays = resolveBaselineWeeklyTarget({
        normalizedWeeklyTargetsByWeek,
        windowStartKey,
        fallbackTargetDays: input.weeklyTargetDays
    });

    const timeline = [];
    for (let index = 0; index < lookbackWeeks; index += 1) {
        const weekStart = new Date(windowStart);
        weekStart.setDate(windowStart.getDate() + (index * 7));
        const weekKey = toWeekKey(weekStart);
        const weekTargetRecord = normalizedWeeklyTargetsByWeek[weekKey];
        if (weekTargetRecord?.targetDays !== undefined) {
            effectiveTargetDays = normalizeWeeklyTargetDays(weekTargetRecord.targetDays, effectiveTargetDays);
        }

        const isCurrentWeek = weekKey === currentWeekKey;
        const frozenOutcome = !isCurrentWeek ? normalizedWeeklyOutcomesByWeek[weekKey] : null;
        const activeDays = frozenOutcome
            ? Math.max(0, frozenOutcome.activeDays)
            : (activeDaysByWeek.get(weekKey)?.size || 0);
        const met = frozenOutcome
            ? frozenOutcome.met === true
            : activeDays >= effectiveTargetDays;

        timeline.push({
            weekKey,
            weekStart,
            isCurrentWeek,
            targetDays: effectiveTargetDays,
            activeDays,
            met,
            isFrozen: !!frozenOutcome,
            savesUsed: weekTargetRecord?.savesUsed || 0
        });
    }

    return {
        timeline,
        currentWeekKey,
        windowStart
    };
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

export function computeWeeklyConsistencyMetrics(input = {}) {
    const timelineResult = buildWeeklyConsistencyTimeline(input);
    const qualifiedWeeks = timelineResult.timeline.map((entry) => entry.met === true);
    const currentWeekEntry = timelineResult.timeline.find((entry) => entry.isCurrentWeek)
        || timelineResult.timeline[timelineResult.timeline.length - 1]
        || {
            targetDays: normalizeWeeklyTargetDays(input.weeklyTargetDays, WEEKLY_TARGET_DEFAULT),
            activeDays: 0,
            met: false
        };

    let bestWeeklyStreak = 0;
    let runningStreak = 0;
    qualifiedWeeks.forEach((qualified) => {
        if (!qualified) {
            runningStreak = 0;
            return;
        }

        runningStreak += 1;
        if (runningStreak > bestWeeklyStreak) {
            bestWeeklyStreak = runningStreak;
        }
    });

    let currentWeeklyStreak = 0;
    for (let index = qualifiedWeeks.length - 1; index >= 0; index -= 1) {
        if (!qualifiedWeeks[index]) {
            break;
        }

        currentWeeklyStreak += 1;
    }

    const weeklyProgressDays = currentWeekEntry.activeDays || 0;
    const weeklyTargetDays = normalizeWeeklyTargetDays(
        currentWeekEntry.targetDays,
        input.weeklyTargetDays
    );

    return {
        weeklyTargetDays,
        weeklyProgressDays,
        weeklyProgressLabel: `${weeklyProgressDays}/${weeklyTargetDays}`,
        weeklyProgressMet: weeklyProgressDays >= weeklyTargetDays,
        currentWeeklyStreak,
        bestWeeklyStreak
    };
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

    const weeklyConsistency = computeWeeklyConsistencyMetrics({
        sessions,
        now,
        weeklyTargetDays: input.weeklyTargetDays,
        weeklyTargetsByWeek: input.weeklyTargetsByWeek,
        weeklyOutcomesByWeek: input.weeklyOutcomesByWeek
    });

    return {
        logsMonthCount,
        // Keep backward compatibility while callers/tests migrate naming.
        logsTodayCount: logsMonthCount,
        lastWorkoutDate,
        lastWorkoutLabel: formatLastWorkoutLabel(lastWorkoutDate),
        routineShortcut,
        syncStatus,
        syncClass,
        isEmpty: logsMonthCount === 0,
        weeklyTargetDays: weeklyConsistency.weeklyTargetDays,
        weeklyProgressDays: weeklyConsistency.weeklyProgressDays,
        weeklyProgressLabel: weeklyConsistency.weeklyProgressLabel,
        weeklyProgressMet: weeklyConsistency.weeklyProgressMet,
        currentWeeklyStreak: weeklyConsistency.currentWeeklyStreak,
        bestWeeklyStreak: weeklyConsistency.bestWeeklyStreak
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
