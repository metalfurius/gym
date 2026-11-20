import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';

const saveInProgressSessionMock = jest.fn();
const loadInProgressSessionMock = jest.fn(() => null);

jest.unstable_mockModule('../../js/modules/session-manager.js', () => ({
    saveInProgressSession: saveInProgressSessionMock,
    loadInProgressSession: loadInProgressSessionMock
}));

const {
    initVersionControl,
    getCurrentVersion,
    checkForBackupSession,
    forceAppUpdate
} = await import('../../js/version-manager.js');

describe('Version Manager', () => {
    const VERSION_KEY = 'gym-tracker-version';
    const BACKUP_SESSION_KEY = 'gym-tracker-backup-session';
    const DEFAULT_VERSION = JSON.parse(readFileSync(new URL('../../manifest.json', import.meta.url), 'utf8')).version;

    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = '';
        document.querySelector('meta[name="gym-release-revision"]')?.remove();

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

    it('keeps the current in-progress session after update flow', async () => {
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
        expect(saveInProgressSessionMock).not.toHaveBeenCalled();
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
        }, undefined, { restoring: true });
    });

    it('returns false for invalid backup payload and clears key', () => {
        localStorage.setItem(BACKUP_SESSION_KEY, '{invalid json');

        const restored = checkForBackupSession();

        expect(restored).toBe(false);
        expect(localStorage.getItem(BACKUP_SESSION_KEY)).toBeNull();
        expect(saveInProgressSessionMock).not.toHaveBeenCalled();
    });

    it('does not replace a newer in-progress session with an older backup', () => {
        localStorage.setItem(BACKUP_SESSION_KEY, JSON.stringify({ routineId: 'old', data: {}, timestamp: 1 }));
        loadInProgressSessionMock.mockReturnValue({ routineId: 'new', data: {}, timestamp: 2 });
        expect(checkForBackupSession()).toBe(false);
        expect(localStorage.getItem(BACKUP_SESSION_KEY)).toBeNull();
        expect(saveInProgressSessionMock).not.toHaveBeenCalled();
    });

    it('ignores metadata older than the installed document', async () => {
        document.head.insertAdjacentHTML('beforeend', '<meta name="gym-release-revision" content="v2.8.1">');
        localStorage.setItem(VERSION_KEY, '2.8.1');
        localStorage.setItem('gym-tracker-release-revision', 'v2.8.1');
        global.fetch = jest.fn(async () => ({ json: async () => ({ version: '2.7.12', revision: 'v2.7.12' }) }));
        expect((await initVersionControl()).isUpdate).toBe(false);
        expect(localStorage.getItem(VERSION_KEY)).toBe('2.8.1');
    });

    it('keeps the workout and reports an error when the CDN serves a stale worker', async () => {
        document.body.innerHTML = '<button id="force-update-btn">Actualizar</button><span id="update-status" class="sr-only"></span>';
        const session = { routineId: 'routine-1', data: { ejercicios: [] }, timestamp: 123 };
        loadInProgressSessionMock.mockReturnValue(session);
        global.fetch = jest.fn()
            .mockResolvedValueOnce({ ok: true, json: async () => ({ version: '2.9.0', revision: 'v2.9.0' }) })
            .mockResolvedValueOnce({ ok: true, text: async () => "const RELEASE_REVISION = 'v2.7.12';" });
        navigator.serviceWorker.register = jest.fn();

        await forceAppUpdate();

        expect(navigator.serviceWorker.register).not.toHaveBeenCalled();
        expect(localStorage.getItem(BACKUP_SESSION_KEY)).toBeNull();
        expect(loadInProgressSessionMock()).toEqual(session);
        expect(document.getElementById('force-update-btn').disabled).toBe(false);
        expect(document.getElementById('update-status').classList.contains('sr-only')).toBe(false);
    });

    it('installs and activates the fresh release requested by the update button', async () => {
        document.body.innerHTML = '<button id="force-update-btn">Actualizar</button><span id="update-status"></span>';
        const session = { routineId: 'routine-1', data: { ejercicios: [] }, timestamp: 123 };
        loadInProgressSessionMock.mockReturnValue(session);
        global.fetch = jest.fn()
            .mockResolvedValueOnce({ ok: true, json: async () => ({ version: '2.9.0', revision: 'v2.9.0' }) })
            .mockResolvedValueOnce({ ok: true, text: async () => "const RELEASE_REVISION = 'v2.9.0';" });
        const worker = new EventTarget();
        worker.state = 'installed';
        worker.postMessage = jest.fn(() => {
            worker.state = 'activated';
            worker.dispatchEvent(new Event('statechange'));
        });
        navigator.serviceWorker.register = jest.fn(async scriptUrl => {
            worker.scriptURL = scriptUrl;
            return { waiting: worker, addEventListener: jest.fn(), removeEventListener: jest.fn() };
        });
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        try {
            await forceAppUpdate();
        } finally {
            consoleError.mockRestore();
        }
        expect(navigator.serviceWorker.register).toHaveBeenCalledTimes(1);
        expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
        expect(JSON.parse(localStorage.getItem(BACKUP_SESSION_KEY))).toEqual(session);
    });
});


it('retains an owned backup when restoration rejects another signed-in owner', () => {
    const snapshot = { ownerId: 'A', routineId: 'A-routine', timestamp: 1, data: { private: 'A values' } };
    localStorage.setItem('gym-tracker-backup-session', JSON.stringify(snapshot));
    loadInProgressSessionMock.mockReturnValue(null); saveInProgressSessionMock.mockReturnValue(false);
    expect(checkForBackupSession()).toBe(false);
    expect(localStorage.getItem('gym-tracker-backup-session')).toBe(JSON.stringify(snapshot));
    expect(saveInProgressSessionMock).toHaveBeenCalledWith(snapshot, undefined, { restoring: true });
});
