import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import {
    __getMockCollectionDocuments,
    __resetMockFirebase,
} from '../mocks/firebase-state.js';
import {
    __setMockAddDocFailures,
    __resetMockFirestoreBehavior,
} from '../mocks/firebase-firestore.js';
import { offlineManager } from '../../js/utils/offline-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexHtml = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

const onlineState = { value: true };

function waitForUi(ms = 0) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function click(selector) {
    const element = document.querySelector(selector);
    if (!element) {
        throw new Error(`Element not found for selector: ${selector}`);
    }
    element.click();
    return element;
}

function setField(selector, value) {
    const field = document.querySelector(selector);
    if (!field) {
        throw new Error(`Field not found for selector: ${selector}`);
    }

    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return field;
}

function setupDomAndBrowserShims() {
    document.open();
    document.write(indexHtml);
    document.close();

    Object.defineProperty(window, 'confirm', {
        configurable: true,
        writable: true,
        value: () => true,
    });

    Object.defineProperty(window, 'prompt', {
        configurable: true,
        writable: true,
        value: () => 'BORRAR TODO',
    });

    Object.defineProperty(window, 'alert', {
        configurable: true,
        writable: true,
        value: () => {},
    });

    if (!window.requestAnimationFrame) {
        window.requestAnimationFrame = (callback) => setTimeout(callback, 0);
    }

    if (!window.scrollTo) {
        window.scrollTo = () => {};
    }

    class MockChart {
        constructor(_ctx, _config) {}
        destroy() {}
    }

    window.Chart = MockChart;
    global.Chart = MockChart;

    Object.defineProperty(window.navigator, 'clipboard', {
        configurable: true,
        value: {
            writeText: async () => undefined,
        },
    });

    Object.defineProperty(window.navigator, 'serviceWorker', {
        configurable: true,
        value: {
            register: async () => ({ scope: '/' }),
        },
    });

    Object.defineProperty(Navigator.prototype, 'onLine', {
        configurable: true,
        get: () => onlineState.value,
    });
}

function setOnline(isOnline) {
    onlineState.value = isOnline;
    window.dispatchEvent(new Event(isOnline ? 'online' : 'offline'));
}

async function createRoutine({ name, exerciseName, executionMode = 'one_hand' }) {
    click('#nav-manage-routines');
    await waitForUi(100);
    click('#add-new-routine-btn');
    await waitForUi(100);

    setField('#routine-name', name);
    setField('input[name="ex-name"]', exerciseName);
    setField('input[name="ex-sets"]', '3');
    setField('input[name="ex-reps"]', '8-10');
    setField('select[name="ex-execution-mode"]', executionMode);

    document
        .getElementById('routine-editor-form')
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitForUi(300);
}

describe('App Offline Retry Journey', () => {
    beforeAll(async () => {
        __resetMockFirebase();
        __resetMockFirestoreBehavior();
        localStorage.clear();
        sessionStorage.clear();
        onlineState.value = true;

        setupDomAndBrowserShims();

        await import('../../js/app.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        window.dispatchEvent(new Event('load'));
        await waitForUi(50);
    });

    it('keeps queued quick-log and session operations after first reconnect failure and succeeds on second reconnect', async () => {
        const email = 'offline-retry@example.com';
        const password = 'password123';
        const sessionsCollectionPath = 'users/mock-user-1/sesiones_entrenamiento';

        setField('#auth-email', email);
        setField('#auth-password', password);
        click('#signup-email-btn');
        await waitForUi(500);

        const quickLogDateInput = document.getElementById('quick-log-datetime');
        if (!quickLogDateInput.value) {
            quickLogDateInput.value = '2026-03-29T08:15';
            quickLogDateInput.dispatchEvent(new Event('input', { bubbles: true }));
            quickLogDateInput.dispatchEvent(new Event('change', { bubbles: true }));
        }

        setOnline(false);
        await waitForUi(150);
        setField('#quick-log-label', 'Retry Quick Log');
        setField('#quick-log-notes', 'Movilidad 12m');
        document
            .getElementById('quick-log-form')
            .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await waitForUi(350);

        expect(__getMockCollectionDocuments(sessionsCollectionPath)).toHaveLength(0);
        expect(offlineManager.getPendingCount()).toBe(1);
        expect(document.getElementById('daily-hub-sync-status').textContent).toContain('cola');

        __setMockAddDocFailures(1, new Error('Failed to fetch'));
        setOnline(true);
        await waitForUi(500);

        expect(__getMockCollectionDocuments(sessionsCollectionPath)).toHaveLength(0);
        expect(offlineManager.getPendingCount()).toBe(1);

        setOnline(false);
        await waitForUi(150);
        setOnline(true);
        await waitForUi(500);

        let savedSessions = __getMockCollectionDocuments(sessionsCollectionPath);
        expect(savedSessions).toHaveLength(1);
        const quickLogEntry = savedSessions.find((entry) => entry.data.nombreEntrenamiento === 'Retry Quick Log');
        expect(quickLogEntry).toBeDefined();
        expect(quickLogEntry.data.quickLog.source).toBe('quick_log');
        expect(offlineManager.getPendingCount()).toBe(0);
        expect(document.getElementById('daily-hub-sync-status').textContent).toContain('En linea');

        await createRoutine({ name: 'Retry Routine', exerciseName: 'Bench Press', executionMode: 'two_hand' });

        click('#nav-dashboard');
        await waitForUi(200);
        const daySelect = document.getElementById('day-select');
        const routineOption = Array.from(daySelect.options).find(
            (option) => option.value && option.textContent.includes('Retry Routine')
        );
        expect(routineOption).toBeDefined();

        daySelect.value = routineOption.value;
        daySelect.dispatchEvent(new Event('change', { bubbles: true }));
        click('#start-session-btn');
        await waitForUi(200);

        setField('select[name="session-execution-mode"]', 'one_hand');
        setField('select[name="session-load-type"]', 'bodyweight');
        setField('input[name="weight-0-0"]', '67.5');
        setField('input[name="reps-0-0"]', '7');
        await waitForUi(100);

        setOnline(false);
        await waitForUi(150);
        click('#save-session-btn');
        await waitForUi(300);

        expect(__getMockCollectionDocuments(sessionsCollectionPath)).toHaveLength(1);
        expect(offlineManager.getPendingCount()).toBe(1);

        __setMockAddDocFailures(1, new Error('Failed to fetch'));
        setOnline(true);
        await waitForUi(500);

        expect(__getMockCollectionDocuments(sessionsCollectionPath)).toHaveLength(1);
        expect(offlineManager.getPendingCount()).toBe(1);

        setOnline(false);
        await waitForUi(150);
        setOnline(true);
        await waitForUi(500);

        savedSessions = __getMockCollectionDocuments(sessionsCollectionPath);
        expect(savedSessions).toHaveLength(2);
        const sessionEntry = savedSessions.find((entry) => entry.data.nombreEntrenamiento === 'Retry Routine');
        expect(sessionEntry).toBeDefined();
        expect(sessionEntry.data.ejercicios[0].modoEjecucion).toBe('one_hand');
        expect(sessionEntry.data.ejercicios[0].tipoCarga).toBe('bodyweight');
        expect(offlineManager.getPendingCount()).toBe(0);
    }, 45000);

    afterAll(() => {
        setOnline(true);
        offlineManager.clearPending();
        __resetMockFirestoreBehavior();
        __resetMockFirebase();
        localStorage.clear();
        sessionStorage.clear();
        delete window.Chart;
        delete global.Chart;
    });
});
