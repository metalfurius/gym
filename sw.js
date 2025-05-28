const APP_VERSION = '1.0.3';
const CACHE_NAME = `gym-tracker-v${APP_VERSION}`;
const urlsToCache = [
  './',
  './index.html',
  './css/components/variables.css',
  './css/components/base.css',
  './css/components/header.css',
  './css/components/layout.css',
  './css/components/forms.css',
  './css/components/buttons.css',
  './css/components/footer.css',
  './css/components/spinner.css',
  './css/components/calendar.css',
  './css/components/modal.css',
  './css/user-weight.css',
  './css/components/scroll-to-top.css',
  './css/components/responsive.css',  './js/app.js',
  './js/auth.js',
  './js/ui.js',
  './js/store.js',
  './js/storage-manager.js',
  './js/version-manager.js',
  './js/firebase-config.js',
  './manifest.json',
  './assets/icons/icon-192x192.png',
  './assets/icons/icon-512x512.png',
  './assets/icons/favicon.ico',
  'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('SW: Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Cache hit - return response
        if (cachedResponse) {
          return cachedResponse;
        }

        // Not in cache, fetch from network
        return fetch(event.request).then(
          networkResponse => {
            // IMPORTANT: Check if we received a valid response AND if it's something we WANT to cache.
            // This is the crucial part that fixes the errors.
            if (
              networkResponse &&                          // We got a response
              networkResponse.status === 200 &&           // It's a successful response
              event.request.method === 'GET' &&           // <<< ONLY cache GET requests
              (event.request.url.startsWith('http:') ||   // <<< ONLY cache http or https schemes
               event.request.url.startsWith('https:')) &&
              !event.request.url.includes('firestore.googleapis.com') && // Don't cache Firestore API calls
              !event.request.url.includes('firebaseapp.com') // Generally, don't cache auth domain interactions unless specific static assets
                                                             // This also helps avoid caching other potential Firebase service calls.
            ) {
              // Clone the response to use it in the cache and to return to the browser.
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, responseToCache);
                });
            }
            return networkResponse; // Return the original network response
          }
        ).catch(error => {
          // Handle fetch errors, e.g., when offline.
          // For GET requests, you might want to return a fallback page.
          console.warn('SW: Network fetch failed for:', event.request.url, error);
          // Example: if (event.request.mode === 'navigate') return caches.match('/offline.html');
          // For now, just rethrow to let the browser handle it or show its default offline page.
          // This prevents the SW from breaking on POST/PUT errors when offline if not handled.
          // throw error; // Uncomment if you want the browser's default error for fetch failures.
        });
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('SW: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Force the SW to become active immediately
  return self.clients.claim();
});