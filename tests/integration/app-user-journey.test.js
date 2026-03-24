import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import {
    __getMockCollectionDocuments,
    __resetMockFirebase,
} from '../mocks/firebase-state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexHtml = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

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
}

describe('App User Journey', () => {
    beforeAll(async () => {
        __resetMockFirebase();
        localStorage.clear();
        sessionStorage.clear();

        setupDomAndBrowserShims();

        await import('../../js/app.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        window.dispatchEvent(new Event('load'));
        await waitForUi(50);
    });

    it('covers core flows: signup, routine create/edit/delete, session resume, save, and history', async () => {
        const testEmail = 'e2e-user@example.com';

        setField('#auth-email', testEmail);
        setField('#auth-password', 'password123');
        click('#signup-email-btn');
        await waitForUi(500);

        expect(isVisible('dashboard-view')).toBe(true);
        expect(document.getElementById('user-email').textContent).toContain(testEmail);

        click('#nav-manage-routines');
        await waitForUi(50);
        click('#add-new-routine-btn');
        await waitForUi(50);

        setField('#routine-name', 'Push Day');
        setField('input[name="ex-name"]', 'Bench Press');
        setField('input[name="ex-sets"]', '3');
        setField('input[name="ex-reps"]', '8-10');

        const routineForm = document.getElementById('routine-editor-form');
        routineForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await waitForUi(300);

        const createdRoutines = __getMockCollectionDocuments('users/mock-user-1/routines');
        expect(createdRoutines).toHaveLength(1);
        expect(createdRoutines[0].data.name).toBe('Push Day');

        click('#routine-list .routine-action-btn.edit');
        await waitForUi(150);
        setField('#routine-name', 'Push Day Updated');
        routineForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await waitForUi(300);

        const updatedRoutines = __getMockCollectionDocuments('users/mock-user-1/routines');
        expect(updatedRoutines).toHaveLength(1);
        expect(updatedRoutines[0].data.name).toBe('Push Day Updated');

        click('#nav-dashboard');
        await waitForUi(200);

        const daySelect = document.getElementById('day-select');
        const routineOption = Array.from(daySelect.options).find(
            (option) => option.value && option.textContent.includes('Push Day Updated')
        );
        expect(routineOption).toBeDefined();

        daySelect.value = routineOption.value;
        daySelect.dispatchEvent(new Event('change', { bubbles: true }));

        const startSessionBtn = document.getElementById('start-session-btn');
        expect(startSessionBtn.disabled).toBe(false);
        startSessionBtn.click();
        await waitForUi(200);

        expect(isVisible('session-view')).toBe(true);

        setField('input[name="weight-0-0"]', '60');
        setField('input[name="reps-0-0"]', '10');
        expect(localStorage.getItem('gymTracker_inProgressSession')).not.toBeNull();

        click('#nav-dashboard');
        await waitForUi(250);

        expect(isVisible('dashboard-view')).toBe(true);
        expect(document.getElementById('resume-session-btn').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('resume-session-info').textContent).toContain('Push Day Updated');

        click('#resume-session-btn');
        await waitForUi(250);

        expect(isVisible('session-view')).toBe(true);
        expect(document.querySelector('input[name="weight-0-0"]').value).toBe('60');
        expect(document.querySelector('input[name="reps-0-0"]').value).toBe('10');

        click('#save-session-btn');
        await waitForUi(300);

        expect(isVisible('dashboard-view')).toBe(true);
        expect(localStorage.getItem('gymTracker_inProgressSession')).toBeNull();

        const createdSessions = __getMockCollectionDocuments('users/mock-user-1/sesiones_entrenamiento');
        expect(createdSessions).toHaveLength(1);
        expect(createdSessions[0].data.nombreEntrenamiento).toBe('Push Day Updated');

        click('#nav-history');
        await waitForUi(300);

        expect(document.querySelectorAll('#history-list li[data-session-id]').length).toBe(1);
        expect(document.getElementById('history-list').textContent).toContain('Push Day Updated');

        click('#nav-manage-routines');
        await waitForUi(150);
        click('#routine-list .routine-action-btn.edit');
        await waitForUi(150);
        click('#delete-routine-btn');
        await waitForUi(300);

        const routinesAfterDelete = __getMockCollectionDocuments('users/mock-user-1/routines');
        expect(routinesAfterDelete).toHaveLength(0);

        click('#nav-dashboard');
        await waitForUi(200);
        const selectableRoutine = Array.from(document.getElementById('day-select').options).find(
            (option) => option.value
        );
        expect(selectableRoutine).toBeUndefined();
    }, 30000);

    afterAll(() => {
        __resetMockFirebase();
        localStorage.clear();
        sessionStorage.clear();
        delete window.Chart;
        delete global.Chart;
    });
});
