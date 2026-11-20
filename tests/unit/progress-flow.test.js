import { __setMockQueryResultHandler, __resetMockFirestoreBehavior } from '../mocks/firebase-firestore.js';
import { beginAccountSession } from '../../js/utils/account-scope.js';
import { setCalendarClock } from '../../js/utils/calendar-clock.js';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { MockTimestamp, __firestoreState, __resetMockFirebase } from '../mocks/firebase-state.js';

const mockClearByPrefix = jest.fn(() => Promise.resolve());
const mockGetEntry = jest.fn();
const mockSet = jest.fn();
const mockIsFresh = jest.fn();
const mockTrackRead = jest.fn();
const mockSerializeSessionsForCache = jest.fn(sessions => sessions);
const mockDeserializeSessionsFromCache = jest.fn(sessions => sessions);
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
    noDataMessage: null,
};

jest.unstable_mockModule('../../js/ui.js', () => ({
    progressElements,
}));

jest.unstable_mockModule('../../js/utils/logger.js', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}));

jest.unstable_mockModule('../../js/utils/local-first-cache.js', () => ({
    localFirstCache: {
        clearByPrefix: mockClearByPrefix,
        remove: mockClearByPrefix,
        getEntry: mockGetEntry,
        set: mockSet,
        isFresh: mockIsFresh,
    },
}));

jest.unstable_mockModule('../../js/utils/firebase-usage-tracker.js', () => ({
    firebaseUsageTracker: {
        trackRead: mockTrackRead,
    },
}));

jest.unstable_mockModule('../../js/utils/firestore-serialization.js', () => ({
    serializeSessionsForCache: mockSerializeSessionsForCache,
    deserializeSessionsFromCache: mockDeserializeSessionsFromCache,
}));

jest.unstable_mockModule('../../js/auth.js', () => ({
    getCurrentUser: mockGetCurrentUser,
}));

jest.unstable_mockModule('../../js/utils/auth-state.js', () => ({
    getCurrentUser: mockGetCurrentUser,
}));

jest.unstable_mockModule('../../js/firebase-config.js', () => ({
    db: { __isMockDb: true },
}));

const progressModule = await import(process.env.GYM_SYNC_PROGRESS_MODULE || '../../js/progress.js');

