import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockClearByPrefix = jest.fn(() => Promise.resolve());
const mockGetEntry = jest.fn();
const mockSet = jest.fn();
const mockIsFresh = jest.fn();
const mockTrackRead = jest.fn();
const mockSerializeSessionsForCache = jest.fn((sessions) => sessions);
const mockDeserializeSessionsFromCache = jest.fn((sessions) => sessions);
const mockGetCurrentUser = jest.fn();
const mockValidateAndRebuildCache = jest.fn();
const mockExportCache = jest.fn();

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

jest.unstable_mockModule('../../js/exercise-cache.js', () => ({
    exerciseCache: {
        exportCache: mockExportCache,
        validateAndRebuildCache: mockValidateAndRebuildCache
    }
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
        <select id="period-select"><option value="all">all</option></select>
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

function buildHistory(weights) {
    return weights.map((weight, idx) => ({
        date: new Date(`2026-03-0${idx + 1}T08:00:00.000Z`).toISOString(),
        sets: [{ peso: weight, reps: 8 }]
    }));
}

describe('progress flow', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setupProgressDom();
        mockGetCurrentUser.mockReturnValue({ uid: 'user-progress-1' });
        mockIsFresh.mockReturnValue(true);
        mockGetEntry.mockResolvedValue(null);
        mockSet.mockResolvedValue(undefined);
        global.Chart = jest.fn(() => ({ destroy: jest.fn() }));
        invalidateProgressCache();
    });

    it('loads exercise list from cache manager and reuses in-memory cache', async () => {
        mockExportCache.mockReturnValue({
            bench_press: {
                originalName: 'Bench Press',
                history: buildHistory([60, 65, 70, 72])
            },
            squats: {
                originalName: 'Squats',
                history: buildHistory([80, 85, 90])
            }
        });

        await loadExerciseList();

        const optionLabels = Array.from(progressElements.exerciseSelect.options).map((opt) => opt.textContent);
        expect(optionLabels[0]).toContain('Selecciona');
        expect(optionLabels).toContain('Bench Press (4 sesiones)');
        expect(optionLabels).toContain('Squats (3 sesiones)');
        expect(mockExportCache).toHaveBeenCalledTimes(1);

        mockExportCache.mockReturnValue({});
        await loadExerciseList();
        expect(mockExportCache).toHaveBeenCalledTimes(1);
    });

    it('updates chart and stats when enough data points exist', async () => {
        mockExportCache.mockReturnValue({
            bench_press: {
                originalName: 'Bench Press',
                history: buildHistory([60, 65, 70, 72])
            }
        });

        progressElements.exerciseSelect.innerHTML = '<option value="Bench Press" selected>Bench Press</option>';
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
        mockExportCache.mockReturnValue({
            bench_press: {
                originalName: 'Bench Press',
                history: buildHistory([60, 65])
            }
        });

        progressElements.exerciseSelect.innerHTML = '<option value="Bench Press" selected>Bench Press</option>';
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
        mockExportCache.mockReturnValue({
            bench_press: {
                originalName: 'Bench Press',
                history: buildHistory([60, 65, 70])
            }
        });

        progressElements.exerciseSelect.innerHTML = '<option value="Bench Press" selected>Bench Press</option>';
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
