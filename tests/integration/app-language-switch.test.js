import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { __resetMockFirebase } from '../mocks/firebase-state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexHtml = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

function waitForUi(ms = 0) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function setupDomAndBrowserShims() {
    document.open();
    document.write(indexHtml);
    document.close();

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
            writeText: async () => undefined
        }
    });

    Object.defineProperty(window.navigator, 'serviceWorker', {
        configurable: true,
        value: {
            register: async () => ({ scope: '/' })
        }
    });
}

async function bootApplication({ resetModules = false } = {}) {
    setupDomAndBrowserShims();

    if (resetModules) {
        jest.resetModules();
    }

    await import('../../js/app.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    window.dispatchEvent(new Event('load'));
    await waitForUi(100);
}

describe('App language switch integration', () => {
    beforeAll(async () => {
        __resetMockFirebase();
        localStorage.clear();
        sessionStorage.clear();
        await bootApplication({ resetModules: true });
    });

    it('switches ES -> EN immediately and keeps preference after reload', async () => {
        const languageSelect = document.getElementById('language-select');
        expect(languageSelect).toBeTruthy();
        expect(languageSelect.value).toBe('es');

        const loginBtn = document.getElementById('login-email-btn');
        expect(loginBtn.textContent.toLowerCase()).toContain('iniciar');

        languageSelect.value = 'en';
        languageSelect.dispatchEvent(new Event('change', { bubbles: true }));
        await waitForUi(100);

        expect(loginBtn.textContent.toLowerCase()).toContain('sign in');
        expect(localStorage.getItem('gym-tracker-language')).toBe('en');

        // Simulate page reload with a fresh module graph.
        await bootApplication({ resetModules: true });

        const languageSelectAfterReload = document.getElementById('language-select');
        const loginBtnAfterReload = document.getElementById('login-email-btn');
        expect(languageSelectAfterReload.value).toBe('en');
        expect(loginBtnAfterReload.textContent.toLowerCase()).toContain('sign in');
    });

    afterAll(() => {
        __resetMockFirebase();
        localStorage.clear();
        sessionStorage.clear();
        delete window.Chart;
        delete global.Chart;
    });
});
