import { describe, it, expect, jest } from '@jest/globals';
import {
    QUICK_LOG_DEFAULT_LABEL,
    splitQuickLogNotes,
    normalizeQuickLogDate,
    normalizeQuickLogPayload,
    buildQuickLogSessionModel,
    computeDailyHubState,
    toDatetimeLocalValue
} from '../../js/utils/quick-log.js';

describe('quick-log utils', () => {
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
        expect(state.syncStatus).toBe('En linea');
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

    it('shows queued sync status while offline when pending operations exist', () => {
        const state = computeDailyHubState({
            sessions: [],
            routines: [],
            now: new Date(2026, 2, 29, 9, 0, 0),
            isOnline: false,
            pendingCount: 3
        });

        expect(state.syncStatus).toContain('Sin conexion');
        expect(state.syncStatus).toContain('3');
    });

    it('returns datetime-local formatted value', () => {
        const value = toDatetimeLocalValue(new Date(2026, 2, 29, 7, 5, 0));
        expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    });
});
