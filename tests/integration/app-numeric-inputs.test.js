import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { __getMockCollectionDocuments, __resetMockFirebase } from '../mocks/firebase-state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexHtml = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

function waitForUi(ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
        window.requestAnimationFrame = callback => setTimeout(callback, 0);
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
        value: { writeText: async () => undefined },
    });
    Object.defineProperty(window.navigator, 'serviceWorker', {
        configurable: true,
        value: { register: async () => ({ scope: '/' }) },
    });
}

async function createRoutine() {
    click('#nav-manage-routines');
    await waitForUi(100);
    click('#add-new-routine-btn');
    await waitForUi(100);
    setField('#routine-name', 'Numeric Input Routine');
    setField('input[name="ex-name"]', 'Bench Press');
    setField('input[name="ex-sets"]', '1');
    setField('input[name="ex-reps"]', '8-10');
    document
        .getElementById('routine-editor-form')
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitForUi(300);
}

describe('App Numeric Input Journey', () => {
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

    it('persists decimal weights and blocks fractional repetitions in the real app flow', async () => {
        setField('#auth-email', 'numeric-input-journey@example.com');
        setField('#auth-password', 'password123');
        click('#signup-email-btn');
        await waitForUi(500);

        await createRoutine();
        click('#nav-dashboard');
        await waitForUi(200);

        const routineOption = Array.from(document.getElementById('day-select').options).find(
            option => option.value && option.textContent.includes('Numeric Input Routine')
        );
        expect(routineOption).toBeDefined();

        const daySelect = document.getElementById('day-select');
        daySelect.value = routineOption.value;
        daySelect.dispatchEvent(new Event('change', { bubbles: true }));
        click('#start-session-btn');
        await waitForUi(250);

        setField('#user-weight', '75,4');
        setField('input[name="weight-0-0"]', '62,5');
        setField('input[name="reps-0-0"]', '8');
        await waitForUi(150);

        expect(document.querySelector('input[name="weight-0-0"]').value).toBe('62.5');
        expect(document.querySelector('input[name="reps-0-0"]').value).toBe('8');

        const inProgress = JSON.parse(localStorage.getItem('gymTracker_inProgressSession'));
        expect(inProgress.data).toMatchObject({
            pesoUsuario: 75.4,
            validation: { isValid: true },
        });
        expect(inProgress.data.ejercicios[0].sets[0]).toMatchObject({
            peso: 62.5,
            reps: 8,
        });

        setField('input[name="reps-0-0"]', '8.5');
        await waitForUi(100);
        expect(document.querySelector('input[name="reps-0-0"]').value).toBe('8.5');
        expect(document.querySelector('input[name="reps-0-0"]').getAttribute('aria-invalid')).toBe('true');

        click('#save-session-btn');
        await waitForUi(250);
        expect(__getMockCollectionDocuments('users/mock-user-1/sesiones_entrenamiento')).toHaveLength(0);
        expect(localStorage.getItem('gymTracker_inProgressSession')).not.toBeNull();

        setField('input[name="reps-0-0"]', '8');
        click('#save-session-btn');
        await waitForUi(400);

        const sessions = __getMockCollectionDocuments('users/mock-user-1/sesiones_entrenamiento');
        expect(sessions).toHaveLength(1);
        expect(sessions[0].data.pesoUsuario).toBe(75.4);
        expect(sessions[0].data.ejercicios[0].sets[0]).toMatchObject({
            peso: 62.5,
            reps: 8,
        });
        expect(localStorage.getItem('gymTracker_inProgressSession')).toBeNull();
    }, 30000);

    afterAll(() => {
        __resetMockFirebase();
        localStorage.clear();
        sessionStorage.clear();
        delete window.Chart;
        delete global.Chart;
    });
});
