// DOM authoring regressions: real UI renderer and suggestion cache, injected
// read-only model observation/public event routing; no Firebase or browser run.
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'node:fs';
import vm from 'node:vm';
import { QaBrowser, readSessionDetailDom } from '../../scripts/live-sync-qa-browser.mjs';
import { captureFixtures, calendarFixture, PRIMARY_UID, until } from '../../scripts/live-sync-qa-protocol.mjs';

jest.unstable_mockModule('../../js/auth.js', () => ({ getCurrentUser: () => ({ uid: PRIMARY_UID }) }));
const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
document.documentElement.innerHTML = html;
const ui = await import('../../js/ui.js');
const { setLanguage, t } = await import('../../js/i18n.js');
const { beginAccountSession } = await import('../../js/utils/account-scope.js');
const { exerciseCache } = await import('../../js/exercise-cache.js');
const fixture = captureFixtures(calendarFixture());
const routine = {
    id: 'qa-routine',
    name: 'Distinct QA routine',
    exercises: [
        { name: 'QA Press', type: 'strength', sets: 1, reps: '8', executionMode: 'two_hand', loadType: 'external' },
    ],
};
const sessions = fixture.map((item, index) => ({
    id: 'strength-' + index,
    nombreEntrenamiento: routine.name,
    fecha: { toDate: () => new Date(item.calendarIso) },
    ejercicios: [
        {
            nombreEjercicio: 'QA Press',
            tipoEjercicio: 'strength',
            modoEjecucion: 'two_hand',
            tipoCarga: 'external',
            sets: [{ peso: item.weight, reps: item.reps, tiempoDescanso: '00:08' }],
        },
    ],
}));
const sentinel = {
    id: 'quick-log-sentinel',
    nombreEntrenamiento: 'QA sentinel label',
    fecha: { toDate: () => new Date('2026-10-31T11:00:00.000Z') },
    ejercicios: [
        { nombreEjercicio: 'Quick log', tipoEjercicio: 'other', notasEjercicio: 'codexLiveQaRun:fixture:sentinel' },
    ],
};
let selected, renderError, afterDetail;

// Only the CDP read boundary is injected. Button selectors and page expressions
// execute against the real UI's DOM, including the deliberately ID-less View button.
function adapter() {
    const browser = Object.create(QaBrowser.prototype);
    browser.client = {
        evaluate: async expression => {
            if (renderError) throw renderError;
            if (expression.includes('const {getSessionsCache}')) {
                return readSessionDetailDom(selected, ui.formatDate(selected.fecha.toDate()));
            }
            return vm.runInNewContext(expression, { document, Event, Number, JSON });
        },
    };
    browser.waitPage = (expression, label) =>
        until(() => browser.client.evaluate(expression), { timeoutMs: 400, intervalMs: 5, label });
    browser.locateHistory = async () => ui.renderHistoryList([...sessions, sentinel]);
    return browser;
}

beforeEach(() => {
    beginAccountSession(PRIMARY_UID);
    exerciseCache.setUser(PRIMARY_UID);
    exerciseCache.clearCache();
    renderError = null;
    afterDetail = null;
    selected = null;
    ui.updateNav(true);
    ui.showView('history');
    ui.hideSessionDetail();
    ui.historyElements.list.onclick = event => {
        const row = event.target.closest('li[data-session-id]');
        if (!row || !event.target.closest('button[data-action="view-session"]')) return;
        selected = [...sessions, sentinel].find(item => item.id === row.dataset.sessionId);
        ui.showSessionDetail(selected);
        afterDetail?.();
    };
    document.querySelector('#session-detail-modal .modal-close').onclick = ui.hideSessionDetail;
    document.getElementById('nav-dashboard').onclick = () => ui.showView('dashboard');
    document.getElementById('day-select').innerHTML = `<option value="${routine.id}">${routine.name}</option>`;
    document.getElementById('start-session-btn').disabled = false;
    document.getElementById('start-session-btn').onclick = () => {
        ui.renderSessionView(routine)
            .then(() => ui.showView('session'))
            .catch(error => {
                renderError = error;
            });
    };
    document.getElementById('cancel-session-btn').onclick = () => ui.showView('dashboard');
    jest.spyOn(Element.prototype, 'getClientRects').mockImplementation(function () {
        for (let element = this; element; element = element.parentElement) {
            if (element.classList.contains('hidden') || element.hidden || element.style.display === 'none') return [];
        }
        return [{}];
    });
});

