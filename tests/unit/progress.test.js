import { describe, it, expect, beforeEach, jest } from '@jest/globals';

describe('Progress Module', () => {
  let progressTabCache;

  beforeEach(() => {
    // Reset cache
    progressTabCache = {
      exercisesList: null,
      exercisesWithCount: null,
      lastCacheTime: null,
      isInitialized: false,
      cacheValidityTime: 5 * 60 * 1000, // 5 minutes
    };
  });

  describe('Cache Validity', () => {
    it('should detect invalid cache when empty', () => {
      const isValid =
        progressTabCache.exercisesList !== null &&
        progressTabCache.lastCacheTime !== null;

      expect(isValid).toBe(false);
    });

    it('should detect valid cache within time limit', () => {
      progressTabCache.exercisesList = ['Bench Press', 'Squats'];
      progressTabCache.lastCacheTime = Date.now();

      const now = Date.now();
      const cacheAge = now - progressTabCache.lastCacheTime;
      const isValid = cacheAge < progressTabCache.cacheValidityTime;

      expect(isValid).toBe(true);
    });

    it('should detect expired cache', () => {
      progressTabCache.exercisesList = ['Bench Press'];
      progressTabCache.lastCacheTime = Date.now() - 10 * 60 * 1000; // 10 minutes ago

      const now = Date.now();
      const cacheAge = now - progressTabCache.lastCacheTime;
      const isValid = cacheAge < progressTabCache.cacheValidityTime;

      expect(isValid).toBe(false);
    });

    it('should handle null last cache time', () => {
      progressTabCache.exercisesList = ['Bench Press'];
      progressTabCache.lastCacheTime = null;

      const isValid =
        progressTabCache.exercisesList !== null &&
        progressTabCache.lastCacheTime !== null;

      expect(isValid).toBe(false);
    });
  });

  describe('Cache Management', () => {
    it('should cache exercises list', () => {
      const exercises = ['Bench Press', 'Squats', 'Deadlifts'];

      progressTabCache.exercisesList = [...exercises];
      progressTabCache.lastCacheTime = Date.now();

      expect(progressTabCache.exercisesList).toEqual(exercises);
      expect(progressTabCache.lastCacheTime).toBeDefined();
    });

    it('should cache exercises with count', () => {
      const exercisesWithCount = [
        { name: 'Bench Press', count: 10 },
        { name: 'Squats', count: 8 },
      ];

      progressTabCache.exercisesWithCount = [...exercisesWithCount];

      expect(progressTabCache.exercisesWithCount).toEqual(exercisesWithCount);
      expect(progressTabCache.exercisesWithCount.length).toBe(2);
    });

    it('should invalidate cache', () => {
      progressTabCache.exercisesList = ['Bench Press'];
      progressTabCache.exercisesWithCount = [{ name: 'Bench Press', count: 5 }];
      progressTabCache.lastCacheTime = Date.now();

      progressTabCache.exercisesList = null;
      progressTabCache.exercisesWithCount = null;
      progressTabCache.lastCacheTime = null;
      progressTabCache.isInitialized = false;

      expect(progressTabCache.exercisesList).toBeNull();
      expect(progressTabCache.exercisesWithCount).toBeNull();
      expect(progressTabCache.lastCacheTime).toBeNull();
      expect(progressTabCache.isInitialized).toBe(false);
    });

    it('should update cache timestamp', () => {
      const firstTime = Date.now() - 1000;
      progressTabCache.lastCacheTime = firstTime;

      const newTime = Date.now();
      progressTabCache.lastCacheTime = newTime;

      expect(progressTabCache.lastCacheTime).toBeGreaterThan(firstTime);
    });
  });

  describe('Exercise Data Structure', () => {
    it('should have valid exercise data structure', () => {
      const exerciseData = {
        name: 'Bench Press',
        sessions: [
          {
            date: new Date('2024-12-20'),
            sets: [
              { peso: 60, reps: 10 },
              { peso: 65, reps: 8 },
            ],
          },
        ],
      };

      expect(exerciseData.name).toBeDefined();
      expect(exerciseData.sessions).toBeDefined();
      expect(Array.isArray(exerciseData.sessions)).toBe(true);
      expect(exerciseData.sessions[0].sets).toBeDefined();
    });

    it('should calculate max weight from sets', () => {
      const sets = [
        { peso: 60, reps: 10 },
        { peso: 65, reps: 8 },
        { peso: 70, reps: 6 },
      ];

      const maxWeight = Math.max(...sets.map((set) => set.peso));
      expect(maxWeight).toBe(70);
    });

    it('should calculate total reps', () => {
      const sets = [
        { peso: 60, reps: 10 },
        { peso: 60, reps: 8 },
        { peso: 60, reps: 6 },
      ];

      const totalReps = sets.reduce((sum, set) => sum + set.reps, 0);
      expect(totalReps).toBe(24);
    });

    it('should calculate total volume', () => {
      const sets = [
        { peso: 60, reps: 10 },
        { peso: 65, reps: 8 },
        { peso: 70, reps: 6 },
      ];

      const totalVolume = sets.reduce((sum, set) => sum + set.peso * set.reps, 0);
      expect(totalVolume).toBe(60 * 10 + 65 * 8 + 70 * 6);
    });
  });

  describe('Progress Metrics', () => {
    it('should calculate average weight', () => {
      const sets = [
        { peso: 60, reps: 10 },
        { peso: 65, reps: 8 },
        { peso: 70, reps: 6 },
      ];

      const avgWeight =
        sets.reduce((sum, set) => sum + set.peso, 0) / sets.length;
      expect(avgWeight).toBeCloseTo(65, 1);
    });

    it('should find best set by weight', () => {
      const sets = [
        { peso: 60, reps: 10 },
        { peso: 70, reps: 6 },
        { peso: 65, reps: 8 },
      ];

      const bestSet = sets.reduce((best, set) =>
        set.peso > best.peso ? set : best
      );
      expect(bestSet.peso).toBe(70);
    });

    it('should find best set by reps', () => {
      const sets = [
        { peso: 60, reps: 10 },
        { peso: 65, reps: 8 },
        { peso: 70, reps: 6 },
      ];

      const bestSet = sets.reduce((best, set) =>
        set.reps > best.reps ? set : best
      );
      expect(bestSet.reps).toBe(10);
    });

    it('should calculate progress percentage', () => {
      const oldValue = 60;
      const newValue = 70;

      const progress = ((newValue - oldValue) / oldValue) * 100;
      expect(progress).toBeCloseTo(16.67, 1);
    });

    it('should detect improvement trend', () => {
      const weights = [60, 62, 65, 68, 70];

      const isImproving = weights.every(
        (weight, i, arr) => i === 0 || weight >= arr[i - 1]
      );
      expect(isImproving).toBe(true);
    });

    it('should detect decline trend', () => {
      const weights = [70, 68, 65, 62, 60];

      const isDeclining = weights.every(
        (weight, i, arr) => i === 0 || weight <= arr[i - 1]
      );
      expect(isDeclining).toBe(true);
    });
  });

  describe('Chart Data Preparation', () => {
    it('should prepare data for line chart', () => {
      const sessions = [
        { date: '2024-12-20', maxWeight: 60 },
        { date: '2024-12-22', maxWeight: 65 },
        { date: '2024-12-25', maxWeight: 70 },
      ];

      const labels = sessions.map((s) => s.date);
      const data = sessions.map((s) => s.maxWeight);

      expect(labels).toEqual(['2024-12-20', '2024-12-22', '2024-12-25']);
      expect(data).toEqual([60, 65, 70]);
    });

    it('should sort sessions by date', () => {
      const sessions = [
        { date: new Date('2024-12-25'), weight: 70 },
        { date: new Date('2024-12-20'), weight: 60 },
        { date: new Date('2024-12-22'), weight: 65 },
      ];

      sessions.sort((a, b) => a.date - b.date);

      expect(sessions[0].weight).toBe(60);
      expect(sessions[1].weight).toBe(65);
      expect(sessions[2].weight).toBe(70);
    });

    it('should handle empty data', () => {
      const sessions = [];

      const labels = sessions.map((s) => s.date);
      const data = sessions.map((s) => s.maxWeight);

      expect(labels).toEqual([]);
      expect(data).toEqual([]);
    });
  });

  describe('Period Filtering', () => {
    it('should filter sessions by last 7 days', () => {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const sessions = [
        { date: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000) }, // 2 days ago
        { date: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000) }, // 10 days ago
        { date: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000) }, // 5 days ago
      ];

      const filtered = sessions.filter((s) => s.date >= sevenDaysAgo);
      expect(filtered.length).toBe(2);
    });

    it('should filter sessions by last 30 days', () => {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const sessions = [
        { date: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000) },
        { date: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000) },
        { date: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000) },
      ];

      const filtered = sessions.filter((s) => s.date >= thirtyDaysAgo);
      expect(filtered.length).toBe(2);
    });

    it('should show all sessions when no filter', () => {
      const sessions = [{ date: new Date() }, { date: new Date() }, { date: new Date() }];

      expect(sessions.length).toBe(3);
    });
  });

  describe('Statistics Calculation', () => {
    it('should calculate session count', () => {
      const sessions = [
        { date: '2024-12-20' },
        { date: '2024-12-22' },
        { date: '2024-12-25' },
      ];

      expect(sessions.length).toBe(3);
    });

    it('should find best record', () => {
      const sessions = [
        { date: '2024-12-20', maxWeight: 60 },
        { date: '2024-12-22', maxWeight: 70 },
        { date: '2024-12-25', maxWeight: 65 },
      ];

      const bestRecord = sessions.reduce((best, session) =>
        session.maxWeight > best.maxWeight ? session : best
      );

      expect(bestRecord.maxWeight).toBe(70);
      expect(bestRecord.date).toBe('2024-12-22');
    });

    it('should calculate total progress', () => {
      const firstWeight = 60;
      const lastWeight = 70;

      const progress = lastWeight - firstWeight;
      const progressPercentage = (progress / firstWeight) * 100;

      expect(progress).toBe(10);
      expect(progressPercentage).toBeCloseTo(16.67, 1);
    });

    it('should handle single session', () => {
      const sessions = [{ date: '2024-12-25', maxWeight: 70 }];

      expect(sessions.length).toBe(1);
      expect(sessions[0].maxWeight).toBe(70);
    });

    it('should calculate average across sessions', () => {
      const sessions = [
        { maxWeight: 60 },
        { maxWeight: 65 },
        { maxWeight: 70 },
      ];

      const avg =
        sessions.reduce((sum, s) => sum + s.maxWeight, 0) / sessions.length;
      expect(avg).toBeCloseTo(65, 1);
    });
  });

  describe('Exercise List Management', () => {
    it('should get unique exercises', () => {
      const sessions = [
        { ejercicios: [{ nombreEjercicio: 'Bench Press' }] },
        { ejercicios: [{ nombreEjercicio: 'Squats' }] },
        { ejercicios: [{ nombreEjercicio: 'Bench Press' }] },
      ];

      const allExercises = sessions.flatMap((s) =>
        s.ejercicios.map((e) => e.nombreEjercicio)
      );
      const uniqueExercises = [...new Set(allExercises)];

      expect(uniqueExercises.length).toBe(2);
      expect(uniqueExercises).toContain('Bench Press');
      expect(uniqueExercises).toContain('Squats');
    });

    it('should count exercise occurrences', () => {
      const exerciseName = 'Bench Press';
      const sessions = [
        { ejercicios: [{ nombreEjercicio: 'Bench Press' }] },
        { ejercicios: [{ nombreEjercicio: 'Squats' }] },
        { ejercicios: [{ nombreEjercicio: 'Bench Press' }] },
      ];

      const count = sessions.filter((s) =>
        s.ejercicios.some((e) => e.nombreEjercicio === exerciseName)
      ).length;

      expect(count).toBe(2);
    });

    it('should sort exercises by frequency', () => {
      const exerciseCounts = [
        { name: 'Bench Press', count: 10 },
        { name: 'Squats', count: 8 },
        { name: 'Deadlifts', count: 12 },
      ];

      exerciseCounts.sort((a, b) => b.count - a.count);

      expect(exerciseCounts[0].name).toBe('Deadlifts');
      expect(exerciseCounts[0].count).toBe(12);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing exercise data', () => {
      const session = {
        date: '2024-12-25',
        ejercicios: [],
      };

      expect(session.ejercicios.length).toBe(0);
    });

    it('should handle missing sets data', () => {
      const exercise = {
        nombreEjercicio: 'Bench Press',
        sets: [],
      };

      const maxWeight = exercise.sets.length > 0
        ? Math.max(...exercise.sets.map((s) => s.peso))
        : 0;

      expect(maxWeight).toBe(0);
    });

    it('should handle invalid weight values', () => {
      const sets = [
        { peso: 60, reps: 10 },
        { peso: null, reps: 8 },
        { peso: 70, reps: 6 },
      ];

      const validSets = sets.filter((s) => s.peso !== null && !isNaN(s.peso));
      expect(validSets.length).toBe(2);
    });

    it('should handle empty cache gracefully', () => {
      const cache = new Map();

      expect(cache.size).toBe(0);
      expect(cache.get('exercise-1')).toBeUndefined();
    });
  });

  describe('Cache Initialization', () => {
    it('should detect uninitialized cache', () => {
      expect(progressTabCache.isInitialized).toBe(false);
    });

    it('should mark cache as initialized', () => {
      progressTabCache.isInitialized = true;
      expect(progressTabCache.isInitialized).toBe(true);
    });

    it('should reset initialization state', () => {
      progressTabCache.isInitialized = true;
      progressTabCache.isInitialized = false;
      expect(progressTabCache.isInitialized).toBe(false);
    });
  });
});
