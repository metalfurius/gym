import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { activateReleaseWorker, compareRevisions, fetchLatestRelease, prepareReleaseWorker } from '../../js/utils/release-updater.js';

describe('release updater', () => {
    beforeEach(() => {
        global.fetch = jest.fn();
        Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register: jest.fn() } });
    });

    it('requests fresh metadata and rejects invalid revisions', async () => {
        fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ version: '2.9.0', revision: 'v2.9.0' }) });
        expect(await fetchLatestRelease()).toEqual({ version: '2.9.0', revision: 'v2.9.0' });
        const url = new URL(fetch.mock.calls[0][0]);
        expect(url.pathname).toMatch(/release\.json$/);
        expect(url.searchParams.has('gym_update')).toBe(true);
        expect(fetch.mock.calls[0][1]).toEqual({ cache: 'no-store' });

        fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ version: '2.9.0', revision: 'v2.8.0' }) });
        await expect(fetchLatestRelease()).rejects.toThrow('invalid or incomplete');
    });

    it('compares release numbers numerically and rejects invalid revisions', () => {
        expect(compareRevisions('v2.10.0', 'v2.9.9')).toBe(1);
        expect(compareRevisions('v2.7.12', 'v2.8.1')).toBe(-1);
        expect(() => compareRevisions('not-a-version', 'v2.8.1')).toThrow('Invalid');
    });

    it('does not register a stale service worker returned by an intermediary cache', async () => {
        fetch.mockResolvedValue({ ok: true, text: async () => "const RELEASE_REVISION = 'v2.7.12';" });
        await expect(prepareReleaseWorker({ revision: 'v2.9.0' })).rejects.toThrow('does not match');
        expect(navigator.serviceWorker.register).not.toHaveBeenCalled();
    });

    it('registers the verified worker under the application scope and activates it', async () => {
        fetch.mockResolvedValue({ ok: true, text: async () => "const RELEASE_REVISION = 'v2.9.0';" });
        const worker = new EventTarget();
        worker.state = 'installed';
        worker.postMessage = jest.fn(() => {
            worker.state = 'activated';
            worker.dispatchEvent(new Event('statechange'));
        });
        navigator.serviceWorker.register.mockImplementation(async scriptUrl => {
            worker.scriptURL = scriptUrl;
            return { waiting: worker, addEventListener: jest.fn(), removeEventListener: jest.fn() };
        });

        const prepared = await prepareReleaseWorker({ revision: 'v2.9.0' });
        const [scriptUrl, options] = navigator.serviceWorker.register.mock.calls[0];
        expect(new URL(scriptUrl).searchParams.get('gym_revision')).toBe('v2.9.0');
        expect(options.updateViaCache).toBe('none');
        expect(options.scope).toBe(new URL('./', location.href).pathname);
        await activateReleaseWorker(prepared.worker);
        expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
        expect(worker.state).toBe('activated');
    });
});
