import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockGetCurrentUser = jest.fn(() => ({ uid: 'ui-input-user' }));

jest.unstable_mockModule('../../js/auth.js', () => ({
    getCurrentUser: mockGetCurrentUser,
}));

function setupDom() {
    document.body.innerHTML = `
        <div id="auth-view" class="hidden"></div>
        <div id="dashboard-view" class="hidden"></div>
        <div id="session-view" class="hidden"></div>
        <div id="history-view" class="hidden"></div>
        <div id="manage-routines-view" class="hidden"></div>
        <div id="routine-editor-view" class="hidden"></div>
        <div id="progress-view" class="hidden"></div>
        <button id="nav-dashboard"></button>
        <button id="nav-manage-routines"></button>
        <button id="nav-history"></button>
        <button id="nav-progress"></button>
        <button id="logout-btn"></button>
        <span id="user-email"></span>
        <span id="current-date"></span>
        <select id="day-select"></select>
        <button id="start-session-btn"></button>
        <form id="session-form"></form>
        <h2 id="session-title"></h2>
        <div id="exercise-list"></div>
        <button id="save-session-btn"></button>
        <button id="cancel-session-btn"></button>
        <div id="history-list"></div>
        <input id="history-search" />
    `;
}

setupDom();

const { renderSessionView, sessionElements } = await import('../../js/ui.js');

const routine = {
    id: 'routine-ui-inputs',
    name: 'Input Regression',
    exercises: [
        {
            name: 'Bench Press',
            type: 'strength',
            sets: 1,
            reps: '8-12',
            executionMode: 'two_hand',
            loadType: 'external',
        },
    ],
};

describe('session numeric inputs in the rendered UI', () => {
    beforeEach(() => {
        sessionElements.exerciseList.innerHTML = '';
        localStorage.clear();
    });

    it('preserves decimal separators, signed bodyweight loads, and rejects fractional reps', async () => {
        await renderSessionView(routine);

        const weightInput = document.querySelector('input[name="weight-0-0"]');
        const repsInput = document.querySelector('input[name="reps-0-0"]');
        const loadTypeInput = document.querySelector('select[name="session-load-type"]');

        expect(weightInput.type).toBe('text');
        expect(weightInput.inputMode).toBe('decimal');
        expect(repsInput.type).toBe('text');
        expect(repsInput.inputMode).toBe('numeric');
        expect(repsInput.pattern).toBe('[0-9]*');

        for (const value of ['6', '62', '62.', '62.5']) {
            weightInput.value = value;
            weightInput.dispatchEvent(new Event('input', { bubbles: true }));
            expect(weightInput.value).toBe(value);
        }

        weightInput.value = '62,';
        weightInput.dispatchEvent(new Event('input', { bubbles: true }));
        expect(weightInput.value).toBe('62.');
        weightInput.value = '62.5';
        weightInput.dispatchEvent(new Event('input', { bubbles: true }));
        weightInput.dispatchEvent(new Event('blur'));
        expect(weightInput.value).toBe('62.5');
        expect(weightInput.getAttribute('aria-invalid')).toBeNull();

        loadTypeInput.value = 'bodyweight';
        loadTypeInput.dispatchEvent(new Event('change', { bubbles: true }));
        weightInput.value = '-12,';
        weightInput.dispatchEvent(new Event('input', { bubbles: true }));
        expect(weightInput.value).toBe('-12.');
        weightInput.value = '-12,5';
        weightInput.dispatchEvent(new Event('input', { bubbles: true }));
        weightInput.dispatchEvent(new Event('blur'));
        expect(weightInput.value).toBe('-12.5');

        for (const value of ['8.5', '8,5', '1e2', '+8', '-1']) {
            repsInput.value = value;
            repsInput.dispatchEvent(new Event('input', { bubbles: true }));
            expect(repsInput.value).toBe(value);
            expect(repsInput.getAttribute('aria-invalid')).toBe('true');
        }

        repsInput.value = '8';
        repsInput.dispatchEvent(new Event('input', { bubbles: true }));
        repsInput.dispatchEvent(new Event('blur'));
        expect(repsInput.value).toBe('8');
        expect(repsInput.getAttribute('aria-invalid')).toBeNull();

        const resumed = {
            ejercicios: [
                {
                    nombreEjercicio: 'Bench Press',
                    sets: [{ peso: '62.', reps: '8.5' }],
                },
            ],
        };
        await renderSessionView(routine, resumed);

        const resumedWeight = document.querySelector('input[name="weight-0-0"]');
        const resumedReps = document.querySelector('input[name="reps-0-0"]');
        expect(resumedWeight.value).toBe('62.');
        expect(resumedReps.value).toBe('8.5');
        expect(resumedWeight.getAttribute('aria-invalid')).toBe('true');
        expect(resumedReps.getAttribute('aria-invalid')).toBe('true');
    });
});
