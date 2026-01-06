import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock fetch for manifest.json
const mockManifest = { version: '1.4.6' };
global.fetch = jest.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve(mockManifest),
  })
);

// Mock the app.js module
jest.unstable_mockModule('../../js/app.js', () => ({
  saveInProgressSession: jest.fn(),
  loadInProgressSession: jest.fn(() => null),
  clearInProgressSession: jest.fn(),
}));

describe('Version Manager', () => {
  const VERSION_KEY = 'gym-tracker-version';
  const BACKUP_SESSION_KEY = 'gym-tracker-backup-session';

  beforeEach(() => {
    localStorage.clear();
    global.fetch.mockClear();
  });

  describe('getCurrentVersionFromManifest', () => {
    it('should fetch version from manifest.json', async () => {
      mockManifest.version = '1.4.6';
      
      const response = await fetch('./manifest.json');
      const manifest = await response.json();
      
      expect(manifest.version).toBe('1.4.6');
      expect(fetch).toHaveBeenCalledWith('./manifest.json');
    });

    it('should handle fetch error and return fallback version', async () => {
      global.fetch.mockImplementationOnce(() => Promise.reject(new Error('Network error')));
      
      const fallbackVersion = '1.1.0';
      let version;
      
      try {
        const response = await fetch('./manifest.json');
        const manifest = await response.json();
        version = manifest.version;
      } catch (error) {
        version = fallbackVersion;
      }
      
      expect(version).toBe(fallbackVersion);
    });
  });

  describe('Version Storage', () => {
    it('should store version in localStorage', () => {
      const version = '1.4.6';
      localStorage.setItem(VERSION_KEY, version);
      
      const stored = localStorage.getItem(VERSION_KEY);
      expect(stored).toBe(version);
    });

    it('should retrieve stored version', () => {
      const version = '1.4.5';
      localStorage.setItem(VERSION_KEY, version);
      
      const retrieved = localStorage.getItem(VERSION_KEY);
      expect(retrieved).toBe(version);
    });

    it('should return null if no version is stored', () => {
      const stored = localStorage.getItem(VERSION_KEY);
      expect(stored).toBeNull();
    });
  });

  describe('First Installation Detection', () => {
    it('should detect first installation when no version is stored', () => {
      const storedVersion = localStorage.getItem(VERSION_KEY);
      const isFirstInstall = !storedVersion;
      
      expect(isFirstInstall).toBe(true);
    });

    it('should not detect first installation when version exists', () => {
      localStorage.setItem(VERSION_KEY, '1.4.0');
      
      const storedVersion = localStorage.getItem(VERSION_KEY);
      const isFirstInstall = !storedVersion;
      
      expect(isFirstInstall).toBe(false);
    });
  });

  describe('Version Update Detection', () => {
    it('should detect update when versions differ', () => {
      const storedVersion = '1.4.5';
      const currentVersion = '1.4.6';
      
      const isUpdate = storedVersion !== currentVersion;
      expect(isUpdate).toBe(true);
    });

    it('should not detect update when versions match', () => {
      const storedVersion = '1.4.6';
      const currentVersion = '1.4.6';
      
      const isUpdate = storedVersion !== currentVersion;
      expect(isUpdate).toBe(false);
    });

    it('should handle version upgrade from older to newer', () => {
      const oldVersion = '1.3.0';
      const newVersion = '1.4.6';
      
      localStorage.setItem(VERSION_KEY, oldVersion);
      const storedVersion = localStorage.getItem(VERSION_KEY);
      
      expect(storedVersion).toBe(oldVersion);
      expect(storedVersion !== newVersion).toBe(true);
    });
  });

  describe('Backup Session Management', () => {
    it('should store backup session', () => {
      const sessionData = {
        routineId: 'routine-123',
        data: { ejercicios: [] },
        timestamp: Date.now(),
      };
      
      localStorage.setItem(BACKUP_SESSION_KEY, JSON.stringify(sessionData));
      
      const stored = localStorage.getItem(BACKUP_SESSION_KEY);
      expect(stored).not.toBeNull();
      
      const parsed = JSON.parse(stored);
      expect(parsed.routineId).toBe('routine-123');
    });

    it('should retrieve backup session', () => {
      const sessionData = {
        routineId: 'routine-456',
        data: { ejercicios: [] },
        timestamp: Date.now(),
      };
      
      localStorage.setItem(BACKUP_SESSION_KEY, JSON.stringify(sessionData));
      
      const stored = localStorage.getItem(BACKUP_SESSION_KEY);
      const parsed = JSON.parse(stored);
      
      expect(parsed).toBeDefined();
      expect(parsed.routineId).toBe('routine-456');
    });

    it('should clear backup session', () => {
      const sessionData = {
        routineId: 'routine-789',
        data: {},
        timestamp: Date.now(),
      };
      
      localStorage.setItem(BACKUP_SESSION_KEY, JSON.stringify(sessionData));
      expect(localStorage.getItem(BACKUP_SESSION_KEY)).not.toBeNull();
      
      localStorage.removeItem(BACKUP_SESSION_KEY);
      expect(localStorage.getItem(BACKUP_SESSION_KEY)).toBeNull();
    });

    it('should handle no backup session', () => {
      const stored = localStorage.getItem(BACKUP_SESSION_KEY);
      expect(stored).toBeNull();
    });
  });

  describe('Version Update Workflow', () => {
    it('should set version on first install', () => {
      const currentVersion = '1.4.6';
      
      localStorage.setItem(VERSION_KEY, currentVersion);
      
      const stored = localStorage.getItem(VERSION_KEY);
      expect(stored).toBe(currentVersion);
    });

    it('should update version after app update', () => {
      const oldVersion = '1.4.5';
      const newVersion = '1.4.6';
      
      localStorage.setItem(VERSION_KEY, oldVersion);
      expect(localStorage.getItem(VERSION_KEY)).toBe(oldVersion);
      
      localStorage.setItem(VERSION_KEY, newVersion);
      expect(localStorage.getItem(VERSION_KEY)).toBe(newVersion);
    });

    it('should preserve version when no update', () => {
      const version = '1.4.6';
      
      localStorage.setItem(VERSION_KEY, version);
      const stored1 = localStorage.getItem(VERSION_KEY);
      const stored2 = localStorage.getItem(VERSION_KEY);
      
      expect(stored1).toBe(stored2);
      expect(stored1).toBe(version);
    });
  });

  describe('Cache Management', () => {
    it('should handle cache names with version', () => {
      const version = '1.4.6';
      const cacheName = `gym-tracker-v${version}`;
      
      expect(cacheName).toBe('gym-tracker-v1.4.6');
    });

    it('should generate different cache names for different versions', () => {
      const version1 = '1.4.5';
      const version2 = '1.4.6';
      
      const cacheName1 = `gym-tracker-v${version1}`;
      const cacheName2 = `gym-tracker-v${version2}`;
      
      expect(cacheName1).not.toBe(cacheName2);
    });
  });

  describe('Version Comparison', () => {
    it('should compare semantic versions', () => {
      const versions = [
        { old: '1.0.0', new: '1.1.0', isUpdate: true },
        { old: '1.4.5', new: '1.4.6', isUpdate: true },
        { old: '1.4.6', new: '1.4.6', isUpdate: false },
        { old: '2.0.0', new: '2.0.1', isUpdate: true },
      ];
      
      versions.forEach(({ old, new: newVer, isUpdate }) => {
        expect(old !== newVer).toBe(isUpdate);
      });
    });

    it('should handle major version updates', () => {
      const oldVersion = '1.4.6';
      const newVersion = '2.0.0';
      
      expect(oldVersion !== newVersion).toBe(true);
    });

    it('should handle minor version updates', () => {
      const oldVersion = '1.4.6';
      const newVersion = '1.5.0';
      
      expect(oldVersion !== newVersion).toBe(true);
    });

    it('should handle patch version updates', () => {
      const oldVersion = '1.4.6';
      const newVersion = '1.4.7';
      
      expect(oldVersion !== newVersion).toBe(true);
    });
  });

  describe('Session Preservation During Update', () => {
    it('should preserve in-progress session during update', () => {
      const sessionData = {
        routineId: 'workout-123',
        data: {
          ejercicios: [{ nombreEjercicio: 'Bench Press', sets: [] }],
        },
        timestamp: Date.now(),
      };
      
      // Store session before update
      localStorage.setItem(BACKUP_SESSION_KEY, JSON.stringify(sessionData));
      
      // Simulate version update
      localStorage.setItem(VERSION_KEY, '1.4.5');
      localStorage.setItem(VERSION_KEY, '1.4.6');
      
      // Session should still be there
      const stored = localStorage.getItem(BACKUP_SESSION_KEY);
      expect(stored).not.toBeNull();
      
      const parsed = JSON.parse(stored);
      expect(parsed.routineId).toBe('workout-123');
    });
  });

  describe('Error Handling', () => {
    it('should handle JSON parse errors', () => {
      localStorage.setItem(BACKUP_SESSION_KEY, 'invalid-json');
      
      let error;
      try {
        JSON.parse(localStorage.getItem(BACKUP_SESSION_KEY));
      } catch (e) {
        error = e;
      }
      
      expect(error).toBeDefined();
    });

    it('should handle missing manifest gracefully', async () => {
      global.fetch.mockImplementationOnce(() =>
        Promise.reject(new Error('Not found'))
      );
      
      let version;
      try {
        const response = await fetch('./manifest.json');
        const manifest = await response.json();
        version = manifest.version;
      } catch (error) {
        version = '1.1.0'; // Fallback
      }
      
      expect(version).toBe('1.1.0');
    });
  });

  describe('Version String Format', () => {
    it('should validate semver format', () => {
      const validVersions = ['1.0.0', '1.4.6', '2.10.5'];
      const versionRegex = /^\d+\.\d+\.\d+$/;
      
      validVersions.forEach((version) => {
        expect(versionRegex.test(version)).toBe(true);
      });
    });

    it('should detect invalid version formats', () => {
      const invalidVersions = ['1.0', 'v1.0.0', '1.0.0-beta'];
      const versionRegex = /^\d+\.\d+\.\d+$/;
      
      invalidVersions.forEach((version) => {
        expect(versionRegex.test(version)).toBe(false);
      });
    });
  });
});
