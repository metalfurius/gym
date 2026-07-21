import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { MockTimestamp, __firestoreState, __resetMockFirebase } from '../mocks/firebase-state.js';

const mockClearByPrefix = jest.fn(() => Promise.resolve());
const mockGetEntry = jest.fn();
const mockSet = jest.fn();
const mockIsFresh = jest.fn();
const mockTrackRead = jest.fn();
const mockSerializeSessionsForCache = jest.fn((sessions) => sessions);
const mockDeserializeSessionsFromCache = jest.fn((sessions) => sessions);
const mockGetCurrentUser = jest.fn();

const progressElements = {
    exerciseSelect: null,
    metricSelect: null,
    periodSelect: null,
    loadingSpinner: null,
    chartContainer: null,
    chart: null,
    statsContainer: null,
    bestRecord: null,
    totalProgress: null,
    sessionCount: null,
    trendIndicator: null,
    noDataMessage: null
};

jest.unstable_mockModule('../../js/ui.js', () => ({
    progressElements
}));

jest.unstable_mockModule('../../js/utils/logger.js', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }
}));

jest.unstable_mockModule('../../js/utils/local-first-cache.js', () => ({
    localFirstCache: {
        clearByPrefix: mockClearByPrefix,
        getEntry: mockGetEntry,
        set: mockSet,
        isFresh: mockIsFresh
    }
}));

jest.unstable_mockModule('../../js/utils/firebase-usage-tracker.js', () => ({
    firebaseUsageTracker: {
        trackRead: mockTrackRead
    }
}));

jest.unstable_mockModule('../../js/utils/firestore-serialization.js', () => ({
    serializeSessionsForCache: mockSerializeSessionsForCache,
    deserializeSessionsFromCache: mockDeserializeSessionsFromCache
}));

jest.unstable_mockModule('../../js/auth.js', () => ({
    getCurrentUser: mockGetCurrentUser
}));

jest.unstable_mockModule('../../js/firebase-config.js', () => ({
    db: { __isMockDb: true }
}));

const progressModule = await import('../../js/progress.js');

const {
    loadExerciseList,
    updateChart,
    handleExerciseChange,
    invalidateProgressCache,
    clearExerciseCache,
    resetProgressView
} = progressModule;

function setupProgressDom() {
    document.body.innerHTML = `
        <select id="exercise-select"></select>
        <select id="metric-select"><option value="weight">weight</option><option value="reps">reps</option></select>
        <select id="period-select">
            <option value="3m">3m</option>
            <option value="6m">6m</option>
            <option value="1y">1y</option>
            <option value="all">all</option>
        </select>
        <div id="progress-loading" class="hidden"></div>
        <div id="progress-chart-container" class="hidden"></div>
        <canvas id="progress-chart"></canvas>
        <div id="progress-stats" class="hidden"></div>
        <div id="best-record"></div>
        <div id="total-progress"></div>
        <div id="session-count"></div>
        <div id="trend-indicator"></div>
        <div id="progress-no-data" class="hidden"></div>
    `;

    progressElements.exerciseSelect = document.getElementById('exercise-select');
    progressElements.metricSelect = document.getElementById('metric-select');
    progressElements.periodSelect = document.getElementById('period-select');
    progressElements.loadingSpinner = document.getElementById('progress-loading');
    progressElements.chartContainer = document.getElementById('progress-chart-container');
    progressElements.chart = document.getElementById('progress-chart');
    progressElements.statsContainer = document.getElementById('progress-stats');
    progressElements.bestRecord = document.getElementById('best-record');
    progressElements.totalProgress = document.getElementById('total-progress');
    progressElements.sessionCount = document.getElementById('session-count');
    progressElements.trendIndicator = document.getElementById('trend-indicator');
    progressElements.noDataMessage = document.getElementById('progress-no-data');
    progressElements.chart.getContext = jest.fn(() => ({}));
}

function buildSessionHistory(weights, exerciseName = 'Bench Press') {
    return weights.map((weight, idx) => ({
        id: `session-${idx + 1}`,
        fecha: {
            toDate: () => new Date(`2026-03-0${idx + 1}T08:00:00.000Z`)
        },
        ejercicios: [{
            nombreEjercicio: exerciseName,
            tipoEjercicio: 'strength',
            modoEjecucion: 'two_hand',
            tipoCarga: 'external',
            sets: [{ peso: weight, reps: 8 }]
        }]
    }));
}

