import { describe, it, expect } from '@jest/globals';
import {
    serializeRoutineForCache,
    deserializeRoutineFromCache,
    serializeSessionForCache,
    deserializeSessionFromCache,
    serializeActivityMap,
    deserializeActivityMap,
    fromDbToSessionModel,
    fromAppToSessionDbModel
} from '../../js/utils/firestore-serialization.js';

describe('firestore-serialization', () => {
    it('serializes and deserializes routines with timestamp-like values', () => {
        const createdAt = { toDate: () => new Date('2026-03-01T10:00:00.000Z') };
        const updatedAt = { toDate: () => new Date('2026-03-02T10:00:00.000Z') };
        const routine = {
            id: 'r-1',
            name: 'Push',
            exercises: [{ name: 'Bench' }],
            createdAt,
            updatedAt
        };

        const cached = serializeRoutineForCache(routine);
        expect(cached.createdAtIso).toBe('2026-03-01T10:00:00.000Z');
        expect(cached.updatedAtIso).toBe('2026-03-02T10:00:00.000Z');

        const hydrated = deserializeRoutineFromCache(cached);
        expect(hydrated.createdAt.toDate().toISOString()).toBe('2026-03-01T10:00:00.000Z');
        expect(hydrated.updatedAt.toDate().toISOString()).toBe('2026-03-02T10:00:00.000Z');
    });

    it('serializes and deserializes sessions via fechaIso', () => {
        const session = {
            id: 's-1',
            fecha: { toDate: () => new Date('2026-03-03T15:30:00.000Z') },
            ejercicios: []
        };

        const cached = serializeSessionForCache(session);
        expect(cached.fechaIso).toBe('2026-03-03T15:30:00.000Z');

        const hydrated = deserializeSessionFromCache(cached);
        expect(hydrated.fecha.toDate().toISOString()).toBe('2026-03-03T15:30:00.000Z');
    });

    it('serializes and deserializes activity maps', () => {
        const activityMap = new Map([
            ['2026-03-01', 2],
            ['2026-03-02', 1]
        ]);

        const serialized = serializeActivityMap(activityMap);
        expect(serialized).toEqual({ '2026-03-01': 2, '2026-03-02': 1 });

        const restored = deserializeActivityMap(serialized);
        expect(restored).toBeInstanceOf(Map);
        expect(restored.get('2026-03-01')).toBe(2);
    });

    it('normalizes legacy Firestore session fields into canonical session model', () => {
        const raw = {
            fechaIso: '2026-03-04T08:00:00.000Z',
            rutinaId: 'routine-legacy',
            dia: 'Legacy Day',
            userWeight: '74.5',
            ejercicios: [
                {
                    name: 'Bench Press',
                    type: 'strength',
                    targetSets: 4,
                    targetReps: '8-10',
                    notes: 'Good session',
                    sets: [{ weight: '80', repeticiones: '8', restTime: '01:30' }]
                }
            ]
        };

        const normalized = fromDbToSessionModel(raw);

        expect(normalized.routineId).toBe('routine-legacy');
        expect(normalized.nombreEntrenamiento).toBe('Legacy Day');
        expect(normalized.pesoUsuario).toBe(74.5);
        expect(normalized.fecha.toDate().toISOString()).toBe('2026-03-04T08:00:00.000Z');
        expect(normalized.ejercicios[0]).toEqual({
            nombreEjercicio: 'Bench Press',
            tipoEjercicio: 'strength',
            objetivoSets: 4,
            objetivoReps: '8-10',
            objetivoDuracion: null,
            notasEjercicio: 'Good session',
            sets: [{ peso: 80, reps: 8, tiempoDescanso: '01:30' }]
        });
    });

    it('serializes app session model into canonical Firestore contract with schemaVersion', () => {
        const model = {
            fechaIso: '2026-03-05T08:00:00.000Z',
            routineId: 'routine-new',
            userId: 'u-1',
            diaEntrenamiento: 'Pull Day',
            pesoUsuario: '75.2',
            ejercicios: [
                {
                    ejercicio: 'Rows',
                    tipo: 'strength',
                    targetSets: 3,
                    targetReps: '10',
                    notes: 'Keep form',
                    sets: [{ weight: 60, repeticiones: 10, restTime: '01:00' }]
                }
            ]
        };

        const wire = fromAppToSessionDbModel(model, { schemaVersion: 2 });

        expect(wire.schemaVersion).toBe(2);
        expect(wire.nombreEntrenamiento).toBe('Pull Day');
        expect(wire.pesoUsuario).toBe(75.2);
        expect(wire.fecha.toDate().toISOString()).toBe('2026-03-05T08:00:00.000Z');
        expect(wire.ejercicios[0]).toEqual({
            nombreEjercicio: 'Rows',
            tipoEjercicio: 'strength',
            objetivoSets: 3,
            objetivoReps: '10',
            objetivoDuracion: null,
            notasEjercicio: 'Keep form',
            sets: [{ peso: 60, reps: 10, tiempoDescanso: '01:00' }]
        });
    });
});
