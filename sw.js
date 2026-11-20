// This value is rewritten by update-version.cjs and is part of the release contract.
const RELEASE_REVISION = 'v2.8.4';
const CACHE_NAME = `gym-tracker-${RELEASE_REVISION}`;
const RELEASE_METADATA_PATHS = new Set(['manifest.json', 'release.json']);
const OPTIONAL_ASSET_TIMEOUT_MS = 5_000;

const urlsToCache = [
    './',
    './index.html',
    './manifest.json',
    './release.json',
    './css/components/variables.css',
    './css/components/base.css',
    './css/components/header.css',
    './css/components/layout.css',
    './css/components/forms.css',
    './css/components/buttons.css',
    './css/components/auth.css',
    './css/components/footer.css',
    './css/components/spinner.css',
    './css/components/calendar.css',
    './css/components/modal.css',
    './css/components/scroll-to-top.css',
    './css/components/history.css',
    './css/components/routines.css',
    './css/components/exercise-cache.css',
    './css/components/progress.css',
    './css/components/timer.css',
    './css/components/daily-hub.css',
    './css/components/responsive.css',
    './css/user-weight.css',
    './js/app.js',
    './js/auth.js',
    './js/ui.js',
    './js/i18n.js',
    './js/storage-manager.js',
    './js/version-manager.js',
    './js/firebase-config.js',
    './js/firebase-diagnostics.js',
    './js/exercise-cache.js',
    './js/progress.js',
    './js/timer.js',
    './js/theme-manager.js',
    './js/utils/logger.js',
    './js/utils/account-scope.js',
    './js/utils/auth-state.js',
    './js/utils/calendar-clock.js',
    './js/utils/owned-transaction.js',
    './js/utils/session-mutations.js',
    './js/utils/session-store.js',
    './js/utils/weekly-preferences.js',
    './js/utils/numeric-input.js',
    './js/utils/input-validation.js',
    './js/utils/validation.js',
    './js/utils/notifications.js',
    './js/utils/debounce.js',
    './js/utils/event-manager.js',
    './js/utils/firebase-usage-tracker.js',
    './js/utils/offline-manager.js',
    './js/utils/routine-import.js',
    './js/utils/release-updater.js',
    './js/utils/bodyweight.js',
    './js/utils/firestore-serialization.js',
    './js/utils/execution-mode.js',
    './js/utils/load-type.js',
    './js/utils/local-first-cache.js',
    './js/utils/quick-log.js',
    './js/utils/session-variant-overrides.js',
    './js/modules/scroll-to-top.js',
    './js/modules/settings.js',
    './js/modules/calendar.js',
    './js/modules/session-manager.js',
    './js/modules/history-manager.js',
    './js/modules/pagination.js',
    './assets/icons/icon-192x192.png',
    './assets/icons/icon-512x512.png',
    './assets/icons/favicon.ico',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js',
    'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js',
    'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js',
    'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'
];

