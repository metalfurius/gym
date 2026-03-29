import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { __firestoreState, __resetMockFirebase } from '../mocks/firebase-state.js';

const IN_PROGRESS_SESSION_KEY = 'gymTracker_inProgressSession';

const mockGetCurrentUser = jest.fn();
const mockShowView = jest.fn();
const mockShowLoading = jest.fn();
const mockHideLoading = jest.fn();
const mockRenderSessionView = jest.fn();
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
const mockToastWarning = jest.fn();
const mockToastInfo = jest.fn();
const mockClearTimerData = jest.fn();
const mockInvalidateProgressCache = jest.fn();
const mockTrackWrite = jest.fn();
const mockClearByPrefix = jest.fn(() => Promise.resolve());
const mockRegisterOperationHandler = jest.fn();
const mockExecuteWithOfflineHandling = jest.fn(async (operation) => operation());
const mockProcessCompletedSession = jest.fn();
const mockSyncWithFirebase = jest.fn(() => Promise.resolve());

const sessionElements = {
    exerciseList: null,
    saveBtn: null,
    form: null
};

const dashboardElements = {
    resumeSessionArea: null,
    resumeSessionInfo: null,
    resumeSessionBtn: null
};

jest.unstable_mockModule('../../js/firebase-config.js', () => ({
    db: { __isMockDb: true }
}));

jest.unstable_mockModule('../../js/auth.js', () => ({
    getCurrentUser: mockGetCurrentUser
}));

jest.unstable_mockModule('../../js/ui.js', () => ({
    showView: mockShowView,
    sessionElements,
    dashboardElements,
    showLoading: mockShowLoading,
    hideLoading: mockHideLoading,
    renderSessionView: mockRenderSessionView
}));

jest.unstable_mockModule('../../js/utils/logger.js', () => ({
    logger: {
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }
}));

jest.unstable_mockModule('../../js/utils/notifications.js', () => ({
    toast: {
        success: mockToastSuccess,
        error: mockToastError,
        warning: mockToastWarning,
        info: mockToastInfo
    }
}));

jest.unstable_mockModule('../../js/timer.js', () => ({
    clearTimerData: mockClearTimerData
}));

jest.unstable_mockModule('../../js/progress.js', () => ({
    invalidateProgressCache: mockInvalidateProgressCache
}));

jest.unstable_mockModule('../../js/utils/offline-manager.js', () => ({
    offlineManager: {
        registerOperationHandler: mockRegisterOperationHandler,
        executeWithOfflineHandling: mockExecuteWithOfflineHandling
    }
}));

jest.unstable_mockModule('../../js/utils/local-first-cache.js', () => ({
    localFirstCache: {
        clearByPrefix: mockClearByPrefix
    }
}));

jest.unstable_mockModule('../../js/utils/firebase-usage-tracker.js', () => ({
    firebaseUsageTracker: {
        trackWrite: mockTrackWrite
    }
}));

jest.unstable_mockModule('../../js/exercise-cache.js', () => ({
    exerciseCache: {
        processCompletedSession: mockProcessCompletedSession,
        syncWithFirebase: mockSyncWithFirebase
    }
}));

jest.unstable_mockModule('../../js/app.js', () => ({
    loadFirebaseDiagnostics: jest.fn()
}));

const sessionManagerModule = await import('../../js/modules/session-manager.js');

const {
    saveInProgressSession,
    loadInProgressSession,
    clearInProgressSession,
    getCurrentRoutineForSession,
    setCurrentRoutineForSession,
    getSessionFormData,
    saveSessionData,
    checkAndOfferResumeSession,
    setupSessionAutoSave
} = sessionManagerModule;

function setupDom() {
    document.body.innerHTML = `
        <form id="session-form">
            <input id="user-weight" />
            <div id="exercise-list"></div>
            <button id="save-btn" type="button">Guardar</button>
        </form>
        <div id="resume-session-area" class=""></div>
        <span id="resume-session-info"></span>
        <button id="resume-session-btn" class="hidden"></button>
    `;

    sessionElements.exerciseList = document.getElementById('exercise-list');
    sessionElements.saveBtn = document.getElementById('save-btn');
    sessionElements.form = document.getElementById('session-form');

    dashboardElements.resumeSessionArea = document.getElementById('resume-session-area');
    dashboardElements.resumeSessionInfo = document.getElementById('resume-session-info');
    dashboardElements.resumeSessionBtn = document.getElementById('resume-session-btn');
}