describe('runner detail observations on actual ES/EN render output', () => {
    it.each(['es', 'en'])('opens the requested row by ID and checks original date/load/reps (%s)', async language => {
        setLanguage(language);
        const expected = { id: sessions[2].id, label: routine.name, ...fixture[2] };
        const result = await adapter().detail(expected);
        expect(result).toMatchObject({ id: sessions[2].id, label: routine.name, dateIso: fixture[2].calendarIso });
        expect(result.sets[0]).toContain('52.5 kg x 8');
        expect(document.getElementById('session-detail-modal').style.display).toBe('none');
        expect(document.querySelector('#history-list button[data-action="view-session"][data-session-id]')).toBeNull();
    });
    it('checks the backdated Quick Log sentinel label, original date and unique note in its own detail', async () => {
        const result = await adapter().detail({
            id: sentinel.id,
            label: sentinel.nombreEntrenamiento,
            calendarIso: sentinel.fecha.toDate().toISOString(),
            noteMarker: sentinel.ejercicios[0].notasEjercicio,
        });
        expect(result.body).toContain('codexLiveQaRun:fixture:sentinel');
        expect(result.dateIso).toBe('2026-10-31T11:00:00.000Z');
    });
    it.each(['label', 'date', 'model-date', 'weight', 'reps'])(
        'rejects wrong %s, including an 8-second timer masking wrong reps',
        async fault => {
            setLanguage('en');
            afterDetail = () => {
                if (fault === 'label') document.getElementById('session-detail-title').textContent = 'wrong row';
                if (fault === 'date') document.getElementById('session-detail-date').textContent = 'wrong date';
                if (fault === 'model-date') {
                    selected = { ...selected, fecha: { toDate: () => new Date(fixture[1].calendarIso) } };
                }
                if (fault === 'weight') {
                    document.querySelector('#session-detail-exercises .sets-list li').textContent =
                        'Set 1: 51.5 kg x 8 reps';
                }
                if (fault === 'reps') {
                    document.querySelector('#session-detail-exercises .sets-list li').textContent =
                        'Set 1: 52.5 kg x 7 reps (rest 00:08)';
                }
            };
            await expect(adapter().detail({ id: sessions[2].id, label: routine.name, ...fixture[2] })).rejects.toThrow(
                'QA_DETAIL_'
            );
            expect(document.getElementById('session-detail-modal').style.display).toBe('none');
        }
    );
});

describe('runner public suggestion observations (provided local cache fixture)', () => {
    it.each(['es', 'en'])('accepts a genuine empty history but rejects an error/uncached message as empty (%s)', async language => {
        setLanguage(language);
        const browser = adapter();
        const evaluate = browser.client.evaluate;
        browser.client.evaluate = expression => expression.includes("return t('history.empty')")
            ? Promise.resolve(t('history.empty')) : evaluate(expression);
        ui.renderHistoryList([]);
        document.getElementById('history-loading').classList.add('hidden');
        expect(await browser.historyIds({ allowEmpty: true })).toEqual([]);
        document.getElementById('history-list').innerHTML = '<li>Uncached/error fixture</li>';
        await expect(browser.historyIds({ allowEmpty: true })).rejects.toThrow('QA_TIMEOUT:history-loaded');
    });
    it.each(['es', 'en'])('observes the real empty suggestion UI after owned cleanup (%s)', async language => {
        setLanguage(language);
        const result = await adapter().suggestions(routine.id, null);
        expect(result).toMatchObject({ absent: true, publicCaptureInspected: true, saved: false });
        expect(document.getElementById('dashboard-view').classList.contains('hidden')).toBe(false);
    });
    it.each(['es', 'en'])(
        'accepts 53.5 then 52.5 after a fresh fixture rebuild and uses the real fill button (%s)',
        async language => {
            setLanguage(language);
            for (const count of [4, 3]) {
                exerciseCache.clearCache();
                sessions.slice(0, count).forEach(session => exerciseCache.processCompletedSession(session));
                const result = await adapter().suggestions(routine.id, {
                    id: sessions[count - 1].id,
                    ...fixture[count - 1],
                });
                expect(result).toMatchObject({
                    weight: count === 4 ? 53.5 : 52.5,
                    reps: 8,
                    filledFromPublicButton: true,
                });
                expect(document.getElementById('dashboard-view').classList.contains('hidden')).toBe(false);
            }
        }
    );
    it('rejects the stale latest suggestion when the remaining manifest requires the previous record', async () => {
        sessions.forEach(session => exerciseCache.processCompletedSession(session));
        await expect(adapter().suggestions(routine.id, { id: sessions[2].id, ...fixture[2] })).rejects.toThrow(
            'QA_TIMEOUT:visible-latest-strength-suggestion'
        );
    });
});
