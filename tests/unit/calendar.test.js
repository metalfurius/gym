import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
    Timestamp
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { __firestoreState, __resetMockFirebase } from '../mocks/firebase-state.js';

const mockGetCurrentUser = jest.fn();
const mockLoggerDebug = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();
const mockCacheGetEntry = jest.fn();
const mockCacheIsFresh = jest.fn();
const mockCacheSet = jest.fn();
const mockTrackRead = jest.fn();
const mockSerializeActivityMap = jest.fn((map) => Array.from(map.entries()));
const mockDeserializeActivityMap = jest.fn((entries) => new Map(entries));

let calendarClickHandler = null;
const mockAddViewListener = jest.fn((_view, _element, _event, handler) => {
    calendarClickHandler = handler;
});

jest.unstable_mockModule('../../js/firebase-config.js', () => ({
    db: { __isMockDb: true }
}));

jest.unstable_mockModule('../../js/auth.js', () => ({
    getCurrentUser: mockGetCurrentUser
}));

jest.unstable_mockModule('../../js/utils/logger.js', () => ({
    logger: {
        debug: mockLoggerDebug,
        warn: mockLoggerWarn,
        error: mockLoggerError
    }
}));

jest.unstable_mockModule('../../js/utils/event-manager.js', () => ({
    addViewListener: mockAddViewListener
}));

jest.unstable_mockModule('../../js/utils/local-first-cache.js', () => ({
    localFirstCache: {
        getEntry: mockCacheGetEntry,
        isFresh: mockCacheIsFresh,
        set: mockCacheSet
    }
}));

jest.unstable_mockModule('../../js/utils/firebase-usage-tracker.js', () => ({
    firebaseUsageTracker: {
        trackRead: mockTrackRead
    }
}));

jest.unstable_mockModule('../../js/utils/firestore-serialization.js', () => ({
    serializeActivityMap: mockSerializeActivityMap,
    deserializeActivityMap: mockDeserializeActivityMap
}));

const calendarModule = await import('../../js/modules/calendar.js');

const {
    initCalendar,
    destroyCalendar,
    resetToCurrentMonth,
    getCalendarState,
    hideCalendar,
    updateCalendarView,
    MIN_CALENDAR_YEAR
} = calendarModule;

function setupDom() {
    document.body.innerHTML = `
        <div id="activity-calendar-container" class="hidden">
            <div id="calendar-loading-spinner" class="hidden"></div>
            <div id="calendar-toolbar">
                <button id="prev-month-btn">Prev</button>
                <span id="current-month-display"></span>
                <button id="next-month-btn">Next</button>
            </div>
            <div id="activity-calendar"></div>
        </div>
    `;
}

function seedSession({ userId, id, date, tipos }) {
    __firestoreState.documents.set(
        `users/${userId}/sesiones_entrenamiento/${id}`,
        {
            fecha: Timestamp.fromDate(date),
            ejercicios: tipos.map((tipo) => ({ tipoEjercicio: tipo }))
        }
    );
}

function getDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function flushDebounce() {
    jest.advanceTimersByTime(350);
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

function clickCalendarNav(id) {
    expect(typeof calendarClickHandler).toBe('function');
    calendarClickHandler({ target: { id } });
}

describe('Calendar module', () => {
    const user = { uid: 'calendar-user-1' };

    beforeEach(() => {
        jest.clearAllMocks();
        __resetMockFirebase();
        setupDom();
        calendarClickHandler = null;
        mockGetCurrentUser.mockReturnValue(user);
        mockCacheGetEntry.mockResolvedValue(null);
        mockCacheIsFresh.mockReturnValue(false);
        mockCacheSet.mockResolvedValue(undefined);
        jest.useFakeTimers();
        Object.defineProperty(window.navigator, 'onLine', {
            value: true,
            configurable: true
        });
        destroyCalendar();
    });

    afterEach(() => {
        destroyCalendar();
        jest.useRealTimers();
    });

    it('is importable and exposes MIN_CALENDAR_YEAR', () => {
        expect(calendarModule).toBeDefined();
        expect(MIN_CALENDAR_YEAR).toBe(2025);
    });

    it('fetches monthly activity and renders strength markers', async () => {
        initCalendar();
        resetToCurrentMonth();
        await flushDebounce();
        const state = getCalendarState();

        const sessionDate = new Date(state.year, state.month, 10);
        const dateString = getDateString(sessionDate);
        seedSession({
            userId: user.uid,
            id: 'session-strength-1',
            date: sessionDate,
            tipos: ['strength']
        });

        updateCalendarView();
        await flushDebounce();

        const cell = document.querySelector(`.day-cell[title^="${dateString}"]`);
        expect(cell).not.toBeNull();
        expect(cell.classList.contains('level-1')).toBe(true);
        expect(cell.title).toContain('fuerza');
        expect(mockTrackRead).toHaveBeenCalled();
        expect(document.getElementById('activity-calendar-container').classList.contains('hidden')).toBe(false);
    });

    it('combines same-day strength and cardio sessions as mixed activity', async () => {
        initCalendar();
        resetToCurrentMonth();
        await flushDebounce();
        const state = getCalendarState();

        const sessionDate = new Date(state.year, state.month, 12);
        const dateString = getDateString(sessionDate);
        seedSession({
            userId: user.uid,
            id: 'session-mixed-1',
            date: sessionDate,
            tipos: ['strength']
        });
        seedSession({
            userId: user.uid,
            id: 'session-mixed-2',
            date: sessionDate,
            tipos: ['cardio']
        });

        updateCalendarView();
        await flushDebounce();

        const cell = document.querySelector(`.day-cell[title^="${dateString}"]`);
        expect(cell).not.toBeNull();
        expect(cell.classList.contains('level-2')).toBe(true);
        expect(cell.title).toContain('mixto');
        expect(cell.title).toContain('2 sesiones');
    });

    it('uses cached monthly activity when cache is fresh', async () => {
        const today = new Date();
        const sessionDate = new Date(today.getFullYear(), today.getMonth(), 6);
        const dateString = getDateString(sessionDate);

        mockCacheGetEntry.mockResolvedValue({
            value: [[dateString, { count: 1, type: 'cardio' }]],
            updatedAt: Date.now()
        });
        mockCacheIsFresh.mockReturnValue(true);

        initCalendar();
        resetToCurrentMonth();
        await flushDebounce();

        const cell = document.querySelector(`.day-cell[title^="${dateString}"]`);
        expect(cell).not.toBeNull();
        expect(cell.classList.contains('level-3')).toBe(true);
        expect(mockDeserializeActivityMap).toHaveBeenCalled();
        expect(mockTrackRead).not.toHaveBeenCalled();
    });

    it('debounces repeated updateCalendarView calls', async () => {
        const today = new Date();
        seedSession({
            userId: user.uid,
            id: 'session-debounce-1',
            date: new Date(today.getFullYear(), today.getMonth(), 5),
            tipos: ['strength']
        });

        initCalendar();
        updateCalendarView();
        updateCalendarView();
        updateCalendarView();

        jest.advanceTimersByTime(299);
        await Promise.resolve();
        expect(mockTrackRead).not.toHaveBeenCalled();

        await flushDebounce();
        expect(mockTrackRead).toHaveBeenCalledTimes(1);
    });

    it('navigates months and clamps at minimum calendar year', async () => {
        initCalendar();
        resetToCurrentMonth();
        await flushDebounce();

        for (let i = 0; i < 60; i++) {
            const state = getCalendarState();
            if (state.year === MIN_CALENDAR_YEAR && state.month === 0) break;
            clickCalendarNav('prev-month-btn');
            await flushDebounce();
        }

        const minimumState = getCalendarState();
        expect(minimumState.year).toBe(MIN_CALENDAR_YEAR);
        expect(minimumState.month).toBe(0);
        expect(document.getElementById('prev-month-btn').disabled).toBe(true);

        clickCalendarNav('prev-month-btn');
        await flushDebounce();
        expect(getCalendarState()).toEqual(minimumState);
    });

    it('does not navigate beyond current month when pressing next', async () => {
        initCalendar();
        resetToCurrentMonth();
        await flushDebounce();

        const before = getCalendarState();
        clickCalendarNav('next-month-btn');
        await flushDebounce();

        expect(getCalendarState()).toEqual(before);
        expect(document.getElementById('next-month-btn').disabled).toBe(true);
    });

    it('hides the calendar when there is no authenticated user', async () => {
        mockGetCurrentUser.mockReturnValue(null);

        initCalendar();
        updateCalendarView();
        await flushDebounce();

        expect(document.getElementById('activity-calendar-container').classList.contains('hidden')).toBe(true);
    });

    it('hideCalendar and destroyCalendar reset view state safely', async () => {
        initCalendar();
        resetToCurrentMonth();
        await flushDebounce();

        hideCalendar();
        expect(document.getElementById('activity-calendar-container').classList.contains('hidden')).toBe(true);

        destroyCalendar();
        expect(() => initCalendar()).not.toThrow();
    });

    it('initializes only once and refreshes DOM references on subsequent init', () => {
        initCalendar();
        initCalendar();

        expect(mockAddViewListener).toHaveBeenCalledTimes(1);
        expect(mockLoggerDebug).toHaveBeenCalledWith('Calendar DOM references refreshed');
    });
});
