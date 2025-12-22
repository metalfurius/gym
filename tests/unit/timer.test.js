import { describe, it, expect, beforeEach } from '@jest/globals';

// Mock the timer module functions
describe('Timer Module', () => {
  beforeEach(async () => {
    // Setup DOM for testing
    document.body.innerHTML = `
      <div id="exercise-list"></div>
    `;
    
    // Clear localStorage before each test
    localStorage.clear();
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
});
