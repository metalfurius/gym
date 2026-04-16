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
    saveQuickLogEntry,
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

function setupRoutineFormValuesWithSessionVariants({
    executionMode = 'machine',
    loadType = 'bodyweight',
    weight = '-10',
    reps = '8'
} = {}) {
    sessionElements.exerciseList.innerHTML = `
        <div class="exercise-block" data-exercise-index="0">
            <select name="session-execution-mode">
                <option value="one_hand">Una mano</option>
                <option value="two_hand">Dos manos</option>
                <option value="machine">Maquina</option>
                <option value="pulley">Polea</option>
                <option value="other">Otro</option>
            </select>
            <select name="session-load-type">
                <option value="external">Carga externa</option>
                <option value="bodyweight">Peso corporal (+/-)</option>
            </select>
            <div class="set-row">
                <input name="weight-0-0" value="${weight}" />
                <input name="reps-0-0" value="${reps}" />
                <span id="timer-display-0-0">01:30</span>
                <button class="timer-button" type="button">Timer</button>
            </div>
            <textarea name="notes-0">Con variantes</textarea>
        </div>
    `;

    sessionElements.exerciseList.querySelector('select[name="session-execution-mode"]').value = executionMode;
    sessionElements.exerciseList.querySelector('select[name="session-load-type"]').value = loadType;
}

function setupRoutineFormVariantOnlyValues({
    executionMode = 'machine',
    loadType = 'bodyweight'
} = {}) {
    sessionElements.exerciseList.innerHTML = `
        <div class="exercise-block" data-exercise-index="0">
            <select name="session-execution-mode">
                <option value="one_hand">Una mano</option>
                <option value="two_hand">Dos manos</option>
                <option value="machine">Maquina</option>
                <option value="pulley">Polea</option>
                <option value="other">Otro</option>
            </select>
            <select name="session-load-type">
                <option value="external">Carga externa</option>
                <option value="bodyweight">Peso corporal (+/-)</option>
            </select>
            <div class="set-row">
                <input name="weight-0-0" value="" />
                <input name="reps-0-0" value="" />
                <span id="timer-display-0-0">00:00</span>
                <button class="timer-button" type="button">Timer</button>
            </div>
            <textarea name="notes-0"></textarea>
        </div>
    `;

    sessionElements.exerciseList.querySelector('select[name="session-execution-mode"]').value = executionMode;
    sessionElements.exerciseList.querySelector('select[name="session-load-type"]').value = loadType;
}

