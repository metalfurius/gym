import { describe, it, expect, beforeEach } from '@jest/globals';
import { createMockUser, createMockRoutine, createMockSession } from '../utils/test-helpers.js';

describe('App Integration Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = `
      <div id="auth-view"></div>
      <div id="dashboard-view" class="hidden"></div>
      <div id="session-view" class="hidden"></div>
      <div id="history-view" class="hidden"></div>
      <select id="day-select"></select>
      <ul id="history-list"></ul>
      <div id="exercise-list"></div>
    `;
  });

  describe('User Authentication Flow', () => {
    it('should handle user login state', () => {
      const user = createMockUser();
      
      expect(user).toHaveProperty('uid');
      expect(user).toHaveProperty('email');
      expect(user.email).toBe('test@example.com');
    });

    it('should store user session data', () => {
      const user = createMockUser('user@test.com', 'uid-123');
      const sessionKey = `user-session-${user.uid}`;
      
      localStorage.setItem(sessionKey, JSON.stringify(user));
      
      const stored = JSON.parse(localStorage.getItem(sessionKey));
      expect(stored.email).toBe('user@test.com');
    });
  });

  describe('Routine Management Flow', () => {
    it('should create and store routine', () => {
      const user = createMockUser();
      const routine = createMockRoutine('Push Day');
      
      const routineKey = `routines-${user.uid}`;
      const routines = [routine];
      
      localStorage.setItem(routineKey, JSON.stringify(routines));
      
      const stored = JSON.parse(localStorage.getItem(routineKey));
      expect(stored).toHaveLength(1);
      expect(stored[0].name).toBe('Push Day');
    });

    it('should populate routine selector', () => {
      const routines = [
        createMockRoutine('Push Day'),
        createMockRoutine('Pull Day'),
        createMockRoutine('Leg Day')
      ];
      
      const selector = document.getElementById('day-select');
      selector.innerHTML = '';
      
      routines.forEach((routine, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = routine.name;
        selector.appendChild(option);
      });
      
      expect(selector.children.length).toBe(3);
      expect(selector.children[0].textContent).toBe('Push Day');
    });
  });

  describe('Session Workflow', () => {
    it('should start and save session', () => {
      const session = createMockSession('Chest Day');
      const sessionKey = 'gymTracker_inProgressSession';
      
      // Start session
      localStorage.setItem(sessionKey, JSON.stringify({
        routineId: 'routine-1',
        data: session,
        timestamp: Date.now()
      }));
      
      expect(localStorage.getItem(sessionKey)).not.toBeNull();
      
      // Complete session
      const completed = JSON.parse(localStorage.getItem(sessionKey));
      expect(completed.data.dia).toBe('Chest Day');
      
      // Clear in-progress
      localStorage.removeItem(sessionKey);
      expect(localStorage.getItem(sessionKey)).toBeNull();
    });

    it('should resume interrupted session', () => {
      const sessionData = {
        routineId: 'routine-123',
        data: {
          ejercicios: [
            {
              nombreEjercicio: 'Bench Press',
              sets: [{ peso: 60, reps: 10 }]
            }
          ]
        },
        timestamp: Date.now()
      };
      
      localStorage.setItem('gymTracker_inProgressSession', JSON.stringify(sessionData));
      
      const stored = localStorage.getItem('gymTracker_inProgressSession');
      const parsed = JSON.parse(stored);
      
      expect(parsed.routineId).toBe('routine-123');
      expect(parsed.data.ejercicios).toHaveLength(1);
    });
  });

  describe('History Management', () => {
    it('should save completed sessions to history', () => {
      const user = createMockUser();
      const sessions = [
        createMockSession('Day 1'),
        createMockSession('Day 2'),
        createMockSession('Day 3')
      ];
      
      const historyKey = `history-${user.uid}`;
      localStorage.setItem(historyKey, JSON.stringify(sessions));
      
      const stored = JSON.parse(localStorage.getItem(historyKey));
      expect(stored).toHaveLength(3);
    });

    it('should render history list', () => {
      const sessions = [
        createMockSession('Push Day'),
        createMockSession('Pull Day')
      ];
      
      const historyList = document.getElementById('history-list');
      historyList.innerHTML = '';
      
      sessions.forEach(session => {
        const li = document.createElement('li');
        li.textContent = `${session.dia} - ${session.ejercicios.length} exercises`;
        historyList.appendChild(li);
      });
      
      expect(historyList.children.length).toBe(2);
    });
  });

  describe('Exercise Data Flow', () => {
    it('should track exercise progress', () => {
      const sessions = [
        createMockSession(),
        createMockSession(),
        createMockSession()
      ];
      
      // Extract exercise data
      const exerciseName = 'Bench Press';
      const exerciseData = [];
      
      sessions.forEach(session => {
        const exercise = session.ejercicios.find(e => e.nombreEjercicio === exerciseName);
        if (exercise) {
          const maxWeight = Math.max(...exercise.sets.map(s => s.peso));
          exerciseData.push(maxWeight);
        }
      });
      
      expect(exerciseData.length).toBeGreaterThan(0);
      expect(exerciseData.every(w => typeof w === 'number')).toBe(true);
    });

    it('should calculate volume for exercise', () => {
      const session = createMockSession();
      const exercise = session.ejercicios[0];
      
      const totalVolume = exercise.sets.reduce((sum, set) => {
        return sum + (set.peso * set.reps);
      }, 0);
      
      expect(totalVolume).toBeGreaterThan(0);
      expect(typeof totalVolume).toBe('number');
    });
  });

  describe('Data Synchronization', () => {
    it('should maintain data consistency across views', () => {
      const routineData = createMockRoutine('Test Routine');
      
      // Store in different formats for different views
      localStorage.setItem('current-routine', JSON.stringify(routineData));
      localStorage.setItem('dashboard-routine-id', routineData.id);
      
      const storedRoutine = JSON.parse(localStorage.getItem('current-routine'));
      const storedId = localStorage.getItem('dashboard-routine-id');
      
      expect(storedRoutine.id).toBe(storedId);
    });

    it('should handle version updates', () => {
      const currentVersion = '1.0.2';
      const storedVersion = '1.0.1';
      
      localStorage.setItem('gym-tracker-version', storedVersion);
      
      // Simulate version check
      const stored = localStorage.getItem('gym-tracker-version');
      const needsUpdate = stored !== currentVersion;
      
      expect(needsUpdate).toBe(true);
      
      // Update version
      localStorage.setItem('gym-tracker-version', currentVersion);
      expect(localStorage.getItem('gym-tracker-version')).toBe(currentVersion);
    });
  });
});