function setupRoutineFormValues() {
    sessionElements.exerciseList.innerHTML = `
        <div class="exercise-block" data-exercise-index="0">
            <div class="set-row">
                <input name="weight-0-0" value="80,5" />
                <input name="reps-0-0" value="8" />
                <span id="timer-display-0-0">01:30</span>
                <button class="timer-button" type="button">Timer</button>
            </div>
            <textarea name="notes-0">Buen set</textarea>
        </div>
    `;
}

describe('Session Manager', () => {
    const user = { uid: 'session-user-1' };
    const routine = {
        id: 'routine-1',
        name: 'Push Day',
        exercises: [
            { name: 'Bench Press', type: 'strength', sets: 3, reps: 8, duration: null, executionMode: 'one_hand' }
        ]
    };

    beforeEach(() => {
        jest.clearAllMocks();
        __resetMockFirebase();
        setupDom();
        localStorage.clear();
        mockGetCurrentUser.mockReturnValue(user);
        mockExecuteWithOfflineHandling.mockImplementation(async (operation) => operation());
        mockClearByPrefix.mockImplementation(() => Promise.resolve());
        mockSyncWithFirebase.mockImplementation(() => Promise.resolve());
        global.confirm = jest.fn(() => true);
        setCurrentRoutineForSession(null);
    });

    afterEach(() => {
        setCurrentRoutineForSession(null);
    });

    it('saveInProgressSession saves routine id, data and timestamp', () => {
        const data = { ejercicios: [{ nombreEjercicio: 'Bench Press' }] };
        saveInProgressSession('routine-1', data);

        const stored = JSON.parse(localStorage.getItem(IN_PROGRESS_SESSION_KEY));
        expect(stored.routineId).toBe('routine-1');
        expect(stored.data).toEqual(data);
        expect(typeof stored.timestamp).toBe('number');
    });

    it('loadInProgressSession loads stored data and clearInProgressSession removes it', () => {
        saveInProgressSession('routine-2', { ejercicios: [] });
        expect(loadInProgressSession()).toMatchObject({ routineId: 'routine-2' });

        clearInProgressSession();
        expect(loadInProgressSession()).toBeNull();
    });

    it('loadInProgressSession returns null for invalid JSON', () => {
        localStorage.setItem(IN_PROGRESS_SESSION_KEY, 'invalid-json');
        expect(loadInProgressSession()).toBeNull();
    });

    it('setCurrentRoutineForSession and getCurrentRoutineForSession manage routine state', () => {
        expect(getCurrentRoutineForSession()).toBeNull();
        setCurrentRoutineForSession(routine);
        expect(getCurrentRoutineForSession()).toEqual(routine);
        setCurrentRoutineForSession(null);
        expect(getCurrentRoutineForSession()).toBeNull();
    });

    it('getSessionFormData collects and normalizes strength data', () => {
        setCurrentRoutineForSession(routine);
        document.getElementById('user-weight').value = '75,4';
        setupRoutineFormValues();

        const formData = getSessionFormData();

        expect(formData.pesoUsuario).toBe(75.4);
        expect(formData.ejercicios).toHaveLength(1);
        expect(formData.ejercicios[0]).toMatchObject({
            nombreEjercicio: 'Bench Press',
            tipoEjercicio: 'strength',
            modoEjecucion: 'one_hand',
            objetivoSets: 3,
            objetivoReps: 8,
            notasEjercicio: 'Buen set'
        });
        expect(formData.ejercicios[0].sets[0]).toEqual({
            peso: 80.5,
            reps: 8,
            tiempoDescanso: '01:30'
        });
    });

    it('saveSessionData saves to Firestore, clears state and calls success callback', async () => {
        setCurrentRoutineForSession(routine);
        document.getElementById('user-weight').value = '74,9';
        setupRoutineFormValues();
        const onSuccess = jest.fn();

        await saveSessionData(onSuccess);

        const persisted = Array.from(__firestoreState.documents.entries()).filter(([path]) =>
            path.startsWith(`users/${user.uid}/sesiones_entrenamiento/`)
        );

        expect(persisted).toHaveLength(1);
        expect(persisted[0][1].ejercicios[0].modoEjecucion).toBe('one_hand');
        expect(mockExecuteWithOfflineHandling).toHaveBeenCalledWith(
            expect.any(Function),
            expect.stringContaining('Sin conexi'),
            true,
            expect.objectContaining({
                type: 'session.save',
                payload: expect.objectContaining({ userId: user.uid })
            })
        );
        expect(mockTrackWrite).toHaveBeenCalledWith(1, 'session.save');
        expect(mockProcessCompletedSession).toHaveBeenCalled();
        expect(mockInvalidateProgressCache).toHaveBeenCalled();
        expect(mockClearByPrefix).toHaveBeenCalledWith(`history:${user.uid}:`);
        expect(mockClearByPrefix).toHaveBeenCalledWith(`calendar:${user.uid}:`);
        expect(mockClearByPrefix).toHaveBeenCalledWith(`progress:sessions:${user.uid}`);
        expect(mockToastSuccess).toHaveBeenCalled();
        expect(mockShowView).toHaveBeenCalledWith('dashboard');
        expect(mockClearTimerData).toHaveBeenCalled();
        expect(loadInProgressSession()).toBeNull();
        expect(onSuccess).toHaveBeenCalled();
        expect(mockShowLoading).toHaveBeenCalled();
        expect(mockHideLoading).toHaveBeenCalled();
    });

    it('saveSessionData shows warning when there are no exercises to save', async () => {
        setCurrentRoutineForSession({
            id: 'routine-empty',
            name: 'Empty',
            exercises: [{ name: 'Bench Press', type: 'strength', sets: 3, reps: 8 }]
        });
        sessionElements.exerciseList.innerHTML = `
            <div class="exercise-block" data-exercise-index="0">
                <div class="set-row">
                    <input name="weight-0-0" value="" />
                    <input name="reps-0-0" value="" />
                </div>
                <textarea name="notes-0"></textarea>
            </div>
        `;

        await saveSessionData();

        expect(mockToastWarning).toHaveBeenCalled();
        expect(mockExecuteWithOfflineHandling).not.toHaveBeenCalled();
    });

    it('checkAndOfferResumeSession exposes resume action and restores session view', async () => {
        const inProgressData = {
            routineId: 'routine-1',
            data: { ejercicios: [{ nombreEjercicio: 'Bench Press' }] },
            timestamp: Date.now()
        };
        localStorage.setItem(IN_PROGRESS_SESSION_KEY, JSON.stringify(inProgressData));

        checkAndOfferResumeSession([routine]);

        expect(dashboardElements.resumeSessionInfo.textContent).toContain('Push Day');
        expect(dashboardElements.resumeSessionBtn.classList.contains('hidden')).toBe(false);
        expect(dashboardElements.resumeSessionArea.classList.contains('visible')).toBe(true);

        await dashboardElements.resumeSessionBtn.onclick();

        expect(mockRenderSessionView).toHaveBeenCalledWith(routine, inProgressData.data);
        expect(dashboardElements.resumeSessionBtn.classList.contains('hidden')).toBe(true);
        expect(dashboardElements.resumeSessionArea.classList.contains('visible')).toBe(false);
    });

    it('setupSessionAutoSave enables input auto-save for the current routine', () => {
        setCurrentRoutineForSession(routine);
        setupRoutineFormValues();
        setupSessionAutoSave();

        sessionElements.exerciseList.dispatchEvent(new Event('input', { bubbles: true }));

        const stored = JSON.parse(localStorage.getItem(IN_PROGRESS_SESSION_KEY));
        expect(stored.routineId).toBe('routine-1');
        expect(stored.data.ejercicios).toHaveLength(1);
    });
});
