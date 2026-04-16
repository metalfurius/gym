import { describe, it, expect, beforeEach } from '@jest/globals';
import {
    buildSessionVariantOverridesStorageKey,
    buildSessionVariantOverrideMapKey,
    readSessionVariantOverrides,
    getSessionVariantOverride,
    saveSessionVariantOverride,
    saveSessionVariantOverrides,
    resolveSessionVariantSelection
} from '../../js/utils/session-variant-overrides.js';

describe('session-variant-overrides utils', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('builds the expected storage key per user id', () => {
        expect(buildSessionVariantOverridesStorageKey('user-123')).toBe(
            'gym-tracker:session-variant-overrides:user-123'
        );
        expect(buildSessionVariantOverridesStorageKey('')).toBeNull();
        expect(buildSessionVariantOverridesStorageKey(null)).toBeNull();
    });

    it('builds normalized map keys for routine and exercise identity', () => {
        expect(buildSessionVariantOverrideMapKey('routine-a', '  Bench   Press ')).toBe('routine-a::bench press');
        expect(buildSessionVariantOverrideMapKey('', 'Bench Press')).toBeNull();
        expect(buildSessionVariantOverrideMapKey('routine-a', '')).toBeNull();
    });

    it('saves and reads a single override entry', () => {
        saveSessionVariantOverride('user-1', 'routine-1', 'Bench Press', {
            executionMode: 'PULLEY',
            loadType: 'BODYWEIGHT'
        });

        const saved = getSessionVariantOverride('user-1', 'routine-1', 'bench press');
        expect(saved).toEqual({
            executionMode: 'pulley',
            loadType: 'bodyweight'
        });

        const raw = readSessionVariantOverrides('user-1');
        expect(raw['routine-1::bench press']).toMatchObject({
            executionMode: 'pulley',
            loadType: 'bodyweight'
        });
    });

    it('saves override batches and normalizes invalid values to defaults', () => {
        const updated = saveSessionVariantOverrides('user-2', [
            {
                routineId: 'routine-2',
                exerciseName: 'Pull Up',
                executionMode: 'one_hand',
                loadType: 'bodyweight'
            },
            {
                routineId: 'routine-2',
                exerciseName: 'Incline Press',
                executionMode: 'invalid-mode',
                loadType: 'invalid-load-type'
            }
        ]);

        expect(updated['routine-2::pull up']).toEqual({
            executionMode: 'one_hand',
            loadType: 'bodyweight'
        });
        expect(updated['routine-2::incline press']).toEqual({
            executionMode: 'two_hand',
            loadType: 'external'
        });
    });

    it('resolves selection precedence as in-progress > local override > routine default', () => {
        const resolvedWithInProgress = resolveSessionVariantSelection({
            inProgressExercise: {
                modoEjecucion: 'machine',
                tipoCarga: 'bodyweight'
            },
            localOverride: {
                executionMode: 'pulley',
                loadType: 'external'
            },
            routineExercise: {
                executionMode: 'two_hand',
                loadType: 'external'
            }
        });

        expect(resolvedWithInProgress).toEqual({
            executionMode: 'machine',
            loadType: 'bodyweight'
        });

        const resolvedWithLocal = resolveSessionVariantSelection({
            inProgressExercise: null,
            localOverride: {
                executionMode: 'one_hand',
                loadType: 'bodyweight'
            },
            routineExercise: {
                executionMode: 'pulley',
                loadType: 'external'
            }
        });

        expect(resolvedWithLocal).toEqual({
            executionMode: 'one_hand',
            loadType: 'bodyweight'
        });

        const resolvedWithDefaults = resolveSessionVariantSelection({
            inProgressExercise: null,
            localOverride: null,
            routineExercise: {
                executionMode: 'invalid',
                loadType: 'invalid'
            }
        });

        expect(resolvedWithDefaults).toEqual({
            executionMode: 'two_hand',
            loadType: 'external'
        });
    });
});
