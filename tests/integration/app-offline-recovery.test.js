import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import {
    __getMockCollectionDocuments,
    __resetMockFirebase,
} from '../mocks/firebase-state.js';
import { offlineManager } from '../../js/utils/offline-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexHtml = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

const onlineState = { value: true };

function waitForUi(ms = 0) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isVisible(elementId) {
    const element = document.getElementById(elementId);
    return !!element && !element.classList.contains('hidden');
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

describe('App Offline Recovery Journey', () => {
    beforeAll(async () => {
        __resetMockFirebase();
        localStorage.clear();
        sessionStorage.clear();
        onlineState.value = true;

        setupDomAndBrowserShims();

        await import('../../js/app.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        window.dispatchEvent(new Event('load'));
        await waitForUi(50);
    });

    it('queues quick-log and session saves offline, then replays both after reconnecting', async () => {
        const email = 'offline-journey@example.com';
        const password = 'password123';

        setField('#auth-email', email);
        setField('#auth-password', password);
        click('#signup-email-btn');
        await waitForUi(500);

        expect(isVisible('dashboard-view')).toBe(true);
        expect(document.getElementById('daily-hub-month-count').textContent).toBe('0');

        const quickLogDateInput = document.getElementById('quick-log-datetime');
        if (!quickLogDateInput.value) {
            quickLogDateInput.value = '2026-03-29T08:00';
            quickLogDateInput.dispatchEvent(new Event('input', { bubbles: true }));
            quickLogDateInput.dispatchEvent(new Event('change', { bubbles: true }));
        }

        setOnline(false);
        await waitForUi(150);
        setField('#quick-log-label', 'Offline Quick Log');
        setField('#quick-log-notes', 'Movilidad 10m');
        document
            .getElementById('quick-log-form')
            .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await waitForUi(400);

        const quickLogSavedWhileOffline = __getMockCollectionDocuments('users/mock-user-1/sesiones_entrenamiento');
        expect(quickLogSavedWhileOffline).toHaveLength(0);
        expect(offlineManager.getPendingCount()).toBe(1);
        expect(document.getElementById('daily-hub-sync-status').textContent).toContain('cola');

        setOnline(true);
        await waitForUi(600);

        const quickLogSavedAfterReconnect = __getMockCollectionDocuments('users/mock-user-1/sesiones_entrenamiento');
        expect(quickLogSavedAfterReconnect).toHaveLength(1);
        expect(quickLogSavedAfterReconnect[0].data.nombreEntrenamiento).toBe('Offline Quick Log');
        expect(quickLogSavedAfterReconnect[0].data.quickLog.source).toBe('quick_log');
        expect(offlineManager.getPendingCount()).toBe(0);
        expect(document.getElementById('daily-hub-sync-status').textContent).toContain('En linea');

        await createRoutine({ name: 'Offline Test Routine', exerciseName: 'Bench Press', executionMode: 'pulley' });

        click('#nav-dashboard');
        await waitForUi(200);

        const daySelect = document.getElementById('day-select');
        const routineOption = Array.from(daySelect.options).find(
            (option) => option.value && option.textContent.includes('Offline Test Routine')
        );
        expect(routineOption).toBeDefined();

        daySelect.value = routineOption.value;
        daySelect.dispatchEvent(new Event('change', { bubbles: true }));
        click('#start-session-btn');
        await waitForUi(250);

        expect(isVisible('session-view')).toBe(true);
        setField('input[name="weight-0-0"]', '65');
        setField('input[name="reps-0-0"]', '8');
        await waitForUi(150);

        setOnline(false);
        await waitForUi(150);
        click('#save-session-btn');
        await waitForUi(400);

        const savedWhileOffline = __getMockCollectionDocuments('users/mock-user-1/sesiones_entrenamiento');
        expect(savedWhileOffline).toHaveLength(1);
        expect(offlineManager.getPendingCount()).toBe(1);

        setOnline(true);
        await waitForUi(500);

        const savedAfterReconnect = __getMockCollectionDocuments('users/mock-user-1/sesiones_entrenamiento');
        expect(savedAfterReconnect).toHaveLength(2);
        const routineSession = savedAfterReconnect.find((entry) => entry.data.nombreEntrenamiento === 'Offline Test Routine');
        expect(routineSession).toBeDefined();
        expect(routineSession.data.ejercicios[0].modoEjecucion).toBe('pulley');
        expect(offlineManager.getPendingCount()).toBe(0);

        click('#nav-history');
        await waitForUi(350);
        expect(document.querySelectorAll('#history-list li[data-session-id]').length).toBeGreaterThanOrEqual(2);
        expect(document.getElementById('history-list').textContent).toContain('Offline Quick Log');
        expect(document.getElementById('history-list').textContent).toContain('Offline Test Routine');
    }, 30000);

    afterAll(() => {
        setOnline(true);
        offlineManager.clearPending();
        __resetMockFirebase();
        localStorage.clear();
        sessionStorage.clear();
        delete window.Chart;
        delete global.Chart;
    });
});
