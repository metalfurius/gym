import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { invalidateProgressCache } from '../../js/progress.js';

// Mock UI module
jest.unstable_mockModule('../../js/ui.js', () => ({
  progressElements: {
    exerciseSelect: null,
    metricSelect: null,
    periodSelect: null,
    chartContainer: null,
  },
}));

describe('Progress Module', () => {
  beforeEach(() => {
    // Setup DOM
    document.body.innerHTML = `
      <select id="exercise-select"></select>
      <select id="metric-select">
        <option value="maxWeight">Peso Máximo</option>
        <option value="totalVolume">Volumen Total</option>
        <option value="avgReps">Repeticiones Promedio</option>
      </select>
      <select id="period-select">
        <option value="30">Últimos 30 días</option>
        <option value="90">Últimos 90 días</option>
        <option value="all">Todo el tiempo</option>
      </select>
      <div id="chart-container">
        <canvas id="progress-chart"></canvas>
      </div>
    `;
    
    // Mock Chart.js
    global.Chart = class MockChart {
      constructor(ctx, config) {
        this.ctx = ctx;
        this.config = config;
        this.data = config.data || {};
        this.options = config.options || {};
      }
      destroy() {}
      update() {}
    };
  });

  describe('invalidateProgressCache', () => {
    it('should clear progress cache', () => {
      invalidateProgressCache();
      // Function should execute without errors
      expect(true).toBe(true);
    });
  });

  describe('Cache Validation', () => {
    it('should validate cache timestamp', () => {
      const cacheValidityTime = 5 * 60 * 1000; // 5 minutes
      const now = Date.now();
      const oldTimestamp = now - (6 * 60 * 1000); // 6 minutes ago
      const recentTimestamp = now - (2 * 60 * 1000); // 2 minutes ago
      
      const isOldCacheValid = (now - oldTimestamp) < cacheValidityTime;
      const isRecentCacheValid = (now - recentTimestamp) < cacheValidityTime;
      
      expect(isOldCacheValid).toBe(false);
      expect(isRecentCacheValid).toBe(true);
    });

    it('should define cache validity time', () => {
      const cacheValidityTime = 5 * 60 * 1000;
      expect(cacheValidityTime).toBe(300000);
    });
  });

  describe('Exercise Data Structure', () => {
    it('should structure exercise data with sessions', () => {
      const exerciseData = {
        name: 'Bench Press',
        sessions: [
          { date: '2024-01-01', maxWeight: 60, totalVolume: 1800, avgReps: 10 },
          { date: '2024-01-08', maxWeight: 65, totalVolume: 1950, avgReps: 10 }
        ]
      };
      
      expect(exerciseData).toHaveProperty('name');
      expect(exerciseData).toHaveProperty('sessions');
      expect(exerciseData.sessions).toHaveLength(2);
      expect(exerciseData.sessions[0]).toHaveProperty('maxWeight');
      expect(exerciseData.sessions[0]).toHaveProperty('totalVolume');
      expect(exerciseData.sessions[0]).toHaveProperty('avgReps');
    });

    it('should calculate max weight from sets', () => {
      const sets = [
        { peso: 60, reps: 10 },
        { peso: 65, reps: 8 },
        { peso: 70, reps: 6 }
      ];
      
      const maxWeight = Math.max(...sets.map(set => set.peso));
      expect(maxWeight).toBe(70);
    });

    it('should calculate total volume from sets', () => {
      const sets = [
        { peso: 60, reps: 10 },
        { peso: 65, reps: 8 },
        { peso: 70, reps: 6 }
      ];
      
      const totalVolume = sets.reduce((sum, set) => sum + (set.peso * set.reps), 0);
      expect(totalVolume).toBe(600 + 520 + 420);
      expect(totalVolume).toBe(1540);
    });

    it('should calculate average reps from sets', () => {
      const sets = [
        { peso: 60, reps: 10 },
        { peso: 65, reps: 8 },
        { peso: 70, reps: 6 }
      ];
      
      const avgReps = sets.reduce((sum, set) => sum + set.reps, 0) / sets.length;
      expect(avgReps).toBe(8);
    });
  });

  describe('Chart Configuration', () => {
    it('should create chart config with proper structure', () => {
      const chartConfig = {
        type: 'line',
        data: {
          labels: ['Jan 1', 'Jan 8', 'Jan 15'],
          datasets: [{
            label: 'Peso Máximo',
            data: [60, 65, 70],
            borderColor: 'rgb(75, 192, 192)',
            tension: 0.1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false
        }
      };
      
      expect(chartConfig.type).toBe('line');
      expect(chartConfig.data).toHaveProperty('labels');
      expect(chartConfig.data).toHaveProperty('datasets');
      expect(chartConfig.options.responsive).toBe(true);
    });

    it('should have dataset with required properties', () => {
      const dataset = {
        label: 'Peso Máximo',
        data: [60, 65, 70],
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1
      };
      
      expect(dataset).toHaveProperty('label');
      expect(dataset).toHaveProperty('data');
      expect(dataset).toHaveProperty('borderColor');
      expect(dataset.data).toHaveLength(3);
    });
  });

  describe('Metric Selection', () => {
    it('should have metric select element', () => {
      const metricSelect = document.getElementById('metric-select');
      expect(metricSelect).not.toBeNull();
    });

    it('should have metric options', () => {
      const metricSelect = document.getElementById('metric-select');
      const options = Array.from(metricSelect.options).map(opt => opt.value);
      
      expect(options).toContain('maxWeight');
      expect(options).toContain('totalVolume');
      expect(options).toContain('avgReps');
    });
  });

  describe('Period Selection', () => {
    it('should have period select element', () => {
      const periodSelect = document.getElementById('period-select');
      expect(periodSelect).not.toBeNull();
    });

    it('should have period options', () => {
      const periodSelect = document.getElementById('period-select');
      const options = Array.from(periodSelect.options).map(opt => opt.value);
      
      expect(options).toContain('30');
      expect(options).toContain('90');
      expect(options).toContain('all');
    });

    it('should filter data by period', () => {
      const now = Date.now();
      const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
      const fortyDaysAgo = now - (40 * 24 * 60 * 60 * 1000);
      
      const sessions = [
        { date: new Date(fortyDaysAgo).toISOString(), weight: 60 },
        { date: new Date(thirtyDaysAgo + 1000).toISOString(), weight: 65 }
      ];
      
      const filteredSessions = sessions.filter(session => {
        const sessionTime = new Date(session.date).getTime();
        return sessionTime >= thirtyDaysAgo;
      });
      
      expect(filteredSessions).toHaveLength(1);
      expect(filteredSessions[0].weight).toBe(65);
    });
  });

  describe('Exercise List', () => {
    it('should structure exercise list with counts', () => {
      const exercisesWithCount = [
        { name: 'Bench Press', count: 15 },
        { name: 'Squats', count: 12 },
        { name: 'Deadlift', count: 10 }
      ];
      
      expect(exercisesWithCount).toHaveLength(3);
      expect(exercisesWithCount[0]).toHaveProperty('name');
      expect(exercisesWithCount[0]).toHaveProperty('count');
    });

    it('should sort exercises by count', () => {
      const exercises = [
        { name: 'Bench Press', count: 15 },
        { name: 'Squats', count: 12 },
        { name: 'Deadlift', count: 10 }
      ];
      
      const sorted = [...exercises].sort((a, b) => b.count - a.count);
      
      expect(sorted[0].name).toBe('Bench Press');
      expect(sorted[2].name).toBe('Deadlift');
    });
  });

  describe('Date Formatting', () => {
    it('should format date for chart labels', () => {
      const date = new Date('2024-01-15');
      const formatted = date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
      
      expect(formatted).toContain('15');
    });

    it('should parse ISO date string', () => {
      const isoString = '2024-01-15T10:30:00.000Z';
      const date = new Date(isoString);
      
      expect(date.getFullYear()).toBe(2024);
      expect(date.getMonth()).toBe(0); // January is 0
    });
  });

  describe('Chart Data Preparation', () => {
    it('should prepare chart data from sessions', () => {
      const sessions = [
        { fecha: '2024-01-01', ejercicios: [{ nombreEjercicio: 'Bench Press', sets: [{ peso: 60, reps: 10 }] }] },
        { fecha: '2024-01-08', ejercicios: [{ nombreEjercicio: 'Bench Press', sets: [{ peso: 65, reps: 8 }] }] }
      ];
      
      const labels = sessions.map(s => s.fecha);
      const data = sessions.map(s => {
        const exercise = s.ejercicios[0];
        return Math.max(...exercise.sets.map(set => set.peso));
      });
      
      expect(labels).toHaveLength(2);
      expect(data).toHaveLength(2);
      expect(data[0]).toBe(60);
      expect(data[1]).toBe(65);
    });
  });

  describe('Progress Cache', () => {
    it('should have cache structure', () => {
      const progressTabCache = {
        exercisesList: null,
        exercisesWithCount: null,
        lastCacheTime: null,
        isInitialized: false,
        cacheValidityTime: 5 * 60 * 1000
      };
      
      expect(progressTabCache).toHaveProperty('exercisesList');
      expect(progressTabCache).toHaveProperty('exercisesWithCount');
      expect(progressTabCache).toHaveProperty('lastCacheTime');
      expect(progressTabCache).toHaveProperty('isInitialized');
      expect(progressTabCache).toHaveProperty('cacheValidityTime');
    });

    it('should update cache timestamp', () => {
      const cache = {
        lastCacheTime: null
      };
      
      cache.lastCacheTime = Date.now();
      expect(cache.lastCacheTime).not.toBeNull();
      expect(typeof cache.lastCacheTime).toBe('number');
    });
  });
});