const externalCacheUrls = new Set(urlsToCache.filter((url) => !url.startsWith('./')));
const localCachePaths = new Set(
    urlsToCache
        .filter((url) => url.startsWith('./'))
        .map((url) => url.replace(/^\.\//, '') || 'index.html')
);

function getScopedPath(request) {
    const requestUrl = new URL(request.url);
    if (requestUrl.origin !== self.location.origin) return null;

    const scopeUrl = new URL('./', self.registration.scope);
    if (!requestUrl.pathname.startsWith(scopeUrl.pathname)) return null;

    return requestUrl.pathname.slice(scopeUrl.pathname.length) || 'index.html';
}

function isReleaseMetadataRequest(request) {
    const scopedPath = getScopedPath(request);
    return scopedPath !== null && RELEASE_METADATA_PATHS.has(scopedPath);
}

function isStaticAssetRequest(request) {
    if (request.method !== 'GET') return false;
    const requestUrl = new URL(request.url);
    if (requestUrl.origin !== self.location.origin) return externalCacheUrls.has(request.url);
    return localCachePaths.has(getScopedPath(request));
}

function cacheOptionalAsset(cache, url) {
    let timeoutId;
    const timeout = new Promise((resolve) => {
        timeoutId = setTimeout(resolve, OPTIONAL_ASSET_TIMEOUT_MS);
    });
    const request = cache.add(url).catch(() => undefined);
    return Promise.race([request, timeout]).finally(() => clearTimeout(timeoutId));
}

async function getCachedResponse(request) {
    const cache = await caches.open(CACHE_NAME);
    return cache.match(request);
}

async function fetchReleaseMetadata(request) {
    try {
        const response = await fetch(new Request(request, { cache: 'no-store' }));
        if (response.ok) return response;
        throw new Error(`Metadata request failed with status ${response.status}`);
    } catch (error) {
        console.warn('SW: release metadata unavailable online; using current release cache', error);
        return (await getCachedResponse(request)) || Response.error();
    }
}

async function cacheFirst(request) {
    const cachedResponse = await getCachedResponse(request);
    if (cachedResponse) return cachedResponse;

    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        console.warn('SW: static asset unavailable:', request.url, error);
        return (await getCachedResponse(request)) || Response.error();
    }
}

async function assetDigest(response, path) {
    let bytes = await response.clone().arrayBuffer();
    if (/\.(?:css|cjs|html|js|json|mjs|svg|txt)$/i.test(path)) {
        const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes).replace(/\r\n?/g, '\n');
        bytes = new TextEncoder().encode(text);
    }
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

async function matchesShellRevision(response) {
    // Cloudflare can add security and optimization scripts to HTML in transit,
    // so its bytes are not stable. The release marker must still match exactly.
    const html = await response.clone().text();
    const marker = html.match(/<meta\b(?=[^>]*\bname\s*=\s*["']gym-release-revision["'])(?=[^>]*\bcontent\s*=\s*["']([^"']+)["'])[^>]*>/i);
    return marker?.[1] === RELEASE_REVISION;
}

async function installVerifiedRelease(localUrls) {
    const nonce = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const cacheName = `gym-tracker-stage-${RELEASE_REVISION}-${nonce}`;
    const staging = await caches.open(cacheName);
    const fresh = (path) => {
        const url = new URL(path, self.registration.scope);
        url.searchParams.set('gym_update', nonce);
        return url;
    };

    try {
        const metadataResponse = await fetch(fresh('./release.json'), { cache: 'no-store' });
        if (!metadataResponse.ok) throw new Error('Release metadata is unavailable');
        const release = await metadataResponse.clone().json();
        if (release.schemaVersion !== 1 || release.revision !== RELEASE_REVISION ||
            `v${release.version}` !== RELEASE_REVISION || release.cacheName !== CACHE_NAME ||
            !release.assets || typeof release.assets !== 'object' || Array.isArray(release.assets)) {
            throw new Error('Release metadata does not match the service worker');
        }
        await staging.put(new URL('./release.json', self.registration.scope), metadataResponse);

        const assets = localUrls.filter(url => url !== './release.json');
        for (let index = 0; index < assets.length; index += 8) {
            await Promise.all(assets.slice(index, index + 8).map(async (url) => {
                const path = url.replace(/^\.\//, '') || 'index.html';
                const expected = release.assets[path];
                if (!/^[a-f0-9]{64}$/.test(expected || '')) throw new Error(`Missing release hash for ${path}`);
                const response = await fetch(fresh(url), { cache: 'no-store' });
                const matchesRelease = response.ok && (path === 'index.html'
                    ? await matchesShellRevision(response)
                    : await assetDigest(response, path) === expected);
                if (!matchesRelease) {
                    throw new Error(`Release asset does not match: ${path}`);
                }
                await staging.put(new URL(url, self.registration.scope), response);
            }));
        }

        // Never replace an active release cache with unverified or incomplete files.
        const cache = await caches.open(CACHE_NAME);
        for (const url of localUrls) {
            const key = new URL(url, self.registration.scope);
            const response = await staging.match(key);
            if (!response) throw new Error(`Verified release asset is missing: ${url}`);
            await cache.put(key, response);
        }
        return cache;
    } finally {
        await caches.delete(cacheName);
    }
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        (async () => {
            const localUrls = urlsToCache.filter((url) => url.startsWith('./'));
            const optionalExternalUrls = urlsToCache.filter((url) => !url.startsWith('./'));

            const cache = await installVerifiedRelease(localUrls);
            await Promise.all(optionalExternalUrls.map((url) => cacheOptionalAsset(cache, url)));
        })()
    );
});

self.addEventListener('message', (event) => {
    if (event.origin !== self.location.origin) return;
    const sourceUrl = event.source?.url;
    const sameOrigin = sourceUrl && new URL(sourceUrl).origin === self.location.origin;
    if (sameOrigin && event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    if (isReleaseMetadataRequest(event.request)) {
        event.respondWith(fetchReleaseMetadata(event.request));
        return;
    }

    if (isStaticAssetRequest(event.request)) {
        event.respondWith(cacheFirst(event.request));
    }
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const cacheNames = await caches.keys();
            await Promise.all(
                cacheNames
                    .filter((cacheName) => cacheName.startsWith('gym-tracker-') && cacheName !== CACHE_NAME)
                    .map((cacheName) => caches.delete(cacheName))
            );

            await self.clients.claim();
        })()
    );
});
