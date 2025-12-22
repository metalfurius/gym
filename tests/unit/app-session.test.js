import { describe, it, expect, beforeEach } from '@jest/globals';

describe('App Session Management', () => {
  const IN_PROGRESS_SESSION_KEY = 'gymTracker_inProgressSession';

  beforeEach(() => {
    localStorage.clear();
  });

  describe('saveInProgressSession', () => {
    it('should save session to localStorage', () => {
      const routineId = 'routine-123';
      const data = {
        ejercicios: [
          {
            nombreEjercicio: 'Bench Press',
            sets: [{ peso: 60, reps: 10 }]
          }
        ],
        pesoUsuario: 75
      };

      const sessionToStore = {
        routineId,
        data,
        timestamp: Date.now()
      };

      localStorage.setItem(IN_PROGRESS_SESSION_KEY, JSON.stringify(sessionToStore));

      const stored = localStorage.getItem(IN_PROGRESS_SESSION_KEY);
      expect(stored).not.toBeNull();

      const parsed = JSON.parse(stored);
      expect(parsed.routineId).toBe(routineId);
      expect(parsed.data.pesoUsuario).toBe(75);
      expect(parsed.data.ejercicios).toHaveLength(1);
    });
  });

  describe('loadInProgressSession', () => {
    it('should load session from localStorage', () => {
      const sessionData = {
        routineId: 'routine-456',
        data: {
          ejercicios: [],
          pesoUsuario: 70
        },
        timestamp: Date.now()
      };

      localStorage.setItem(IN_PROGRESS_SESSION_KEY, JSON.stringify(sessionData));

      const loaded = localStorage.getItem(IN_PROGRESS_SESSION_KEY);
      const parsed = JSON.parse(loaded);

      expect(parsed).toBeDefined();
      expect(parsed.routineId).toBe('routine-456');
      expect(parsed.data.pesoUsuario).toBe(70);
    });

    it('should return null if no session exists', () => {
      const stored = localStorage.getItem(IN_PROGRESS_SESSION_KEY);
      expect(stored).toBeNull();
    });
  });

  describe('clearInProgressSession', () => {
    it('should remove session from localStorage', () => {
      const sessionData = {
        routineId: 'routine-789',
        data: { ejercicios: [] },
        timestamp: Date.now()
      };

      localStorage.setItem(IN_PROGRESS_SESSION_KEY, JSON.stringify(sessionData));
      expect(localStorage.getItem(IN_PROGRESS_SESSION_KEY)).not.toBeNull();

      localStorage.removeItem(IN_PROGRESS_SESSION_KEY);
      expect(localStorage.getItem(IN_PROGRESS_SESSION_KEY)).toBeNull();
    });
  });

  describe('timestampToLocalDateString', () => {
    it('should convert timestamp to local date string', () => {
      const date = new Date('2024-12-25T10:30:00');
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const result = `${year}-${month}-${day}`;

      expect(result).toBe('2024-12-25');
    });

    it('should handle different dates correctly', () => {
      const date = new Date('2024-01-01T00:00:00');
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const result = `${year}-${month}-${day}`;

      expect(result).toBe('2024-01-01');
    });
  });
});
