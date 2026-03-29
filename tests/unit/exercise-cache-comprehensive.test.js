import { describe, it, expect, beforeEach } from '@jest/globals';
import { ExerciseCacheManager } from '../../js/exercise-cache.js';

describe('ExerciseCacheManager - Comprehensive Tests', () => {
    let cacheManager;

    beforeEach(() => {
        localStorage.clear();
        cacheManager = new ExerciseCacheManager();
    });

    describe('addExerciseData', () => {
        it('should add exercise data to cache', () => {
            const sets = [
                { peso: 60, reps: 10 },
                { peso: 65, reps: 8 }
            ];

            cacheManager.addExerciseData('Bench Press', sets);

            const cache = cacheManager.getFullCache();
            const normalizedName = 'bench_press';
            expect(cache[normalizedName]).toBeDefined();
            expect(cache[normalizedName].history).toHaveLength(1);
            expect(cache[normalizedName].history[0].sets).toHaveLength(2);
        });

        it('should not add data with empty exercise name', () => {
            const sets = [{ peso: 60, reps: 10 }];
            cacheManager.addExerciseData('', sets);

            const cache = cacheManager.getFullCache();
            expect(Object.keys(cache)).toHaveLength(0);
        });

        it('should not add data with empty sets', () => {
            cacheManager.addExerciseData('Bench Press', []);

            const cache = cacheManager.getFullCache();
            expect(Object.keys(cache)).toHaveLength(0);
        });

        it('should keep all exercise history (no limit)', () => {
            const sets = [{ peso: 60, reps: 10 }];

            // Add 6 entries (previously limited to 5, now keeping all)
            for (let i = 0; i < 6; i++) {
                cacheManager.addExerciseData('Bench Press', sets, new Date(Date.UTC(2024, 0, i + 1)));
            }

            const history = cacheManager.getExerciseHistory('Bench Press');
            expect(history).toHaveLength(6); // Should keep all entries for progress charts
        });

        it('should add most recent data at the beginning', () => {
            const oldSets = [{ peso: 60, reps: 10 }];
            const newSets = [{ peso: 70, reps: 8 }];

            cacheManager.addExerciseData('Bench Press', oldSets, new Date(Date.UTC(2024, 0, 1)));
            cacheManager.addExerciseData('Bench Press', newSets, new Date(Date.UTC(2024, 0, 2)));

            const history = cacheManager.getExerciseHistory('Bench Press');
            expect(history[0].sets[0].peso).toBe(70); // Most recent should be first
            expect(history[1].sets[0].peso).toBe(60);
        });

        it('should separate history by execution mode for the same exercise name', () => {
            cacheManager.addExerciseData('Bench Press', [{ peso: 50, reps: 12 }], new Date(), 'one_hand');
            cacheManager.addExerciseData('Bench Press', [{ peso: 75, reps: 8 }], new Date(), 'two_hand');

            const oneHandHistory = cacheManager.getExerciseHistory('Bench Press', 'one_hand');
            const twoHandHistory = cacheManager.getExerciseHistory('Bench Press', 'two_hand');
            const otherHistory = cacheManager.getExerciseHistory('Bench Press', 'other');

            expect(oneHandHistory).toHaveLength(1);
            expect(oneHandHistory[0].sets[0].peso).toBe(50);
            expect(twoHandHistory).toHaveLength(1);
            expect(twoHandHistory[0].sets[0].peso).toBe(75);
            expect(otherHistory).toHaveLength(0);
        });

        it('should separate history by load type and persist total load for bodyweight sets', () => {
            cacheManager.addExerciseData(
                'Pull Up',
                [{ peso: -12, reps: 8, pesoTotal: 63 }],
                new Date(),
                'two_hand',
                'bodyweight'
            );
            cacheManager.addExerciseData(
                'Pull Up',
                [{ peso: 20, reps: 8 }],
                new Date(),
                'two_hand',
                'external'
            );

            const bodyweightHistory = cacheManager.getExerciseHistory('Pull Up', 'two_hand', 'bodyweight');
            const externalHistory = cacheManager.getExerciseHistory('Pull Up', 'two_hand', 'external');

            expect(bodyweightHistory).toHaveLength(1);
            expect(bodyweightHistory[0].sets[0].peso).toBe(-12);
            expect(bodyweightHistory[0].sets[0].pesoTotal).toBe(63);
            expect(externalHistory).toHaveLength(1);
            expect(externalHistory[0].sets[0].peso).toBe(20);
        });
    });

    describe('getExerciseSuggestions', () => {
        it('should return no suggestions for non-existent exercise', () => {
            const suggestions = cacheManager.getExerciseSuggestions('Non-existent');

            expect(suggestions.hasHistory).toBe(false);
            expect(suggestions.suggestions).toBeNull();
            expect(suggestions.lastSessionDate).toBeNull();
        });

        it('should return suggestions based on last exercise data', () => {
            const sets = [
                { peso: 60, reps: 10 },
                { peso: 65, reps: 8 },
                { peso: 70, reps: 6 }
            ];

            cacheManager.addExerciseData('Bench Press', sets, new Date(Date.now() - 1000 * 60 * 60 * 24)); // 1 day ago

            const suggestions = cacheManager.getExerciseSuggestions('Bench Press');

            expect(suggestions.hasHistory).toBe(true);
            expect(suggestions.suggestions).toBeDefined();
            expect(suggestions.suggestions.peso).toBe(70); // Max weight
            expect(suggestions.suggestions.reps).toBe(8); // Avg reps: (10+8+6)/3 = 8
            expect(suggestions.daysSinceLastSession).toBe(1);
        });

        it('should calculate max weight correctly', () => {
            const sets = [
                { peso: 60, reps: 10 },
                { peso: 80, reps: 5 },
                { peso: 65, reps: 8 }
            ];

            cacheManager.addExerciseData('Squats', sets);
            const suggestions = cacheManager.getExerciseSuggestions('Squats');

            expect(suggestions.suggestions.peso).toBe(80);
        });

        it('should calculate average reps correctly', () => {
            const sets = [
                { peso: 60, reps: 12 },
                { peso: 60, reps: 10 },
                { peso: 60, reps: 8 }
            ];

            cacheManager.addExerciseData('Curls', sets);
            const suggestions = cacheManager.getExerciseSuggestions('Curls');

            expect(suggestions.suggestions.reps).toBe(10); // (12+10+8)/3 = 10
        });

        it('should return mode-specific suggestions for the same exercise', () => {
            cacheManager.addExerciseData('Lateral Raise', [{ peso: 12, reps: 12 }], new Date(), 'one_hand');
            cacheManager.addExerciseData('Lateral Raise', [{ peso: 20, reps: 10 }], new Date(), 'machine');

            const oneHandSuggestions = cacheManager.getExerciseSuggestions('Lateral Raise', 'one_hand');
            const machineSuggestions = cacheManager.getExerciseSuggestions('Lateral Raise', 'machine');

            expect(oneHandSuggestions.hasHistory).toBe(true);
            expect(oneHandSuggestions.suggestions.peso).toBe(12);
            expect(machineSuggestions.hasHistory).toBe(true);
            expect(machineSuggestions.suggestions.peso).toBe(20);
        });
    });

    describe('normalizeExerciseName', () => {
        it('should normalize exercise names consistently', () => {
            const normalized1 = cacheManager.normalizeExerciseName('Bench Press');
            const normalized2 = cacheManager.normalizeExerciseName('bench press');
            const normalized3 = cacheManager.normalizeExerciseName('  BENCH PRESS  ');

            expect(normalized1).toBe(normalized2);
            expect(normalized2).toBe(normalized3);
            expect(normalized1).toBe('bench_press');
        });

        it('should remove punctuation', () => {
            const normalized = cacheManager.normalizeExerciseName('Barbell Bench-Press (Wide)');
            expect(normalized).toBe('barbell_benchpress_wide');
        });

        it('should replace spaces with underscores', () => {
            const normalized = cacheManager.normalizeExerciseName('Dumbbell Chest Fly');
            expect(normalized).toBe('dumbbell_chest_fly');
        });
    });

    describe('processCompletedSession', () => {
        it('should process session with ejercicios', () => {
            const sessionData = {
                fecha: new Date(),
                ejercicios: [
                    {
                        nombreEjercicio: 'Bench Press',
                        tipoEjercicio: 'strength',
                        modoEjecucion: 'pulley',
                        tipoCarga: 'bodyweight',
                        sets: [{ peso: -10, reps: 10, pesoTotal: 68 }]
                    }
                ]
            };

            expect(() => cacheManager.processCompletedSession(sessionData)).not.toThrow();
            const history = cacheManager.getExerciseHistory('Bench Press', 'pulley', 'bodyweight');
            expect(history).toHaveLength(1);
            expect(history[0].sets[0].pesoTotal).toBe(68);
        });

        it('should handle session without ejercicios', () => {
            const sessionData = {
                fecha: new Date()
            };

            // This should return early and not throw
            expect(() => cacheManager.processCompletedSession(sessionData)).not.toThrow();
      
            const cache = cacheManager.getFullCache();
            expect(Object.keys(cache)).toHaveLength(0);
        });
    });
});
