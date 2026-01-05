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

    it('should limit history to max entries', () => {
      const sets = [{ peso: 60, reps: 10 }];

      // Add 6 entries (more than maxExerciseHistory which is 5)
      for (let i = 0; i < 6; i++) {
        cacheManager.addExerciseData('Bench Press', sets, new Date(2024, 0, i + 1));
      }

      const history = cacheManager.getExerciseHistory('Bench Press');
      expect(history).toHaveLength(5); // Should be limited to 5
    });

    it('should add most recent data at the beginning', () => {
      const oldSets = [{ peso: 60, reps: 10 }];
      const newSets = [{ peso: 70, reps: 8 }];

      cacheManager.addExerciseData('Bench Press', oldSets, new Date(2024, 0, 1));
      cacheManager.addExerciseData('Bench Press', newSets, new Date(2024, 0, 2));

      const history = cacheManager.getExerciseHistory('Bench Press');
      expect(history[0].sets[0].peso).toBe(70); // Most recent should be first
      expect(history[1].sets[0].peso).toBe(60);
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
            sets: [{ peso: 60, reps: 10 }]
          }
        ]
      };

      // This should not throw
      expect(() => cacheManager.processCompletedSession(sessionData)).not.toThrow();
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
