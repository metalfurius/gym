import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { __resetMockFirebase } from '../mocks/firebase-state.js';

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

async function createRoutine({ name, exerciseName }) {
  click('#nav-manage-routines');
  await waitForUi(100);
  click('#add-new-routine-btn');
  await waitForUi(100);

  setField('#routine-name', name);
  setField('input[name="ex-name"]', exerciseName);
  setField('input[name="ex-sets"]', '3');
  setField('input[name="ex-reps"]', '8-10');

  document
    .getElementById('routine-editor-form')
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await waitForUi(300);
}

function findRoutineOptionByName(name) {
  const select = document.getElementById('day-select');
  return Array.from(select.options).find(
    (option) => option.value && option.textContent.includes(name)
  );
}

async function startSessionForRoutine(routineName) {
  const daySelect = document.getElementById('day-select');
  const option = findRoutineOptionByName(routineName);
  expect(option).toBeDefined();

  daySelect.value = option.value;
  daySelect.dispatchEvent(new Event('change', { bubbles: true }));

  const startButton = document.getElementById('start-session-btn');
  expect(startButton.disabled).toBe(false);
  startButton.click();
  await waitForUi(250);
}

describe('App Auth and Navigation Journey', () => {
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

  it('supports multi-routine switching and logout/login persistence', async () => {
    const email = 'journey-2@example.com';
    const password = 'password123';

    setField('#auth-email', email);
    setField('#auth-password', password);
    click('#signup-email-btn');
    await waitForUi(500);

    expect(isVisible('dashboard-view')).toBe(true);
    expect(document.getElementById('user-email').textContent).toContain(email);

    await createRoutine({ name: 'Push A', exerciseName: 'Bench Press' });
    await createRoutine({ name: 'Leg B', exerciseName: 'Back Squat' });

    click('#nav-dashboard');
    await waitForUi(250);

    const routineOptions = Array.from(document.getElementById('day-select').options).filter(
      (option) => option.value
    );
    expect(routineOptions).toHaveLength(2);

    await startSessionForRoutine('Push A');
    expect(isVisible('session-view')).toBe(true);
    expect(document.getElementById('session-title').textContent).toContain('Push A');
    click('#cancel-session-btn');
    await waitForUi(200);
    expect(isVisible('dashboard-view')).toBe(true);

    await startSessionForRoutine('Leg B');
    expect(isVisible('session-view')).toBe(true);
    expect(document.getElementById('session-title').textContent).toContain('Leg B');
    click('#cancel-session-btn');
    await waitForUi(200);
    expect(isVisible('dashboard-view')).toBe(true);

    await startSessionForRoutine('Push A');
    setField('input[name="weight-0-0"]', '62.5');
    setField('input[name="reps-0-0"]', '9');
    await waitForUi(200);
    expect(localStorage.getItem('gymTracker_inProgressSession')).not.toBeNull();

    click('#logout-btn');
    await waitForUi(400);

    expect(isVisible('auth-view')).toBe(true);
    expect(localStorage.getItem('gymTracker_inProgressSession')).toBeNull();

    setField('#auth-email', email);
    setField('#auth-password', password);
    click('#login-email-btn');
    await waitForUi(500);

    expect(isVisible('dashboard-view')).toBe(true);
    expect(findRoutineOptionByName('Push A')).toBeDefined();
    expect(findRoutineOptionByName('Leg B')).toBeDefined();
    expect(document.getElementById('resume-session-btn').classList.contains('hidden')).toBe(true);
  }, 30000);

  afterAll(() => {
    __resetMockFirebase();
    localStorage.clear();
    sessionStorage.clear();
    delete window.Chart;
    delete global.Chart;
  });
});
