import { describe, it, expect, beforeEach } from '@jest/globals';
import {
    LANGUAGE_STORAGE_KEY,
    DEFAULT_LANGUAGE,
    initI18n,
    t,
    getLanguage,
    setLanguage,
    getLocale,
    onLanguageChange,
    applyTranslations
} from '../../js/i18n.js';

describe('i18n module', () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = '';
        setLanguage(DEFAULT_LANGUAGE, { persist: false, apply: false });
    });

    it('falls back to default language when there is no persisted value', () => {
        const language = initI18n({ apply: false });
        expect(language).toBe('es');
        expect(getLanguage()).toBe('es');
    });

    it('uses stored language when available', () => {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
        const language = initI18n({ apply: false });
        expect(language).toBe('en');
        expect(getLanguage()).toBe('en');
        expect(getLocale()).toBe('en-US');
    });

    it('persists language changes in localStorage', () => {
        setLanguage('en');
        expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
    });

    it('resolves keys and interpolates params', () => {
        setLanguage('es', { persist: false, apply: false });
        expect(t('history.page', { page: 3 })).toBe('Pag. 3');
    });

    it('returns key for unknown translation keys', () => {
        expect(t('unknown.translation.key')).toBe('unknown.translation.key');
    });

    it('returns provided default param when key is unknown', () => {
        expect(t('unknown.translation.key', { default: 'fallback text' })).toBe('fallback text');
    });

    it('emits language change events and supports unsubscribe', () => {
        const events = [];
        const unsubscribe = onLanguageChange((detail) => {
            events.push(detail.language);
        });

        setLanguage('en', { apply: false });
        unsubscribe();
        setLanguage('es', { apply: false });

        expect(events).toEqual(['en']);
    });

    it('applies translations to text and attributes', () => {
        document.body.innerHTML = `
            <h1 data-i18n="app.name"></h1>
            <input id="search" data-i18n-placeholder="history.search_placeholder">
            <button id="close" data-i18n-aria-label="notifications.close"></button>
        `;

        setLanguage('es', { persist: false, apply: false });
        applyTranslations(document);

        expect(document.querySelector('h1').textContent).toBe('My Workout Tracker');
        expect(document.getElementById('search').placeholder).toContain('Buscar');
        expect(document.getElementById('close').getAttribute('aria-label')).toContain('Cerrar');
    });
});
