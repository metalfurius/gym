// This value is rewritten by update-version.cjs and is part of the release contract.
const RELEASE_REVISION = 'v2.7.0';
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
    './js/storage-manager.js',
    './js/version-manager.js',
    './js/firebase-config.js',
    './js/firebase-diagnostics.js',
    './js/exercise-cache.js',
    './js/progress.js',
    './js/timer.js',
    './js/theme-manager.js',
    './js/utils/logger.js',
    './js/utils/validation.js',
    './js/utils/notifications.js',
    './js/utils/debounce.js',
    './js/utils/event-manager.js',
    './js/utils/offline-manager.js',
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
    if (requestUrl.origin !== self.location.origin) return true;
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

self.addEventListener('install', (event) => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            const localUrls = urlsToCache.filter((url) => url.startsWith('./'));
            const optionalExternalUrls = urlsToCache.filter((url) => !url.startsWith('./'));

            // The new cache is complete before the worker can be activated. Metadata
            // remains network-first at runtime so an old CDN response cannot become
            // the source of truth for a later update.
            await cache.addAll(localUrls);
            await Promise.all(optionalExternalUrls.map((url) => cacheOptionalAsset(cache, url)));
        })()
    );
});

self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') {
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
