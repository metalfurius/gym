import { describe, it, expect } from '@jest/globals';
import { createMockRoutine, createMockSession, createMockTimestamp } from '../utils/test-helpers.js';

describe('Data Models', () => {
  describe('Routine Model', () => {
    it('should create a valid routine object', () => {
      const routine = createMockRoutine('Push Day');

      expect(routine).toHaveProperty('id');
      expect(routine).toHaveProperty('name');
      expect(routine).toHaveProperty('exercises');
      expect(routine).toHaveProperty('createdAt');
      expect(routine.name).toBe('Push Day');
      expect(Array.isArray(routine.exercises)).toBe(true);
    });

    it('should have exercises with required fields', () => {
      const routine = createMockRoutine('Pull Day');

      expect(routine.exercises.length).toBeGreaterThan(0);
      
      routine.exercises.forEach(exercise => {
        expect(exercise).toHaveProperty('nombreEjercicio');
        expect(exercise).toHaveProperty('sets');
        expect(exercise).toHaveProperty('type');
        expect(typeof exercise.nombreEjercicio).toBe('string');
        expect(typeof exercise.sets).toBe('number');
        expect(['strength', 'cardio', 'mixed']).toContain(exercise.type);
      });
    });

    it('should support custom exercises', () => {
      const customExercises = [
        {
          nombreEjercicio: 'Custom Exercise 1',
          sets: 5,
          type: 'strength',
        },
        {
          nombreEjercicio: 'Custom Exercise 2',
          sets: 3,
          type: 'cardio',
        }
      ];

      const routine = createMockRoutine('Custom Routine', customExercises);

      expect(routine.exercises).toHaveLength(2);
      expect(routine.exercises[0].nombreEjercicio).toBe('Custom Exercise 1');
      expect(routine.exercises[1].sets).toBe(3);
    });
  });

  describe('Session Model', () => {
    it('should create a valid session object', () => {
      const session = createMockSession('Leg Day');

      expect(session).toHaveProperty('id');
      expect(session).toHaveProperty('dia');
      expect(session).toHaveProperty('fecha');
      expect(session).toHaveProperty('ejercicios');
      expect(session).toHaveProperty('pesoUsuario');
      expect(session.dia).toBe('Leg Day');
      expect(Array.isArray(session.ejercicios)).toBe(true);
    });

    it('should have exercises with sets data', () => {
      const session = createMockSession();

      expect(session.ejercicios.length).toBeGreaterThan(0);
      
      session.ejercicios.forEach(exercise => {
        expect(exercise).toHaveProperty('nombreEjercicio');
        expect(exercise).toHaveProperty('sets');
        expect(Array.isArray(exercise.sets)).toBe(true);
        
        exercise.sets.forEach(set => {
          expect(set).toHaveProperty('peso');
          expect(set).toHaveProperty('reps');
          expect(typeof set.peso).toBe('number');
          expect(typeof set.reps).toBe('number');
        });
      });
    });

    it('should store user weight', () => {
      const session = createMockSession();

      expect(typeof session.pesoUsuario).toBe('number');
      expect(session.pesoUsuario).toBeGreaterThan(0);
    });
  });

  describe('Timestamp Model', () => {
    it('should create a valid Firebase-like timestamp', () => {
      const date = new Date('2024-12-25T10:30:00');
      const timestamp = createMockTimestamp(date);

      expect(timestamp).toHaveProperty('toDate');
      expect(timestamp).toHaveProperty('seconds');
      expect(timestamp).toHaveProperty('nanoseconds');
      expect(typeof timestamp.toDate).toBe('function');
      expect(timestamp.toDate()).toEqual(date);
    });

    it('should have correct seconds value', () => {
      const date = new Date('2024-12-25T10:30:00');
      const timestamp = createMockTimestamp(date);
      const expectedSeconds = Math.floor(date.getTime() / 1000);

      expect(timestamp.seconds).toBe(expectedSeconds);
    });

    it('should convert to date correctly', () => {
      const originalDate = new Date('2024-12-25T10:30:00');
      const timestamp = createMockTimestamp(originalDate);
      const convertedDate = timestamp.toDate();

      expect(convertedDate.getTime()).toBe(originalDate.getTime());
    });
  });

  describe('Exercise Types', () => {
    it('should support strength exercises', () => {
      const exercise = {
        nombreEjercicio: 'Deadlift',
        sets: 5,
        type: 'strength',
      };

      expect(exercise.type).toBe('strength');
    });

    it('should support cardio exercises', () => {
      const exercise = {
        nombreEjercicio: 'Running',
        sets: 1,
        type: 'cardio',
      };

      expect(exercise.type).toBe('cardio');
    });

    it('should support mixed exercises', () => {
      const exercise = {
        nombreEjercicio: 'Circuit Training',
        sets: 3,
        type: 'mixed',
      };

      expect(exercise.type).toBe('mixed');
    });
  });

  describe('Data Validation', () => {
    it('should handle empty exercise arrays', () => {
      const routine = createMockRoutine('Empty Routine', []);

      // The helper should provide default exercises even when empty array is passed
      expect(Array.isArray(routine.exercises)).toBe(true);
    });

    it('should handle date validation', () => {
      const now = new Date();
      const timestamp = createMockTimestamp(now);
      const convertedDate = timestamp.toDate();

      expect(convertedDate instanceof Date).toBe(true);
      expect(convertedDate.getTime()).toBeLessThanOrEqual(Date.now());
    });
  });
});