const {
    loadExerciseList,
    updateChart,
    handleExerciseChange,
    invalidateProgressCache,
    clearExerciseCache,
    resetProgressView,
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
        id: `${exerciseName}-session-${idx + 1}`,
        fecha: {
            toDate: () => new Date(`2026-03-0${idx + 1}T08:00:00.000Z`),
        },
        ejercicios: [
            {
                nombreEjercicio: exerciseName,
                tipoEjercicio: 'strength',
                modoEjecucion: 'two_hand',
                tipoCarga: 'external',
                sets: [{ peso: weight, reps: 8 }],
            },
        ],
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
            sets: [
                {
                    peso: weight,
                    reps: options.reps || 8,
                    ...(options.totalWeight === undefined ? {} : { pesoTotal: options.totalWeight }),
                },
            ],
        };

        return {
            id,
            fecha: MockTimestamp.fromDate(date),
            pesoUsuario: options.bodyweight || null,
            ejercicios: [exercise],
        };
    }

    function seedFirestoreSessions(sessions) {
        sessions.forEach(session => {
            __firestoreState.documents.set(`users/user-progress-1/sesiones_entrenamiento/${session.id}`, session);
        });
    }

    function setProgressOnline(value) {
        Object.defineProperty(navigator, 'onLine', {
            configurable: true,
            value,
        });
    }

    it('loads exercise list from bounded session history and reuses in-memory cache', async () => {
        mockGetEntry.mockResolvedValue({
            value: [
                ...buildSessionHistory([60, 65, 70, 72], 'Bench Press'),
                ...buildSessionHistory([80, 85, 90], 'Squats'),
            ],
            updatedAt: Date.now(),
        });

        await loadExerciseList();

        const optionLabels = Array.from(progressElements.exerciseSelect.options).map(opt => opt.textContent);
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
            updatedAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
        });

        await loadExerciseList();

        const optionLabels = Array.from(progressElements.exerciseSelect.options).map(opt => opt.textContent);
        expect(optionLabels).toContain('Bench Press (3 sesiones)');
        expect(mockTrackRead).not.toHaveBeenCalled();
    });

    it('uses one bounded online session query for long history and preserves range counts', async () => {
        setProgressOnline(true);
        mockIsFresh.mockReturnValue(false);

        const now = new Date();
        const daysAgo = days => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        const benchSessions = [500, 430, 330, 250, 190, 170, 130, 100, 80, 50, 20].map((days, index) =>
            buildFirestoreSession(`bench-${index + 1}`, daysAgo(days), 'Bench Press', 60 + index)
        );
        const otherSessions = Array.from({ length: 10 }, (_, index) =>
            buildFirestoreSession(`squat-${index + 1}`, daysAgo(index + 1), 'Squat', 100 + index)
        );
        const sessions = [...benchSessions, ...otherSessions];
        seedFirestoreSessions(sessions);
        mockGetEntry.mockResolvedValue(null);

        await loadExerciseList();

        const benchOption = Array.from(progressElements.exerciseSelect.options).find(option =>
            option.textContent.startsWith('Bench Press')
        );
        expect(benchOption).toBeDefined();
        expect(benchOption.textContent).toBe('Bench Press (11 sesiones)');
        expect(mockTrackRead).toHaveBeenCalledWith(21, 'progress.sessionHistoryFallback', {
            limit: 301,
        });

        mockGetEntry.mockResolvedValue({ value: sessions, updatedAt: Date.now() });
        progressElements.exerciseSelect.value = benchOption.value;
        progressElements.metricSelect.value = 'weight';

        for (const [period, expectedCount] of [
            ['3m', 3],
            ['6m', 6],
            ['1y', 9],
            ['all', 11],
        ]) {
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
            ...[1, 2, 3].map((days, index) =>
                buildFirestoreSession(
                    `one-hand-${index + 1}`,
                    new Date(now.getTime() - days * 24 * 60 * 60 * 1000),
                    'Bench Press',
                    60 + index,
                    { executionMode: 'one_hand' }
                )
            ),
            ...[4, 5, 6].map((days, index) =>
                buildFirestoreSession(
                    `bodyweight-${index + 1}`,
                    new Date(now.getTime() - days * 24 * 60 * 60 * 1000),
                    'Bench Press',
                    10 + index,
                    {
                        executionMode: 'machine',
                        loadType: 'bodyweight',
                        bodyweight: 80,
                        totalWeight: 90 + index,
                    }
                )
            ),
        ];
        mockGetEntry.mockResolvedValue({ value: sessions, updatedAt: Date.now() });

        await loadExerciseList();

        const options = Array.from(progressElements.exerciseSelect.options);
        const oneHandOption = options.find(option => option.value.includes('mode=one_hand'));
        const bodyweightOption = options.find(
            option => option.value.includes('mode=machine') && option.value.includes('load=bodyweight')
        );
        expect(oneHandOption).toBeDefined();
        expect(bodyweightOption).toBeDefined();

        progressElements.exerciseSelect.value = bodyweightOption.value;
        progressElements.periodSelect.value = 'all';
        await updateChart();

        expect(progressElements.sessionCount.textContent).toBe('3');
        expect(progressElements.bestRecord.textContent).toBe('92.0 kg');
    });

    it('parses decimal commas and never truncates fractional repetitions in analytics', async () => {
        setProgressOnline(false);
        mockIsFresh.mockReturnValue(true);
        const sessions = [1, 2, 3].map((days, index) =>
            buildFirestoreSession(
                `decimal-${index + 1}`,
                new Date(Date.now() - days * 24 * 60 * 60 * 1000),
                'Bench Press',
                '-12,5',
                {
                    executionMode: 'machine',
                    loadType: 'bodyweight',
                    bodyweight: '78,4',
                    totalWeight: '65,9',
                    reps: '8.5',
                }
            )
        );
        mockGetEntry.mockResolvedValue({ value: sessions, updatedAt: Date.now() });

        await loadExerciseList();
        const bodyweightOption = Array.from(progressElements.exerciseSelect.options).find(
            option => option.value.includes('mode=machine') && option.value.includes('load=bodyweight')
        );
        expect(bodyweightOption).toBeDefined();

        progressElements.exerciseSelect.value = bodyweightOption.value;
        progressElements.periodSelect.value = 'all';
        progressElements.metricSelect.value = 'weight';
        await updateChart();
        expect(progressElements.bestRecord.textContent).toBe('65.9 kg');

        progressElements.metricSelect.value = 'reps';
        await updateChart();
        expect(progressElements.bestRecord.textContent).toBe('0.0 reps');
    });

    it('updates chart and stats when enough data points exist', async () => {
        mockGetEntry.mockResolvedValue({
            value: buildSessionHistory([60, 65, 70, 72]),
            updatedAt: Date.now(),
        });

        progressElements.exerciseSelect.innerHTML =
            '<option value="Bench%20Press::mode=two_hand::load=external" selected>Bench Press</option>';
        progressElements.metricSelect.value = 'weight';
        progressElements.periodSelect.value = 'all';

        await updateChart();

        expect(global.Chart).toHaveBeenCalledTimes(1);
        expect(progressElements.chartContainer.classList.contains('hidden')).toBe(false);
        expect(progressElements.statsContainer.classList.contains('hidden')).toBe(false);
        expect(progressElements.noDataMessage.classList.contains('hidden')).toBe(true);
        expect(progressElements.chart.getAttribute('role')).toBe('img');
        expect(progressElements.chart.getAttribute('aria-label')).toContain('Bench Press');
        expect(progressElements.chart.getAttribute('aria-label')).toContain('60');
        expect(progressElements.bestRecord.textContent).toBe('72.0 kg');
        expect(progressElements.sessionCount.textContent).toBe('4');
        expect(progressElements.totalProgress.textContent).toBe('+12.0 kg');
        expect(progressElements.trendIndicator.className).toBe('trend-up');
    });

    it('shows no-data state when fewer than three data points exist', async () => {
        mockGetEntry.mockResolvedValue({
            value: buildSessionHistory([60, 65]),
            updatedAt: Date.now(),
        });

        progressElements.exerciseSelect.innerHTML =
            '<option value="Bench%20Press::mode=two_hand::load=external" selected>Bench Press</option>';
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

        expect(mockClearByPrefix).toHaveBeenCalledWith('progress:sessions:user-progress-1');
        expect(mockClearByPrefix).toHaveBeenCalledTimes(2);
    });

    it('resets progress view and restores default selector placeholder', async () => {
        mockGetEntry.mockResolvedValue({
            value: buildSessionHistory([60, 65, 70]),
            updatedAt: Date.now(),
        });

        progressElements.exerciseSelect.innerHTML =
            '<option value="Bench%20Press::mode=two_hand::load=external" selected>Bench Press</option>';
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

function deferredProgressRead() {
    let resolve; let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

describe('progress deferred UI ownership', () => {
    const firstValue = 'Bench%20Press::mode=two_hand::load=external';
    const secondValue = 'Squats::mode=two_hand::load=external';
    const cached = (weights, name = 'Bench Press') => ({ value: buildSessionHistory(weights, name), metadata: { complete: true } });
    beforeEach(() => {
        jest.clearAllMocks(); setupProgressDom();
        mockGetCurrentUser.mockReturnValue({ uid: 'race-owner' }); beginAccountSession('race-owner');
        setCalendarClock(() => '2026-03-20T12:00:00Z');
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
        mockIsFresh.mockReturnValue(true); mockSet.mockResolvedValue(undefined);
        invalidateProgressCache('race-owner', { durable: false });
        progressElements.exerciseSelect.innerHTML = `<option value="${firstValue}">Bench</option><option value="${secondValue}">Squats</option>`;
        progressElements.periodSelect.value = 'all'; progressElements.metricSelect.value = 'weight';
        global.Chart = jest.fn(() => ({ destroy: jest.fn() }));
    });
    afterEach(() => { setCalendarClock(); jest.useRealTimers(); });

    it.each(['success', 'error'])('ignores an old exercise %s after the new chart, table and stats render', async outcome => {
        const old = deferredProgressRead(); const latest = deferredProgressRead();
        mockGetEntry.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
        const first = updateChart();
        progressElements.exerciseSelect.value = secondValue;
        const second = updateChart();
        latest.resolve(cached([100, 110, 120], 'Squats')); await second;
        const chartCount = global.Chart.mock.calls.length;
        if (outcome === 'success') old.resolve(cached([10, 20, 30])); else old.reject(new Error('late old failure'));
        await first;
        expect(global.Chart).toHaveBeenCalledTimes(chartCount);
        expect(global.Chart.mock.calls.at(-1)[1].data.datasets[0].data).toEqual([100, 110, 120]);
        expect(progressElements.bestRecord.textContent).toBe('120.0 kg');
        expect(progressElements.sessionCount.textContent).toBe('3');
        expect(progressElements.noDataMessage.classList.contains('hidden')).toBe(true);
        expect(document.querySelector('#progress-data-table caption').textContent).toContain('Squats');
        expect(document.querySelector('#progress-data-table tbody').textContent).toContain('120');
        expect(progressElements.loadingSpinner.classList.contains('hidden')).toBe(true);
        expect(progressElements.noDataMessage.classList.contains('hidden')).toBe(true);
        expect(mockSet).not.toHaveBeenCalled(); // Superseded cached reads never get persisted.
    });

    it('does not hide the latest spinner when an older period request finishes', async () => {
        const old = deferredProgressRead(); const latest = deferredProgressRead();
        mockGetEntry.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
        const first = updateChart();
        progressElements.periodSelect.value = '3m';
        progressElements.metricSelect.value = 'reps';
        const second = updateChart();
        old.resolve(cached([10, 20, 30])); await first;
        expect(global.Chart).not.toHaveBeenCalled();
        expect(progressElements.loadingSpinner.classList.contains('hidden')).toBe(false);
        latest.resolve(cached([100, 110, 120])); await second;
        expect(global.Chart.mock.calls.at(-1)[1].data.datasets[0].data).toEqual([8, 8, 8]);
        expect(progressElements.loadingSpinner.classList.contains('hidden')).toBe(true);
    });

    it('invalidates delayed chart-library callbacks when selection is cleared', async () => {
        jest.useFakeTimers(); global.Chart = undefined;
        mockGetEntry.mockResolvedValue(cached([10, 20, 30]));
        await updateChart();
        progressElements.exerciseSelect.innerHTML = '<option value=""></option>';
        await handleExerciseChange();
        global.Chart = jest.fn(() => ({ destroy: jest.fn() }));
        await jest.advanceTimersByTimeAsync(2500);
        expect(global.Chart).not.toHaveBeenCalled();
        expect(document.getElementById('progress-data-table')).toBeNull();
    });

    it('rejects both result and selector cache application across A -> B -> A generations', async () => {
        const old = deferredProgressRead();
        mockGetEntry.mockReturnValueOnce(old.promise);
        const first = loadExerciseList();
        mockGetCurrentUser.mockReturnValue({ uid: 'other-owner' }); beginAccountSession('other-owner');
        mockGetCurrentUser.mockReturnValue({ uid: 'race-owner' }); beginAccountSession('race-owner');
        mockGetEntry.mockResolvedValue(cached([100, 110, 120], 'Squats'));
        await loadExerciseList();
        old.resolve(cached([10, 20, 30])); await first;
        expect([...progressElements.exerciseSelect.options].map(option => option.textContent)).toContain('Squats (3 sesiones)');
        expect(progressElements.exerciseSelect.textContent).not.toContain('Bench Press');
    });

    it('counts two persisted same-day sessions twice and deduplicates repeated IDs and duplicate exercise blocks', async () => {
        const sessions = buildSessionHistory([50, 60, 70]);
        sessions[1].fecha = sessions[0].fecha;
        sessions[0].ejercicios.push({ ...sessions[0].ejercicios[0] });
        sessions.push(sessions[0]);
        mockGetEntry.mockResolvedValue({ value: sessions, metadata: { complete: true } });
        await updateChart();
        expect(progressElements.sessionCount.textContent).toBe('3');
        await loadExerciseList();
        expect(progressElements.exerciseSelect.textContent).toContain('Bench Press (3 sesiones)');
    });
});

describe('progress bounded completeness and persisted identity', () => {
    beforeEach(() => {
        __resetMockFirebase(); __resetMockFirestoreBehavior(); jest.clearAllMocks(); setupProgressDom();
        mockGetCurrentUser.mockReturnValue({ uid: 'bounded-owner' }); beginAccountSession('bounded-owner');
        mockGetEntry.mockResolvedValue(null); mockIsFresh.mockReturnValue(false); mockSet.mockResolvedValue(undefined);
        invalidateProgressCache('bounded-owner', { durable: false });
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
        setCalendarClock(() => '2026-03-20T12:00:00Z');
        const status = document.createElement('p'); status.id = 'progress-data-status'; document.body.appendChild(status);
        progressElements.periodSelect.value = 'all'; global.Chart = jest.fn(() => ({ destroy: jest.fn() }));
    });
    afterEach(() => { __resetMockFirestoreBehavior(); setCalendarClock(); });

    it.each([[0, true], [300, true], [301, false]])('labels %i sessions complete=%s using a bounded lookahead', async (count, complete) => {
        for (let index = 0; index < count; index++) {
            __firestoreState.documents.set(`users/bounded-owner/sesiones_entrenamiento/persisted-${index}`,
                { ...buildSessionHistory([50])[0], id: 'same-wire-id' });
        }
        await loadExerciseList();
        expect(document.getElementById('progress-data-status').classList.contains('hidden')).toBe(complete);
        expect(mockSet.mock.calls[0][2].metadata.complete).toBe(complete);
        if (count) {
            const option = [...progressElements.exerciseSelect.options].find(item => item.value);
            expect(option.textContent).toContain('300 sesiones');
            progressElements.exerciseSelect.value = option.value;
            mockGetEntry.mockResolvedValue({ value: mockSet.mock.calls[0][1], metadata: { complete } }); mockIsFresh.mockReturnValue(true);
            await updateChart();
            expect(progressElements.sessionCount.textContent).toBe('300');
        }
        expect(progressElements.periodSelect.querySelector('option[value="all"]').textContent)
            .toBe(complete ? 'Todo el historial' : 'Historial disponible');
    });

    it('keeps a stale Firestore snapshot limited even below the configured cap', async () => {
        __setMockQueryResultHandler(snapshot => ({ ...snapshot, metadata: { fromCache: true, hasPendingWrites: false } }));
        await loadExerciseList();
        expect(mockSet.mock.calls[0][2].metadata.complete).toBe(false);
        expect(document.getElementById('progress-data-status').classList.contains('hidden')).toBe(false);
    });

    it('does not call an old offline array or history page complete history', async () => {
        mockGetEntry.mockResolvedValue({ value: buildSessionHistory([60, 70, 80]) }); mockIsFresh.mockReturnValue(true);
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
        await loadExerciseList();
        expect(document.getElementById('progress-data-status').classList.contains('hidden')).toBe(false);
        expect(progressElements.periodSelect.querySelector('option[value="all"]').textContent).toBe('Historial disponible');
    });
});
