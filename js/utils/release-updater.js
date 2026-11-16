const UPDATE_TIMEOUT_MS = 30_000;

function appBaseUrl() {
    return new URL('./', window.location.href);
}

function freshUrl(path) {
    const url = new URL(path, appBaseUrl());
    const nonce = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    url.searchParams.set('gym_update', nonce);
    return url;
}

export function compareRevisions(left, right) {
    if (!/^v\d+\.\d+\.\d+$/.test(left || '') || !/^v\d+\.\d+\.\d+$/.test(right || '')) {
        throw new Error('Invalid release revision');
    }
    const a = left.slice(1).split('.').map(Number);
    const b = right.slice(1).split('.').map(Number);
    for (let index = 0; index < a.length; index += 1) {
        if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
    }
    return 0;
}

export async function fetchLatestRelease() {
    const response = await fetch(freshUrl('release.json'), { cache: 'no-store' });
    if (!response.ok) throw new Error(`Release metadata request failed (${response.status})`);
    const release = await response.json();
    if (!/^\d+\.\d+\.\d+$/.test(release?.version || '') || release.revision !== `v${release.version}`) {
        throw new Error('The release metadata is invalid or incomplete');
    }
    return release;
}

function waitForWorker(registration, scriptUrl) {
    return new Promise((resolve, reject) => {
        let observedWorker;
        const timeout = setTimeout(() => finish(new Error('The new service worker did not finish installing')), UPDATE_TIMEOUT_MS);

        function finish(error, worker) {
            clearTimeout(timeout);
            registration.removeEventListener?.('updatefound', check);
            observedWorker?.removeEventListener?.('statechange', check);
            if (error) reject(error);
            else resolve(worker);
        }

        function check() {
            const worker = [registration.installing, registration.waiting, registration.active]
                .find(candidate => candidate?.scriptURL === scriptUrl) || observedWorker;
            if (!worker) return;
            if (observedWorker !== worker) {
                observedWorker?.removeEventListener?.('statechange', check);
                observedWorker = worker;
                worker.addEventListener?.('statechange', check);
            }
            if (worker.state === 'installed' || worker.state === 'activated') finish(null, worker);
            else if (worker.state === 'redundant') finish(new Error('The new service worker could not be installed'));
        }

        registration.addEventListener?.('updatefound', check);
        check();
    });
}

export async function prepareReleaseWorker(release) {
    if (!navigator.serviceWorker?.register) throw new Error('Service workers are unavailable');
    if (!/^v\d+\.\d+\.\d+$/.test(release?.revision || '')) throw new Error('Invalid release revision');

    const scriptUrl = freshUrl('sw.js');
    scriptUrl.searchParams.set('gym_revision', release.revision);
    const response = await fetch(scriptUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Service worker request failed (${response.status})`);
    const source = await response.text();
    const revision = source.match(/^const RELEASE_REVISION = ['"]([^'"]+)['"];?/m)?.[1];
    if (revision !== release.revision) throw new Error('The service worker does not match the latest release');

    const registration = await navigator.serviceWorker.register(scriptUrl.href, {
        scope: appBaseUrl().pathname,
        updateViaCache: 'none'
    });
    const worker = await waitForWorker(registration, scriptUrl.href);
    return { registration, worker };
}

export async function activateReleaseWorker(worker) {
    if (worker.state === 'activated') return;
    if (worker.state !== 'installed') throw new Error('The new service worker is not ready');

    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => finish(new Error('The new service worker did not activate')), UPDATE_TIMEOUT_MS);
        function finish(error) {
            clearTimeout(timeout);
            worker.removeEventListener?.('statechange', check);
            if (error) reject(error);
            else resolve();
        }
        function check() {
            if (worker.state === 'activated') finish();
            else if (worker.state === 'redundant') finish(new Error('The new service worker could not activate'));
        }
        worker.addEventListener?.('statechange', check);
        worker.postMessage({ type: 'SKIP_WAITING' });
        check();
    });
}
