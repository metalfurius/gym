import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
    getWeekKeyForDate,
    QUICK_LOG_DEFAULT_LABEL,
    WEEKLY_TARGET_DEFAULT,
    splitQuickLogNotes,
    normalizeQuickLogDate,
    normalizeWeeklyTargetDays,
    normalizeQuickLogPayload,
    buildQuickLogSessionModel,
    computeWeeklyConsistencyMetrics,
    computeDailyHubState,
    toDatetimeLocalValue
} from '../../js/utils/quick-log.js';
import { setLanguage } from '../../js/i18n.js';

describe('quick-log utils', () => {
    beforeEach(() => {
        setLanguage('es', { persist: false, apply: false });
    });

    it('splits and trims multiline notes', () => {
        const notes = splitQuickLogNotes('  press banca  \n\ndominadas\n ');
        expect(notes).toEqual(['press banca', 'dominadas']);
    });

    it('normalizes payload with defaults and note entries', () => {
        const now = new Date('2026-03-29T10:15:00.000Z');
        const result = normalizeQuickLogPayload({
            notesText: 'Sentadilla 3x5\nPlancha 45s'
        }, { now });

        expect(result.isValid).toBe(true);
        expect(result.value.nombreEntrenamiento).toBe(QUICK_LOG_DEFAULT_LABEL);
        expect(result.value.ejercicios).toHaveLength(2);
        expect(result.value.ejercicios[0].nombreEjercicio).toBe('Nota 1');
        expect(result.value.quickLog.source).toBe('quick_log');
    });

    it('rejects payload without notes', () => {
        const result = normalizeQuickLogPayload({
            label: 'Legs'
        });

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('at_least_one_note_required');
    });

    it('falls back to current date when quick-log date is invalid', () => {
        const fallback = new Date('2026-03-29T08:00:00.000Z');
        const normalized = normalizeQuickLogDate('not-a-date', fallback);
        expect(normalized.toISOString()).toBe(fallback.toISOString());
    });

    it('builds quick-log firestore session model with timestamp factory', () => {
        const fakeTimestamp = { toDate: () => new Date('2026-03-29T12:00:00.000Z') };
        const timestampFactory = {
            fromDate: jest.fn(() => fakeTimestamp)
        };
        const normalizedPayload = {
            nombreEntrenamiento: 'Quick Legs',
            fechaIso: '2026-03-29T12:00:00.000Z',
            ejercicios: [
                {
                    nombreEjercicio: 'Nota 1',
                    tipoEjercicio: 'other',
                    sets: [],
                    notasEjercicio: 'Sentadilla'
                }
            ],
            quickLog: {
                source: 'quick_log',
                noteCount: 1
            }
        };

        const model = buildQuickLogSessionModel('user-1', normalizedPayload, timestampFactory);

        expect(timestampFactory.fromDate).toHaveBeenCalled();
        expect(model.userId).toBe('user-1');
        expect(model.quickLog.source).toBe('quick_log');
        expect(model.ejercicios).toHaveLength(1);
    });

    it('computes daily hub state for empty sessions', () => {
        const now = new Date(2026, 2, 29, 9, 0, 0);
        const state = computeDailyHubState({
            sessions: [],
            routines: [],
            now,
            isOnline: true,
            pendingCount: 0
        });

        expect(state.logsMonthCount).toBe(0);
        expect(state.lastWorkoutLabel).toBe('Sin registros');
        expect(state.routineShortcut).toBe('Sin rutina');
        expect(state.syncStatus).toBe('En línea');
        expect(state.isEmpty).toBe(true);
    });

    it('computes daily hub monthly state with sessions, selected routine and queued sync', () => {
        const now = new Date(2026, 2, 29, 13, 0, 0);
        const todayMorning = new Date(2026, 2, 29, 8, 15, 0);
        const yesterday = new Date(2026, 2, 28, 20, 0, 0);
        const state = computeDailyHubState({
            sessions: [
                { fecha: todayMorning },
                { fecha: yesterday }
            ],
            routines: [
                { id: 'r1', name: 'Push Day' },
                { id: 'r2', name: 'Leg Day' }
            ],
            selectedRoutineId: 'r2',
            now,
            isOnline: true,
            pendingCount: 2
        });

        expect(state.logsMonthCount).toBe(2);
        expect(state.routineShortcut).toBe('Leg Day');
        expect(state.syncStatus).toContain('2');
        expect(state.isEmpty).toBe(false);
        expect(state.lastWorkoutDate instanceof Date).toBe(true);
    });

    it('treats daily hub as empty when there are no sessions in the current month', () => {
        const now = new Date(2026, 3, 10, 9, 0, 0);
        const state = computeDailyHubState({
            sessions: [
                { fecha: new Date(2026, 1, 27, 18, 0, 0) }
            ],
            routines: [],
            now,
            isOnline: true,
            pendingCount: 0
        });

        expect(state.logsMonthCount).toBe(0);
        expect(state.lastWorkoutDate instanceof Date).toBe(true);
        expect(state.isEmpty).toBe(true);
    });

    it('shows queued sync status while offline when pending operations exist', () => {
        const state = computeDailyHubState({
            sessions: [],
            routines: [],
            now: new Date(2026, 2, 29, 9, 0, 0),
            isOnline: false,
            pendingCount: 3
        });

        expect(state.syncStatus).toContain('Sin conexión');
        expect(state.syncStatus).toContain('3');
    });

    it('updates computed labels after switching to English', () => {
        setLanguage('en', { persist: false, apply: false });
        const state = computeDailyHubState({
            sessions: [],
            routines: [],
            now: new Date(2026, 2, 29, 9, 0, 0),
            isOnline: true,
            pendingCount: 2
        });

        expect(state.syncStatus).toContain('Online');
        expect(state.syncStatus).toContain('2');
        expect(state.routineShortcut).toBe('No routine');
    });

    it('returns datetime-local formatted value', () => {
        const value = toDatetimeLocalValue(new Date(2026, 2, 29, 7, 5, 0));
        expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    });

    it('normalizes weekly target days with clamp and defaults', () => {
        expect(normalizeWeeklyTargetDays(undefined)).toBe(WEEKLY_TARGET_DEFAULT);
        expect(normalizeWeeklyTargetDays('0')).toBe(1);
        expect(normalizeWeeklyTargetDays('8')).toBe(7);
        expect(normalizeWeeklyTargetDays('4')).toBe(4);
    });

    it('computes weekly consistency using distinct active days and qualified-week streaks', () => {
        const now = new Date(2026, 3, 23, 10, 0, 0);
        const currentWeekStart = new Date(now);
        const currentDay = currentWeekStart.getDay();
        const offsetToMonday = currentDay === 0 ? 6 : currentDay - 1;
        currentWeekStart.setDate(currentWeekStart.getDate() - offsetToMonday);
        currentWeekStart.setHours(10, 0, 0, 0);

        const atWeekOffset = (weekOffset, dayOffset, hour = 10) => {
            const date = new Date(currentWeekStart);
            date.setDate(date.getDate() - (weekOffset * 7) + dayOffset);
            date.setHours(hour, 0, 0, 0);
            return date;
        };

        const sessions = [
            // Current week: only 2 distinct active days (not qualified for target=3)
            { fecha: atWeekOffset(0, 0, 8) },
            { fecha: atWeekOffset(0, 2, 9) },
            { fecha: atWeekOffset(0, 2, 18) }, // duplicate same day, should not add a day
            // Previous 2 weeks qualified (3 distinct days each)
            { fecha: atWeekOffset(1, 0) },
            { fecha: atWeekOffset(1, 2) },
            { fecha: atWeekOffset(1, 4) },
            { fecha: atWeekOffset(2, 0) },
            { fecha: atWeekOffset(2, 1) },
            { fecha: atWeekOffset(2, 3) },
            // Week before those is not qualified and should break streaks
            { fecha: atWeekOffset(3, 0) }
        ];

        const metrics = computeWeeklyConsistencyMetrics({
            sessions,
            now,
            weeklyTargetDays: 3
        });

        expect(metrics.weeklyTargetDays).toBe(3);
        expect(metrics.weeklyProgressDays).toBe(2);
        expect(metrics.weeklyProgressLabel).toBe('2/3');
        expect(metrics.weeklyProgressMet).toBe(false);
        expect(metrics.currentWeeklyStreak).toBe(0);
        expect(metrics.bestWeeklyStreak).toBe(2);
    });

    it('recomputes streak metrics when weekly target changes', () => {
        const now = new Date(2026, 3, 23, 10, 0, 0);
        const state = computeDailyHubState({
            sessions: [
                { fecha: new Date(2026, 3, 21, 8, 0, 0) },
                { fecha: new Date(2026, 3, 22, 8, 0, 0) },
                { fecha: new Date(2026, 3, 23, 8, 0, 0) },
                { fecha: new Date(2026, 3, 14, 8, 0, 0) },
                { fecha: new Date(2026, 3, 16, 8, 0, 0) },
                { fecha: new Date(2026, 3, 18, 8, 0, 0) }
            ],
            routines: [],
            now,
            weeklyTargetDays: 3,
            isOnline: true,
            pendingCount: 0
        });

        expect(state.weeklyProgressLabel).toBe('3/3');
        expect(state.weeklyProgressMet).toBe(true);
        expect(state.currentWeeklyStreak).toBe(2);

        const stricterState = computeDailyHubState({
            sessions: [
                { fecha: new Date(2026, 3, 21, 8, 0, 0) },
                { fecha: new Date(2026, 3, 22, 8, 0, 0) },
                { fecha: new Date(2026, 3, 23, 8, 0, 0) },
                { fecha: new Date(2026, 3, 14, 8, 0, 0) },
                { fecha: new Date(2026, 3, 16, 8, 0, 0) },
                { fecha: new Date(2026, 3, 18, 8, 0, 0) }
            ],
            routines: [],
            now,
            weeklyTargetDays: 4,
            isOnline: true,
            pendingCount: 0
        });

        expect(stricterState.weeklyProgressLabel).toBe('3/4');
        expect(stricterState.weeklyProgressMet).toBe(false);
        expect(stricterState.currentWeeklyStreak).toBe(0);
    });

    it('uses week-scoped targets with carry-over across weeks', () => {
        const now = new Date(2026, 3, 23, 10, 0, 0); // Thu Apr 23, 2026
        const currentWeekMonday = new Date(2026, 3, 20, 10, 0, 0);
        const prevWeekMonday = new Date(2026, 3, 13, 10, 0, 0);
        const twoWeeksAgoMonday = new Date(2026, 3, 6, 10, 0, 0);

        const sessions = [
            // Two weeks ago: 2 active days
            { fecha: new Date(2026, 3, 6, 8, 0, 0) },
            { fecha: new Date(2026, 3, 8, 8, 0, 0) },
            // Previous week: 4 active days
            { fecha: new Date(2026, 3, 13, 8, 0, 0) },
            { fecha: new Date(2026, 3, 14, 8, 0, 0) },
            { fecha: new Date(2026, 3, 16, 8, 0, 0) },
            { fecha: new Date(2026, 3, 18, 8, 0, 0) },
            // Current week: 3 active days
            { fecha: new Date(2026, 3, 20, 8, 0, 0) },
            { fecha: new Date(2026, 3, 21, 8, 0, 0) },
            { fecha: new Date(2026, 3, 22, 8, 0, 0) }
        ];

        const metrics = computeWeeklyConsistencyMetrics({
            sessions,
            now,
            weeklyTargetDays: 3,
            weeklyTargetsByWeek: {
                [getWeekKeyForDate(twoWeeksAgoMonday)]: { targetDays: 2, savesUsed: 1 },
                [getWeekKeyForDate(prevWeekMonday)]: { targetDays: 4, savesUsed: 1 }
            }
        });

        // Current week inherits target=4 because there is no current-week override.
        expect(metrics.weeklyTargetDays).toBe(4);
        expect(metrics.weeklyProgressDays).toBe(3);
        expect(metrics.weeklyProgressLabel).toBe('3/4');
        expect(metrics.weeklyProgressMet).toBe(false);
        expect(metrics.currentWeeklyStreak).toBe(0);
        expect(metrics.bestWeeklyStreak).toBe(2);
        expect(getWeekKeyForDate(currentWeekMonday)).toBe(getWeekKeyForDate(now));
    });

    it('uses frozen outcomes for past weeks and ignores backdated-session effects', () => {
        const now = new Date(2026, 3, 23, 10, 0, 0);
        const prevWeekMonday = new Date(2026, 3, 13, 10, 0, 0);

        const metrics = computeWeeklyConsistencyMetrics({
            sessions: [
                // Backdated-heavy previous week data would normally qualify for target=3.
                { fecha: new Date(2026, 3, 13, 8, 0, 0) },
                { fecha: new Date(2026, 3, 14, 8, 0, 0) },
                { fecha: new Date(2026, 3, 15, 8, 0, 0) },
                { fecha: new Date(2026, 3, 16, 8, 0, 0) },
                // Current week has 1 day so far.
                { fecha: new Date(2026, 3, 20, 8, 0, 0) }
            ],
            now,
            weeklyTargetDays: 3,
            weeklyTargetsByWeek: {
                [getWeekKeyForDate(prevWeekMonday)]: { targetDays: 3, savesUsed: 1 }
            },
            weeklyOutcomesByWeek: {
                [getWeekKeyForDate(prevWeekMonday)]: {
                    targetDays: 3,
                    activeDays: 1,
                    met: false
                }
            }
        });

        expect(metrics.weeklyTargetDays).toBe(3);
        expect(metrics.weeklyProgressDays).toBe(1);
        expect(metrics.weeklyProgressLabel).toBe('1/3');
        expect(metrics.weeklyProgressMet).toBe(false);
        // Previous week stays frozen as not-met despite backdated data.
        expect(metrics.currentWeeklyStreak).toBe(0);
    });
});