describe('progress flow', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        __resetMockFirebase();
        setupProgressDom();
        setProgressOnline(true);
        mockGetCurrentUser.mockReturnValue({ uid: 'user-progress-1' });
        mockIsFresh.mockReturnValue(true);
        mockGetEntry.mockResolvedValue(null);
        mockSet.mockResolvedValue(undefined);
        global.Chart = jest.fn(() => ({ destroy: jest.fn() }));
        invalidateProgressCache();
    });

    function buildFirestoreSession(id, date, exerciseName, weight, options = {}) {
        const exercise = {
            nombreEjercicio: exerciseName,
            tipoEjercicio: 'strength',
            modoEjecucion: options.executionMode || 'two_hand',
            tipoCarga: options.loadType || 'external',
            sets: [{
                peso: weight,
                reps: options.reps || 8,
                ...(options.totalWeight === undefined ? {} : { pesoTotal: options.totalWeight })
            }]
        };

        return {
            id,
            fecha: MockTimestamp.fromDate(date),
            pesoUsuario: options.bodyweight || null,
            ejercicios: [exercise]
        };
    }

    function seedFirestoreSessions(sessions) {
        sessions.forEach((session) => {
            __firestoreState.documents.set(
                `users/user-progress-1/sesiones_entrenamiento/${session.id}`,
                session
            );
        });
    }

    function setProgressOnline(value) {
        Object.defineProperty(navigator, 'onLine', {
            configurable: true,
            value
        });
    }

    it('loads exercise list from bounded session history and reuses in-memory cache', async () => {
        mockGetEntry.mockResolvedValue({
            value: [
                ...buildSessionHistory([60, 65, 70, 72], 'Bench Press'),
                ...buildSessionHistory([80, 85, 90], 'Squats')
            ],
            updatedAt: Date.now()
        });

        await loadExerciseList();

        const optionLabels = Array.from(progressElements.exerciseSelect.options).map((opt) => opt.textContent);
        expect(optionLabels[0]).toContain('Selecciona');
        expect(optionLabels).toContain('Bench Press (4 sesiones)');
        expect(optionLabels).toContain('Squats (3 sesiones)');
        expect(mockGetEntry).toHaveBeenCalledTimes(1);

        mockGetEntry.mockResolvedValue(null);
        await loadExerciseList();
        expect(mockGetEntry).toHaveBeenCalledTimes(1);
    });

    it('keeps older exercises selectable after a reload/restart while offline', async () => {
        resetProgressView();
        setProgressOnline(false);
        mockIsFresh.mockReturnValue(false);
        mockGetEntry.mockResolvedValue({
            value: buildSessionHistory([60, 65, 70]),
            updatedAt: Date.now() - (30 * 24 * 60 * 60 * 1000)
        });

        await loadExerciseList();

        const optionLabels = Array.from(progressElements.exerciseSelect.options).map((opt) => opt.textContent);
        expect(optionLabels).toContain('Bench Press (3 sesiones)');
        expect(mockTrackRead).not.toHaveBeenCalled();
    });

    it('uses one bounded online session query for long history and preserves range counts', async () => {
        setProgressOnline(true);
        mockIsFresh.mockReturnValue(false);

        const now = new Date();
        const daysAgo = (days) => new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
        const benchSessions = [500, 430, 330, 250, 190, 170, 130, 100, 80, 50, 20]
            .map((days, index) => buildFirestoreSession(
                `bench-${index + 1}`,
                daysAgo(days),
                'Bench Press',
                60 + index
            ));
        const otherSessions = Array.from({ length: 10 }, (_, index) => buildFirestoreSession(
            `squat-${index + 1}`,
            daysAgo(index + 1),
            'Squat',
            100 + index
        ));
        const sessions = [...benchSessions, ...otherSessions];
        seedFirestoreSessions(sessions);
        mockGetEntry.mockResolvedValue(null);

        await loadExerciseList();

        const benchOption = Array.from(progressElements.exerciseSelect.options)
            .find((option) => option.textContent.startsWith('Bench Press'));
        expect(benchOption).toBeDefined();
        expect(benchOption.textContent).toBe('Bench Press (11 sesiones)');
        expect(mockTrackRead).toHaveBeenCalledWith(21, 'progress.sessionHistoryFallback', {
            limit: 300
        });

        mockGetEntry.mockResolvedValue({ value: sessions, updatedAt: Date.now() });
        progressElements.exerciseSelect.value = benchOption.value;
        progressElements.metricSelect.value = 'weight';

        for (const [period, expectedCount] of [['3m', 3], ['6m', 6], ['1y', 9], ['all', 11]]) {
            progressElements.periodSelect.value = period;
            await updateChart();
            expect(progressElements.sessionCount.textContent).toBe(String(expectedCount));
        }
    });

    it('keeps execution variants and body-weight totals distinct in analytical history', async () => {
        setProgressOnline(false);
        mockIsFresh.mockReturnValue(false);
        const now = new Date();
        const sessions = [
            ...[1, 2, 3].map((days, index) => buildFirestoreSession(
                `one-hand-${index + 1}`,
                new Date(now.getTime() - (days * 24 * 60 * 60 * 1000)),
                'Bench Press',
                60 + index,
                { executionMode: 'one_hand' }
            )),
            ...[4, 5, 6].map((days, index) => buildFirestoreSession(
                `bodyweight-${index + 1}`,
                new Date(now.getTime() - (days * 24 * 60 * 60 * 1000)),
                'Bench Press',
                10 + index,
                {
                    executionMode: 'machine',
                    loadType: 'bodyweight',
                    bodyweight: 80,
                    totalWeight: 90 + index
                }
            ))
        ];
        mockGetEntry.mockResolvedValue({ value: sessions, updatedAt: Date.now() });

        await loadExerciseList();

        const options = Array.from(progressElements.exerciseSelect.options);
        const oneHandOption = options.find((option) => option.value.includes('mode=one_hand'));
        const bodyweightOption = options.find((option) => option.value.includes('mode=machine') && option.value.includes('load=bodyweight'));
        expect(oneHandOption).toBeDefined();
        expect(bodyweightOption).toBeDefined();

        progressElements.exerciseSelect.value = bodyweightOption.value;
        progressElements.periodSelect.value = 'all';
        await updateChart();

        expect(progressElements.sessionCount.textContent).toBe('3');
        expect(progressElements.bestRecord.textContent).toBe('92.0 kg');
    });

    it('updates chart and stats when enough data points exist', async () => {
        mockGetEntry.mockResolvedValue({
            value: buildSessionHistory([60, 65, 70, 72]),
            updatedAt: Date.now()
        });

        progressElements.exerciseSelect.innerHTML = '<option value="Bench%20Press::mode=two_hand::load=external" selected>Bench Press</option>';
        progressElements.metricSelect.value = 'weight';
        progressElements.periodSelect.value = 'all';

        await updateChart();

        expect(global.Chart).toHaveBeenCalledTimes(1);
        expect(progressElements.chartContainer.classList.contains('hidden')).toBe(false);
        expect(progressElements.statsContainer.classList.contains('hidden')).toBe(false);
        expect(progressElements.noDataMessage.classList.contains('hidden')).toBe(true);
        expect(progressElements.bestRecord.textContent).toBe('72.0 kg');
        expect(progressElements.sessionCount.textContent).toBe('4');
        expect(progressElements.totalProgress.textContent).toBe('+12.0 kg');
        expect(progressElements.trendIndicator.className).toBe('trend-up');
    });

    it('shows no-data state when fewer than three data points exist', async () => {
        mockGetEntry.mockResolvedValue({
            value: buildSessionHistory([60, 65]),
            updatedAt: Date.now()
        });

        progressElements.exerciseSelect.innerHTML = '<option value="Bench%20Press::mode=two_hand::load=external" selected>Bench Press</option>';
        progressElements.metricSelect.value = 'weight';
        progressElements.periodSelect.value = 'all';

        await updateChart();

        expect(progressElements.chartContainer.classList.contains('hidden')).toBe(true);
        expect(progressElements.statsContainer.classList.contains('hidden')).toBe(true);
        expect(progressElements.noDataMessage.classList.contains('hidden')).toBe(false);
    });

    it('hides progress widgets when exercise is cleared', async () => {
        progressElements.chartContainer.classList.remove('hidden');
        progressElements.statsContainer.classList.remove('hidden');
        progressElements.noDataMessage.classList.remove('hidden');
        progressElements.exerciseSelect.innerHTML = '<option value="" selected></option>';

        await handleExerciseChange();

        expect(progressElements.chartContainer.classList.contains('hidden')).toBe(true);
        expect(progressElements.statsContainer.classList.contains('hidden')).toBe(true);
        expect(progressElements.noDataMessage.classList.contains('hidden')).toBe(true);
    });

    it('invalidates and clears progress cache prefixes', () => {
        mockClearByPrefix.mockClear();
        invalidateProgressCache();
        clearExerciseCache();

        expect(mockClearByPrefix).toHaveBeenCalledWith('progress:sessions:');
        expect(mockClearByPrefix).toHaveBeenCalledTimes(2);
    });

    it('resets progress view and restores default selector placeholder', async () => {
        mockGetEntry.mockResolvedValue({
            value: buildSessionHistory([60, 65, 70]),
            updatedAt: Date.now()
        });

        progressElements.exerciseSelect.innerHTML = '<option value="Bench%20Press::mode=two_hand::load=external" selected>Bench Press</option>';
        progressElements.metricSelect.value = 'weight';
        progressElements.periodSelect.value = 'all';
        await updateChart();

        resetProgressView();

        expect(progressElements.chartContainer.classList.contains('hidden')).toBe(true);
        expect(progressElements.statsContainer.classList.contains('hidden')).toBe(true);
        expect(progressElements.noDataMessage.classList.contains('hidden')).toBe(true);
        expect(progressElements.exerciseSelect.innerHTML).toContain('Cargando ejercicios');
    });
});
