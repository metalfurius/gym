import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { __getMockCollectionDocuments, __resetMockFirebase } from '../mocks/firebase-state.js';
import {
    __resetMockFirestoreBehavior,
    __setMockBatchCommitFailureOnCall,
    __setMockBatchCommitGate,
} from '../mocks/firebase-firestore.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.resolve(dirname, '../../index.html'), 'utf8');
const routinesPath = 'users/mock-user-1/routines';
let clipboardText = '';

function click(selector) {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Element not found: ${selector}`);
    element.click();
    return element;
}

function setField(selector, value) {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Element not found: ${selector}`);
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return element;
}

function submitImport() {
    document
        .getElementById('routine-import-form')
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

async function waitUntil(predicate, timeout = 5000) {
    const start = Date.now();
    while (!predicate()) {
        if (Date.now() - start > timeout) throw new Error('Timed out waiting for the application');
        await new Promise(resolve => setTimeout(resolve, 20));
    }
}

function setOnline(online) {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: online });
    window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

describe('Routine import in the application', () => {
    beforeAll(async () => {
        __resetMockFirebase();
        __resetMockFirestoreBehavior();
        localStorage.clear();
        sessionStorage.clear();
        document.open();
        document.write(html);
        document.close();

        window.confirm = () => true;
        window.alert = () => {};
        window.scrollTo = () => {};
        window.requestAnimationFrame = callback => setTimeout(callback, 0);
        window.Chart = class {
            destroy() {}
        };
        global.Chart = window.Chart;
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
                writeText: jest.fn(async text => {
                    clipboardText = text;
                }),
            },
        });
        Object.defineProperty(navigator, 'serviceWorker', {
            configurable: true,
            value: { register: async () => ({ scope: '/' }) },
        });
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });

        await import('../../js/app.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        window.dispatchEvent(new Event('load'));
        await new Promise(resolve => setTimeout(resolve, 100));
        setField('#auth-email', 'import@example.com');
        setField('#auth-password', 'password123');
        click('#signup-email-btn');
        await waitUntil(() => !document.getElementById('dashboard-view').classList.contains('hidden'));
        click('#nav-manage-routines');
        await waitUntil(() => !document.getElementById('manage-routines-view').classList.contains('hidden'));
    });

    it('imports the actual clipboard export as a usable copy and preserves its data', async () => {
        click('#add-new-routine-btn');
        setField('#routine-name', 'Torso');
        setField('input[name="ex-name"]', 'Press');
        setField('input[name="ex-sets"]', '3');
        setField('input[name="ex-reps"]', '8-10');
        setField('select[name="ex-execution-mode"]', 'one_hand');
        setField('select[name="ex-load-type"]', 'bodyweight');
        setField('textarea[name="ex-notes"]', 'Controlado');
        click('#add-exercise-to-routine-btn');
        setField('.routine-exercise-editor:nth-child(2) input[name="ex-name"]', 'Carrera');
        setField('.routine-exercise-editor:nth-child(2) select[name="ex-type"]', 'cardio');
        setField('.routine-exercise-editor:nth-child(2) input[name="ex-duration"]', '20 min');
        document
            .getElementById('routine-editor-form')
            .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await waitUntil(
            () =>
                __getMockCollectionDocuments(routinesPath).length === 1 &&
                !document.getElementById('manage-routines-view').classList.contains('hidden')
        );

        click('#export-routines-btn');
        await waitUntil(() => Boolean(clipboardText));
        const exported = JSON.parse(clipboardText);
        const originalId = exported.routines[0].id;
        expect(exported.routines[0].exercises).toHaveLength(2);

        click('#import-routines-btn');
        expect(document.activeElement.id).toBe('routine-import-json');
        setField('#routine-import-json', clipboardText);
        submitImport();
        await waitUntil(
            () =>
                __getMockCollectionDocuments(routinesPath).length === 2 &&
                document.getElementById('routine-import-modal').style.display === 'none'
        );
        const saved = __getMockCollectionDocuments(routinesPath);
        const imported = saved.find(entry => entry.id !== originalId);
        expect(saved.find(entry => entry.id === originalId)).toBeDefined();
        expect(imported.data.exercises).toEqual(exported.routines[0].exercises);
        expect(imported.data.createdAt.toDate().toISOString()).toBe(exported.routines[0].createdAt);
        expect(imported.data.updatedAt.toDate().toISOString()).toBe(exported.routines[0].updatedAt);
        expect(document.querySelectorAll('#routine-list .routine-card')).toHaveLength(2);
        expect(
            Array.from(document.querySelector('#day-select').options).some(option => option.value === imported.id)
        ).toBe(true);
        const { localFirstCache } = await import('../../js/utils/local-first-cache.js');
        const cachedRoutines = await localFirstCache.getEntry('routines:mock-user-1');
        expect(cachedRoutines.value.some(entry => entry.id === imported.id)).toBe(true);

        click(`#routine-list button[data-routine-id="${imported.id}"]`);
        expect(document.querySelector('#routine-name').value).toBe('Torso');
        expect(document.querySelectorAll('.routine-exercise-editor')).toHaveLength(2);
        click('#cancel-edit-routine-btn');
        await waitUntil(() => !document.getElementById('manage-routines-view').classList.contains('hidden'));
        clipboardText = '';
        click('#export-routines-btn');
        await waitUntil(() => Boolean(clipboardText));
        const reexported = JSON.parse(clipboardText).routines.find(entry => entry.id === imported.id);
        expect(reexported.exercises).toEqual(exported.routines[0].exercises);
        expect(reexported.createdAt).toBe(exported.routines[0].createdAt);

        click('#nav-dashboard');
        setField('#day-select', imported.id);
        click('#start-session-btn');
        await waitUntil(() => !document.getElementById('session-view').classList.contains('hidden'));
        expect(document.querySelectorAll('.exercise-block')).toHaveLength(2);
        click('#nav-manage-routines');
        await waitUntil(() => !document.getElementById('manage-routines-view').classList.contains('hidden'));
    });

    it('keeps invalid input available, translates errors, and supports keyboard cancellation', async () => {
        click('#import-routines-btn');
        setField('#routine-import-json', '{');
        submitImport();
        expect(document.getElementById('routine-import-status').textContent).toContain('JSON');
        expect(document.getElementById('routine-import-json').getAttribute('aria-invalid')).toBe('true');
        expect(__getMockCollectionDocuments(routinesPath)).toHaveLength(2);

        setField('#language-select', 'en');
        await waitUntil(() => document.getElementById('routine-import-status').textContent.includes('not valid'));
        expect(document.getElementById('routine-import-json').value).toBe('{');
        document
            .getElementById('routine-import-json')
            .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(document.getElementById('routine-import-modal').style.display).toBe('none');
        expect(document.activeElement.id).toBe('import-routines-btn');
        setField('#language-select', 'es');
    });

    it('preserves the pasted text when the first batch fails', async () => {
        const text = '{ "extra": "keep", "routines": [{ "name": "Test", "exercises": [] }] }';
        __setMockBatchCommitFailureOnCall(1);
        click('#import-routines-btn');
        setField('#routine-import-json', text);
        submitImport();
        await waitUntil(() => document.getElementById('routine-import-status').textContent.includes('No se pudieron'));
        expect(document.getElementById('routine-import-json').value).toBe(text);
        expect(__getMockCollectionDocuments(routinesPath)).toHaveLength(2);
        click('#routine-import-cancel');
    });

    it('retains only the pending routines after a partial failure and retries without duplicates', async () => {
        const routines = Array.from({ length: 101 }, (_, index) => ({ name: `Rutina ${index}`, exercises: [] }));
        __setMockBatchCommitFailureOnCall(2);
        click('#import-routines-btn');
        setField('#routine-import-json', JSON.stringify({ routines }));
        submitImport();
        await waitUntil(
            () => document.getElementById('routine-import-status').textContent.includes('100 rutina'),
            10000
        );
        expect(__getMockCollectionDocuments(routinesPath)).toHaveLength(102);
        const pending = JSON.parse(document.getElementById('routine-import-json').value);
        expect(pending.routines).toEqual([routines[100]]);
        expect(pending.totalRoutines).toBe(1);

        click('#routine-import-cancel');
        click('#import-routines-btn');
        expect(JSON.parse(document.getElementById('routine-import-json').value).routines).toEqual([routines[100]]);
        submitImport();
        await waitUntil(() => document.getElementById('routine-import-modal').style.display === 'none', 10000);
        const saved = __getMockCollectionDocuments(routinesPath);
        expect(saved).toHaveLength(103);
        expect(saved.filter(entry => entry.data.name === 'Rutina 100')).toHaveLength(1);
    });

    it('requires a connection and keeps an in-flight write pending until it is confirmed', async () => {
        click('#import-routines-btn');
        setField('#routine-import-json', JSON.stringify({ routines: [{ name: 'Conexión', exercises: [] }] }));
        setOnline(false);
        submitImport();
        expect(document.getElementById('routine-import-status').textContent).toContain('conexión');
        expect(__getMockCollectionDocuments(routinesPath)).toHaveLength(103);

        setOnline(true);
        let release;
        const gate = new Promise(resolve => {
            release = resolve;
        });
        __setMockBatchCommitGate(gate);
        submitImport();
        expect(document.getElementById('routine-import-submit').disabled).toBe(true);
        setOnline(false);
        expect(document.getElementById('routine-import-status').textContent).toContain('pendiente');
        document
            .getElementById('routine-import-json')
            .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(document.getElementById('routine-import-modal').style.display).toBe('block');
        setOnline(true);
        release();
        await waitUntil(() => document.getElementById('routine-import-modal').style.display === 'none', 10000);
        expect(__getMockCollectionDocuments(routinesPath)).toHaveLength(104);
        __setMockBatchCommitGate(null);
    });

    it('closes the import safely when the signed-in user changes during a write', async () => {
        click('#import-routines-btn');
        setField('#routine-import-json', JSON.stringify({ routines: [{ name: 'Salida', exercises: [] }] }));
        let release;
        const gate = new Promise(resolve => {
            release = resolve;
        });
        __setMockBatchCommitGate(gate);
        submitImport();
        expect(document.getElementById('routine-import-submit').disabled).toBe(true);

        click('#logout-btn');
        await waitUntil(() => !document.getElementById('auth-view').classList.contains('hidden'));
        expect(document.getElementById('routine-import-modal').style.display).toBe('none');
        release();
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(document.getElementById('routine-import-modal').style.display).toBe('none');
        expect(document.getElementById('routine-import-json').value).toBe('');
        __setMockBatchCommitGate(null);
    });

    afterAll(() => {
        __resetMockFirestoreBehavior();
        __resetMockFirebase();
        delete global.Chart;
        delete window.Chart;
    });
});
