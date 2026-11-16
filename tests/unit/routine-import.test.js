import { beforeEach, describe, expect, it } from '@jest/globals';
import {
    getFirestore,
    __resetMockFirestoreBehavior,
    __setMockBatchCommitFailureOnCall,
} from '../mocks/firebase-firestore.js';
import { __getMockCollectionDocuments, __resetMockFirebase } from '../mocks/firebase-state.js';
import {
    RoutineImportError,
    parseRoutineImport,
    prepareRoutineImport,
    commitNextRoutineImportBatch,
    pendingRoutineImportJson,
} from '../../js/utils/routine-import.js';

const db = getFirestore();
const routine = {
    id: 'original-id',
    name: 'Fuerza',
    exercises: [
        {
            name: 'Press',
            type: 'strength',
            sets: 3,
            reps: '8-10',
            notes: 'Lento',
            executionMode: 'one_hand',
            loadType: 'bodyweight',
        },
        { name: 'Carrera', type: 'cardio', sets: '', reps: '', duration: '20 min', notes: '' },
    ],
    createdAt: '2025-02-01T10:20:30.000Z',
    updatedAt: '2025-03-01T10:20:30.000Z',
};

function exportText(routines = [routine]) {
    return JSON.stringify({ exportDate: '2025-03-02T00:00:00.000Z', totalRoutines: routines.length, routines });
}

describe('routine JSON import', () => {
    beforeEach(() => {
        __resetMockFirebase();
        __resetMockFirestoreBehavior();
    });

    it('accepts current exports, empty exercise lists and older optional exercise fields', () => {
        const legacy = {
            name: 'Borrador',
            exercises: [{ name: 'Sentadilla', type: 'strength', sets: 3 }],
            createdAt: null,
        };
        const payload = parseRoutineImport(exportText([routine, { name: 'Vacía', exercises: [] }, legacy]));
        expect(payload.routines).toEqual([routine, { name: 'Vacía', exercises: [] }, legacy]);
    });

    it.each([
        ['', 'empty'],
        ['{', 'json'],
        ['[]', 'format'],
        ['{}', 'format'],
        ['{"routines":[]}', 'no_routines'],
        [exportText([{ name: '', exercises: [] }]), 'routine'],
        [exportText([{ name: 'A', exercises: {} }]), 'routine'],
        [exportText([{ name: 'A', exercises: [null] }]), 'exercise'],
        [exportText([{ name: 'A', exercises: [{ name: ' ' }] }]), 'exercise'],
        [exportText([{ name: 'A', exercises: [], createdAt: '2025-02-30T10:00:00.000Z' }]), 'date'],
        [exportText([{ name: 'A', exercises: [], updatedAt: 'not a date' }]), 'date'],
    ])('rejects invalid input before any write (%s)', (text, code) => {
        try {
            parseRoutineImport(text);
            throw new Error('Expected validation to fail');
        } catch (error) {
            expect(error).toBeInstanceOf(RoutineImportError);
            expect(error.code).toBe(code);
        }
        expect(__getMockCollectionDocuments('users/user-1/routines')).toHaveLength(0);
    });

    it('validates all routines before any of them are written', () => {
        const input = exportText([routine, { name: 'Malformada', exercises: [{}] }]);
        try {
            parseRoutineImport(input);
            throw new Error('Expected validation to fail');
        } catch (error) {
            expect(error).toBeInstanceOf(RoutineImportError);
            expect(error.code).toBe('exercise');
            expect(error.details).toEqual({ routine: 2, exercise: 1 });
        }
        expect(__getMockCollectionDocuments('users/user-1/routines')).toHaveLength(0);
    });

    it('creates new IDs and preserves exercises and dates when saving', async () => {
        const payload = parseRoutineImport(
            exportText([routine, { name: 'Sin fecha', exercises: [], createdAt: null, updatedAt: null }])
        );
        const operation = prepareRoutineImport(db, 'user-1', payload);
        expect(operation.entries[0].ref.id).not.toBe(routine.id);
        expect(operation.entries[0].ref.id).not.toBe(operation.entries[1].ref.id);
        expect(await commitNextRoutineImportBatch(db, operation)).toBe(2);

        const saved = __getMockCollectionDocuments('users/user-1/routines');
        expect(saved).toHaveLength(2);
        const first = saved.find(entry => entry.id === operation.entries[0].ref.id).data;
        expect(first.exercises).toEqual(routine.exercises);
        expect(first.createdAt.toDate().toISOString()).toBe(routine.createdAt);
        expect(first.updatedAt.toDate().toISOString()).toBe(routine.updatedAt);
        const second = saved.find(entry => entry.id === operation.entries[1].ref.id).data;
        expect(second.createdAt.toDate()).toBeInstanceOf(Date);
        expect(second.updatedAt.toDate()).toBeInstanceOf(Date);
    });

    it('retries only the failed batch with the same new IDs and exposes the remaining export', async () => {
        const routines = Array.from({ length: 101 }, (_, index) => ({ name: `Rutina ${index}`, exercises: [] }));
        const operation = prepareRoutineImport(db, 'user-1', parseRoutineImport(exportText(routines)));
        const lastId = operation.entries[100].ref.id;
        __setMockBatchCommitFailureOnCall(2);

        expect(await commitNextRoutineImportBatch(db, operation)).toBe(100);
        await expect(commitNextRoutineImportBatch(db, operation)).rejects.toThrow('Batch commit failed');
        expect(operation.nextIndex).toBe(100);
        const remaining = JSON.parse(pendingRoutineImportJson(operation));
        expect(remaining.totalRoutines).toBe(1);
        expect(remaining.routines).toEqual([routines[100]]);
        expect(__getMockCollectionDocuments('users/user-1/routines')).toHaveLength(100);

        expect(await commitNextRoutineImportBatch(db, operation)).toBe(1);
        const saved = __getMockCollectionDocuments('users/user-1/routines');
        expect(saved).toHaveLength(101);
        expect(saved.some(entry => entry.id === lastId && entry.data.name === 'Rutina 100')).toBe(true);
    });
});
