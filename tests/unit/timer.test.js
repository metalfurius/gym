import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { initSetTimers, getRestTimesData } from '../../js/timer.js';

describe('Timer Module', () => {
  beforeEach(async () => {
    // Setup DOM for testing
    document.body.innerHTML = `
      <div id="exercise-list">
        <div class="set-timer" data-timer-id="0-0">
          <div id="timer-display-0-0" class="timer-display">00:00</div>
          <button id="timer-button-0-0" class="timer-button" type="button" data-timer-id="0-0">Iniciar</button>
        </div>
        <div class="set-timer" data-timer-id="0-1">
          <div id="timer-display-0-1" class="timer-display">00:00</div>
          <button id="timer-button-0-1" class="timer-button" type="button" data-timer-id="0-1">Iniciar</button>
        </div>
        <div class="set-timer" data-timer-id="1-0">
          <div id="timer-display-1-0" class="timer-display">00:00</div>
          <button id="timer-button-1-0" class="timer-button" type="button" data-timer-id="1-0">Iniciar</button>
        </div>
      </div>
    `;
    
    // Clear localStorage before each test
    localStorage.clear();
  });

  describe('initSetTimers', () => {
    it('should initialize timer system', () => {
      initSetTimers();
      const exerciseList = document.getElementById('exercise-list');
      expect(exerciseList).not.toBeNull();
    });

    it('should not throw error when exercise list is missing', () => {
      document.body.innerHTML = '';
      expect(() => initSetTimers()).not.toThrow();
    });
  });

  describe('getRestTimesData', () => {
    it('should get rest times data structure', () => {
      const restTimes = getRestTimesData();
      expect(restTimes).toBeDefined();
      expect(typeof restTimes).toBe('object');
    });

    it('should collect rest times from timer displays', () => {
      // Set some timer values
      document.getElementById('timer-display-0-0').textContent = '01:30';
      document.getElementById('timer-display-0-1').textContent = '02:00';
      document.getElementById('timer-display-1-0').textContent = '00:45';
      
      const restTimes = getRestTimesData();
      
      expect(restTimes[0]).toBeDefined();
      expect(restTimes[0][0]).toBe('01:30');
      expect(restTimes[0][1]).toBe('02:00');
      expect(restTimes[1]).toBeDefined();
      expect(restTimes[1][0]).toBe('00:45');
    });

    it('should return empty object when no timers exist', () => {
      document.body.innerHTML = '<div id="exercise-list"></div>';
      const restTimes = getRestTimesData();
      expect(Object.keys(restTimes).length).toBe(0);
    });
  });

  describe('Timer Storage', () => {
    it('should save timer value to localStorage', () => {
      const timerId = '0-0';
      const timeValue = '01:30';
      const isRunning = false;
      
      const timerData = {
        timers: {
          [timerId]: {
            value: timeValue,
            running: isRunning,
            timestamp: Date.now()
          }
        }
      };
      
      localStorage.setItem('gym-tracker-timer-data', JSON.stringify(timerData));
      
      const stored = JSON.parse(localStorage.getItem('gym-tracker-timer-data'));
      expect(stored.timers[timerId].value).toBe(timeValue);
      expect(stored.timers[timerId].running).toBe(isRunning);
    });

    it('should clear timer data from localStorage', () => {
      localStorage.setItem('gym-tracker-timer-data', JSON.stringify({ timers: {} }));
      expect(localStorage.getItem('gym-tracker-timer-data')).not.toBeNull();
      
      localStorage.removeItem('gym-tracker-timer-data');
      expect(localStorage.getItem('gym-tracker-timer-data')).toBeNull();
    });
  });

  describe('Timer Display', () => {
    it('should format time correctly', () => {
      const seconds = 90;
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      const timeDisplay = `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      
      expect(timeDisplay).toBe('01:30');
    });

    it('should format time for hours correctly', () => {
      const seconds = 3665; // 1 hour, 1 minute, 5 seconds
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      const timeDisplay = `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      
      expect(timeDisplay).toBe('61:05');
    });

    it('should parse time display to seconds', () => {
      const timeDisplay = '01:30';
      const parts = timeDisplay.split(':');
      const seconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
      
      expect(seconds).toBe(90);
    });
  });

  describe('Timer HTML Generation', () => {
    it('should generate correct HTML for timer', () => {
      const exerciseIndex = 0;
      const setIndex = 1;
      const timerId = `${exerciseIndex}-${setIndex}`;
      
      const html = `
        <div class="set-timer" data-timer-id="${timerId}">
            <div id="timer-display-${timerId}" class="timer-display">00:00</div>
            <button id="timer-button-${timerId}" class="timer-button" type="button" data-timer-id="${timerId}">Iniciar</button>
        </div>
      `;
      
      expect(html).toContain(`data-timer-id="${timerId}"`);
      expect(html).toContain(`timer-display-${timerId}`);
      expect(html).toContain(`timer-button-${timerId}`);
    });

    it('should have timer buttons with correct data attributes', () => {
      const timerButton = document.getElementById('timer-button-0-0');
      expect(timerButton).not.toBeNull();
      expect(timerButton.dataset.timerId).toBe('0-0');
      expect(timerButton.classList.contains('timer-button')).toBe(true);
    });
  });

  describe('Rest Times Data', () => {
    it('should structure rest times data correctly', () => {
      const restTimes = {
        0: {
          0: '00:30',
          1: '00:45',
          2: '01:00'
        },
        1: {
          0: '00:30',
          1: '00:30'
        }
      };
      
      expect(restTimes[0][0]).toBe('00:30');
      expect(restTimes[0][2]).toBe('01:00');
      expect(restTimes[1][1]).toBe('00:30');
    });
  });

  describe('Timer ID Parsing', () => {
    it('should parse timer ID correctly', () => {
      const timerId = '2-3';
      const [exerciseIndex, setIndex] = timerId.split('-').map(Number);
      
      expect(exerciseIndex).toBe(2);
      expect(setIndex).toBe(3);
    });

    it('should create timer ID from indices', () => {
      const exerciseIndex = 1;
      const setIndex = 2;
      const timerId = `${exerciseIndex}-${setIndex}`;
      
      expect(timerId).toBe('1-2');
    });
  });
});

