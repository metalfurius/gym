import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const saveInProgressSessionMock = jest.fn();
const loadInProgressSessionMock = jest.fn(() => null);

jest.unstable_mockModule('../../js/modules/session-manager.js', () => ({
    saveInProgressSession: saveInProgressSessionMock,
    loadInProgressSession: loadInProgressSessionMock
}));

const {
    initVersionControl,
    getCurrentVersion,
    checkForBackupSession
} = await import('../../js/version-manager.js');

describe('Version Manager', () => {
    const VERSION_KEY = 'gym-tracker-version';
    const BACKUP_SESSION_KEY = 'gym-tracker-backup-session';
    const DEFAULT_VERSION = '1.0.2';

    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = '';

        saveInProgressSessionMock.mockReset();
        loadInProgressSessionMock.mockReset();
        loadInProgressSessionMock.mockReturnValue(null);

        global.fetch = jest.fn(async () => ({
            json: async () => ({ version: '1.0.3' })
        }));

        global.caches = {
            keys: jest.fn(async () => []),
            delete: jest.fn(async () => true)
        };

        Object.defineProperty(global.navigator, 'serviceWorker', {
            configurable: true,
            value: {
                getRegistrations: jest.fn(async () => [])
            }
        });
    });

    it('returns fallback version when manifest fetch fails', async () => {
        global.fetch = jest.fn(async () => {
            throw new Error('Network error');
        });

        const version = await getCurrentVersion();
        expect(version).toBe(DEFAULT_VERSION);
    });

    it('stores current version on first install', async () => {
        global.fetch = jest.fn(async () => ({
            json: async () => ({ version: '1.0.4' })
        }));

        const result = await initVersionControl();

        expect(result).toEqual({ isUpdate: false, isFirstInstall: true });
        expect(localStorage.getItem(VERSION_KEY)).toBe('1.0.4');
    });

    it('restores in-progress session after update flow', async () => {
        const inProgressSession = {
            routineId: 'routine-1',
            data: { ejercicios: [{ nombreEjercicio: 'Press banca' }] },
            timestamp: Date.now()
        };

        localStorage.setItem(VERSION_KEY, '1.0.1');
        loadInProgressSessionMock.mockReturnValue(inProgressSession);

        const result = await initVersionControl();

        expect(result.isUpdate).toBe(true);
        expect(result.oldVersion).toBe('1.0.1');
        expect(localStorage.getItem(VERSION_KEY)).toBe('1.0.3');
        expect(localStorage.getItem(BACKUP_SESSION_KEY)).toBeNull();
        expect(saveInProgressSessionMock).toHaveBeenCalledWith({
            routineId: 'routine-1',
            data: inProgressSession.data,
            timestamp: inProgressSession.timestamp
        });
    });

    it('restores backup session on app start and clears backup key', () => {
        const backupSession = {
            routineId: 'routine-2',
            data: { ejercicios: [] },
            timestamp: 1700000000000
        };
        localStorage.setItem(BACKUP_SESSION_KEY, JSON.stringify(backupSession));

        const restored = checkForBackupSession();

        expect(restored).toBe(true);
        expect(localStorage.getItem(BACKUP_SESSION_KEY)).toBeNull();
        expect(saveInProgressSessionMock).toHaveBeenCalledWith({
            routineId: 'routine-2',
            data: { ejercicios: [] },
            timestamp: 1700000000000
        });
    });

    it('returns false for invalid backup payload and clears key', () => {
        localStorage.setItem(BACKUP_SESSION_KEY, '{invalid json');

        const restored = checkForBackupSession();

        expect(restored).toBe(false);
        expect(localStorage.getItem(BACKUP_SESSION_KEY)).toBeNull();
        expect(saveInProgressSessionMock).not.toHaveBeenCalled();
    });
});