describe('Session Manager', () => {
    const user = { uid: 'session-user-1' };
    const routine = {
        id: 'routine-1',
        name: 'Push Day',
        exercises: [
            {
                name: 'Bench Press',
                type: 'strength',
                sets: 3,
                reps: 8,
                duration: null,
                executionMode: 'one_hand',
                loadType: 'external'
            }
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
            tipoCarga: 'external',
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

    it('getSessionFormData uses selected session variants over routine defaults', () => {
        setCurrentRoutineForSession(routine);
        setupRoutineFormValuesWithSessionVariants({
            executionMode: 'machine',
            loadType: 'bodyweight',
            weight: '-12',
            reps: '6'
        });

        const formData = getSessionFormData();
        expect(formData.ejercicios[0].modoEjecucion).toBe('machine');
        expect(formData.ejercicios[0].tipoCarga).toBe('bodyweight');
        expect(formData.ejercicios[0].sets[0].peso).toBe(-12);
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
        expect(persisted[0][1].ejercicios[0].tipoCarga).toBe('external');
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

    it('saveSessionData remembers selected variants in local override storage', async () => {
        setCurrentRoutineForSession(routine);
        setupRoutineFormValuesWithSessionVariants({
            executionMode: 'pulley',
            loadType: 'bodyweight',
            weight: '10',
            reps: '8'
        });

        await saveSessionData();

        const savedOverrides = JSON.parse(
            localStorage.getItem(`gym-tracker:session-variant-overrides:${user.uid}`)
        );

        expect(savedOverrides['routine-1::bench press']).toEqual({
            executionMode: 'pulley',
            loadType: 'bodyweight'
        });
    });

    it('saveSessionData remembers selected variants even when session save is queued offline', async () => {
        setCurrentRoutineForSession(routine);
        setupRoutineFormValuesWithSessionVariants({
            executionMode: 'machine',
            loadType: 'bodyweight',
            weight: '8',
            reps: '8'
        });
        mockExecuteWithOfflineHandling.mockImplementation(async () => {
            throw new Error('Offline: queued');
        });

        await saveSessionData();

        const savedOverrides = JSON.parse(
            localStorage.getItem(`gym-tracker:session-variant-overrides:${user.uid}`)
        );

        expect(savedOverrides['routine-1::bench press']).toEqual({
            executionMode: 'machine',
            loadType: 'bodyweight'
        });
        expect(mockToastInfo).toHaveBeenCalled();
        expect(__firestoreState.documents.size).toBe(0);
    });

    it('saveQuickLogEntry saves a quick log session and clears caches', async () => {
        const onSuccess = jest.fn();
        const result = await saveQuickLogEntry(
            {
                label: 'Quick Morning',
                dateTime: '2026-03-29T08:30',
                notesText: 'Movilidad 10m\nPlancha 45s'
            },
            onSuccess,
            {
                triggerButton: sessionElements.saveBtn
            }
        );

        const persisted = Array.from(__firestoreState.documents.entries()).filter(([path]) =>
            path.startsWith(`users/${user.uid}/sesiones_entrenamiento/`)
        );

        expect(result.ok).toBe(true);
        expect(result.queued).toBe(false);
        expect(persisted).toHaveLength(1);
        expect(persisted[0][1].nombreEntrenamiento).toBe('Quick Morning');
        expect(persisted[0][1].quickLog.source).toBe('quick_log');
        expect(mockExecuteWithOfflineHandling).toHaveBeenCalledWith(
            expect.any(Function),
            expect.stringContaining('Quick Log'),
            true,
            expect.objectContaining({
                type: 'quicklog.save',
                payload: expect.objectContaining({ userId: user.uid })
            })
        );
        expect(mockTrackWrite).toHaveBeenCalledWith(1, 'quicklog.save');
        expect(mockClearByPrefix).toHaveBeenCalledWith(`history:${user.uid}:`);
        expect(mockClearByPrefix).toHaveBeenCalledWith(`calendar:${user.uid}:`);
        expect(onSuccess).toHaveBeenCalled();
        expect(mockShowLoading).toHaveBeenCalled();
        expect(mockHideLoading).toHaveBeenCalled();
    });

    it('computes bodyweight total load with last known bodyweight fallback', () => {
        localStorage.setItem('gym-tracker:last-known-bodyweight:session-user-1', '78');
        setCurrentRoutineForSession({
            id: 'routine-bw',
            name: 'Pull Day',
            exercises: [
                { name: 'Dominadas', type: 'strength', sets: 1, reps: 8, executionMode: 'two_hand', loadType: 'bodyweight' }
            ]
        });

        sessionElements.exerciseList.innerHTML = `
            <div class="exercise-block" data-exercise-index="0">
                <div class="set-row">
                    <input name="weight-0-0" value="-15" />
                    <input name="reps-0-0" value="8" />
                    <span id="timer-display-0-0">01:00</span>
                </div>
                <textarea name="notes-0"></textarea>
            </div>
        `;

        const formData = getSessionFormData();
        expect(formData.ejercicios[0].tipoCarga).toBe('bodyweight');
        expect(formData.ejercicios[0].sets[0].peso).toBe(-15);
        expect(formData.ejercicios[0].sets[0].pesoTotal).toBe(63);
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

    it('setupSessionAutoSave preserves variant-only changes in in-progress snapshots', () => {
        setCurrentRoutineForSession(routine);
        setupRoutineFormVariantOnlyValues({
            executionMode: 'pulley',
            loadType: 'bodyweight'
        });
        setupSessionAutoSave();

        sessionElements.exerciseList.dispatchEvent(new Event('change', { bubbles: true }));

        const stored = JSON.parse(localStorage.getItem(IN_PROGRESS_SESSION_KEY));
        expect(stored.routineId).toBe('routine-1');
        expect(stored.data.ejercicios).toHaveLength(1);
        expect(stored.data.ejercicios[0]).toMatchObject({
            nombreEjercicio: 'Bench Press',
            modoEjecucion: 'pulley',
            tipoCarga: 'bodyweight'
        });
        expect(stored.data.ejercicios[0].sets).toHaveLength(0);
    });

    it('setupSessionAutoSave keeps variant-only snapshot when timer auto-save runs', async () => {
        setCurrentRoutineForSession(routine);
        setupRoutineFormVariantOnlyValues({
            executionMode: 'machine',
            loadType: 'bodyweight'
        });
        setupSessionAutoSave();

        const timerButton = sessionElements.exerciseList.querySelector('.timer-button');
        timerButton.dispatchEvent(new Event('click', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 150));

        const stored = JSON.parse(localStorage.getItem(IN_PROGRESS_SESSION_KEY));
        expect(stored.routineId).toBe('routine-1');
        expect(stored.data.ejercicios).toHaveLength(1);
        expect(stored.data.ejercicios[0]).toMatchObject({
            nombreEjercicio: 'Bench Press',
            modoEjecucion: 'machine',
            tipoCarga: 'bodyweight'
        });
    });
});
