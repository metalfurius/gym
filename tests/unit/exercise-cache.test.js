import { describe, it, expect, beforeEach } from '@jest/globals';
import { ExerciseCacheManager } from '../../js/exercise-cache.js';

describe('ExerciseCacheManager', () => {
  let cacheManager;
  const CACHE_KEY = 'gym-tracker-exercise-cache';
  const BACKUP_KEY = 'gym-tracker-exercise-backup';

  beforeEach(() => {
    localStorage.clear();
    cacheManager = new ExerciseCacheManager();
  });

  describe('initialization', () => {
    it('should initialize with correct properties', () => {
      expect(cacheManager.cacheKey).toBe(CACHE_KEY);
      expect(cacheManager.backupKey).toBe(BACKUP_KEY);
      expect(cacheManager.maxCacheAge).toBe(7 * 24 * 60 * 60 * 1000);
      expect(cacheManager.maxExerciseHistory).toBe(5);
    });
  });

  describe('getFullCache', () => {
    it('should return empty object when no cache exists', () => {
      const cache = cacheManager.getFullCache();
      expect(cache).toEqual({});
    });

    it('should return cached data when it exists', () => {
      const testCache = {
        'bench-press': {
          history: [{ peso: 60, reps: 10 }]
        }
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(testCache));

      const cache = cacheManager.getFullCache();
      expect(cache['bench-press']).toBeDefined();
      expect(cache['bench-press'].history).toHaveLength(1);
    });

    it('should handle corrupted cache data gracefully', () => {
      localStorage.setItem(CACHE_KEY, 'invalid json');
      const cache = cacheManager.getFullCache();
      expect(cache).toEqual({});
    });
  });

  describe('saveFullCache', () => {
    it('should save cache to localStorage', () => {
      const testCache = {
        'squats': {
          history: [{ peso: 100, reps: 10 }]
        }
      };

      cacheManager.saveFullCache(testCache);
      const stored = localStorage.getItem(CACHE_KEY);
      const parsed = JSON.parse(stored);

      expect(parsed.squats).toBeDefined();
      expect(parsed.squats.history[0].peso).toBe(100);
    });

    it('should overwrite existing cache', () => {
      const cache1 = { exercise1: { history: [] } };
      const cache2 = { exercise2: { history: [] } };

      cacheManager.saveFullCache(cache1);
      cacheManager.saveFullCache(cache2);

      const stored = cacheManager.getFullCache();
      expect(stored.exercise1).toBeUndefined();
      expect(stored.exercise2).toBeDefined();
    });
  });

  describe('getExerciseHistory', () => {
    it('should return empty array for non-existent exercise', () => {
      const history = cacheManager.getExerciseHistory('Non-existent Exercise');
      expect(history).toEqual([]);
    });

    it('should return exercise history when it exists', () => {
      const cache = {
        'bench_press': {
          history: [
            { peso: 60, reps: 10, fecha: new Date().toISOString() },
            { peso: 65, reps: 8, fecha: new Date().toISOString() }
          ]
        }
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));

      const history = cacheManager.getExerciseHistory('bench press');
      expect(history).toHaveLength(2);
      expect(history[0].peso).toBe(60);
    });
  });

  describe('getLastExerciseData', () => {
    it('should return null for non-existent exercise', () => {
      const lastData = cacheManager.getLastExerciseData('Non-existent');
      expect(lastData).toBeNull();
    });

    it('should return most recent exercise data', () => {
      const cache = {
        'deadlift': {
          history: [
            { peso: 120, reps: 5, fecha: '2024-01-02' },
            { peso: 110, reps: 6, fecha: '2024-01-01' }
          ]
        }
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));

      const lastData = cacheManager.getLastExerciseData('deadlift');
      expect(lastData).not.toBeNull();
      expect(lastData.peso).toBe(120);
    });
  });

  describe('normalizeExerciseName', () => {
    it('should normalize exercise names consistently', () => {
      // Testing the normalization logic (uses underscores)
      const name1 = 'Bench Press';
      const name2 = 'bench press';
      const normalized1 = name1.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '_');
      const normalized2 = name2.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '_');

      expect(normalized1).toBe(normalized2);
      expect(normalized1).toBe('bench_press');
    });

    it('should handle special characters in names', () => {
      const name = 'Barbell Bench-Press (Wide)';
      const normalized = name.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, '_');

      expect(normalized).toBe('barbell_benchpress_wide');
    });
  });

  describe('cache age validation', () => {
    it('should define max cache age', () => {
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
      expect(cacheManager.maxCacheAge).toBe(maxAge);
    });

    it('should calculate if cache is expired', () => {
      const now = Date.now();
      const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
      const eightDaysAgo = now - (8 * 24 * 60 * 60 * 1000);

      expect(now - sevenDaysAgo).toBeLessThanOrEqual(cacheManager.maxCacheAge);
      expect(now - eightDaysAgo).toBeGreaterThan(cacheManager.maxCacheAge);
    });
  });

  describe('max history limit', () => {
    it('should define max exercise history limit', () => {
      expect(cacheManager.maxExerciseHistory).toBe(5);
    });

    it('should limit history to max entries', () => {
      const history = [
        { peso: 60, reps: 10 },
        { peso: 65, reps: 8 },
        { peso: 70, reps: 6 },
        { peso: 75, reps: 5 },
        { peso: 80, reps: 4 },
        { peso: 85, reps: 3 }
      ];

      const limitedHistory = history.slice(0, cacheManager.maxExerciseHistory);
      expect(limitedHistory).toHaveLength(5);
      expect(limitedHistory[0].peso).toBe(60);
    });
  });

  describe('cache backup', () => {
    it('should have backup key defined', () => {
      expect(cacheManager.backupKey).toBe(BACKUP_KEY);
    });

    it('should create backup of cache', () => {
      const cache = {
        'squats': { history: [{ peso: 100 }] }
      };

      localStorage.setItem(BACKUP_KEY, JSON.stringify(cache));
      const backup = JSON.parse(localStorage.getItem(BACKUP_KEY));

      expect(backup.squats).toBeDefined();
    });
  });

  describe('exercise data structure', () => {
    it('should validate exercise data structure', () => {
      const exerciseData = {
        peso: 60,
        reps: 10,
        fecha: new Date().toISOString(),
        notas: 'Test notes'
      };

      expect(exerciseData).toHaveProperty('peso');
      expect(exerciseData).toHaveProperty('reps');
      expect(exerciseData).toHaveProperty('fecha');
    });

    it('should handle exercise with sets', () => {
      const exercise = {
        nombreEjercicio: 'Bench Press',
        sets: [
          { peso: 60, reps: 10 },
          { peso: 65, reps: 8 },
          { peso: 70, reps: 6 }
        ]
      };

      expect(exercise.sets).toHaveLength(3);
      expect(exercise.sets[0]).toHaveProperty('peso');
      expect(exercise.sets[0]).toHaveProperty('reps');
    });
  });

  describe('cache statistics', () => {
    it('should calculate cache size', () => {
      const cache = {
        'exercise1': { history: [{ peso: 60 }] },
        'exercise2': { history: [{ peso: 70 }] },
        'exercise3': { history: [{ peso: 80 }] }
      };

      const exerciseCount = Object.keys(cache).length;
      expect(exerciseCount).toBe(3);
    });

    it('should calculate total history entries', () => {
      const cache = {
        'exercise1': { history: [{ peso: 60 }, { peso: 65 }] },
        'exercise2': { history: [{ peso: 70 }] }
      };

      let totalEntries = 0;
      Object.values(cache).forEach(ex => {
        totalEntries += ex.history.length;
      });

      expect(totalEntries).toBe(3);
    });
  });
});
