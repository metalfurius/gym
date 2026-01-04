// Versión dinámica obtenida del manifest al instalar el service worker
let APP_VERSION = '1.1.0'; // Fallback version
const CACHE_NAME = `gym-tracker-v${APP_VERSION}`;

// Función para obtener la versión del manifest
async function getVersionFromManifest() {
  try {
    const response = await fetch('./manifest.json');
    const manifest = await response.json();
    return manifest.version;
  } catch (error) {
    console.error('SW: Error fetching version from manifest:', error);
    return APP_VERSION; // Usar fallback
  }
}
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
  './js/storage-manager.js',
  './js/version-manager.js',
  './js/firebase-config.js',
  './js/firebase-diagnostics.js',
  './manifest.json',
  './assets/icons/icon-192x192.png',
  './assets/icons/icon-512x512.png',
  './assets/icons/favicon.ico',
  'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'
];

self.addEventListener('install', async event => {
  event.waitUntil(
    (async () => {
      try {
        // Obtener la versión actual del manifest
        const manifestVersion = await getVersionFromManifest();
        APP_VERSION = manifestVersion;
        
        // Crear el nombre del caché con la versión actualizada
        const dynamicCacheName = `gym-tracker-v${APP_VERSION}`;
        
        const cache = await caches.open(dynamicCacheName);
        console.log(`SW: Opened cache with version ${APP_VERSION}`);
        await cache.addAll(urlsToCache);
        
        // Auto-activar el nuevo service worker
        self.skipWaiting();
      } catch (error) {
        console.error('SW: Error during install:', error);
        // Fallback al comportamiento anterior
        const cache = await caches.open(CACHE_NAME);
        console.log('SW: Opened fallback cache');
        await cache.addAll(urlsToCache);
      }
    })()
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
            // Parse the request URL once for reliable host-based checks
            const requestUrl = new URL(event.request.url);
            const requestHost = requestUrl.hostname;

            if (
              networkResponse &&                          // We got a response
              networkResponse.status === 200 &&           // It's a successful response
              event.request.method === 'GET' &&           // <<< ONLY cache GET requests
              (requestUrl.protocol === 'http:' ||         // <<< ONLY cache http or https schemes
               requestUrl.protocol === 'https:') &&
              requestHost !== 'firestore.googleapis.com' && // Don't cache Firestore API calls
              requestHost !== 'firebaseapp.com' &&          // Generally, don't cache auth domain interactions unless specific static assets
              !requestHost.endsWith('.firebaseapp.com')     // Also avoid subdomains of firebaseapp.com for auth/service calls
            ) {              // Clone the response to use it in the cache and to return to the browser.
              const responseToCache = networkResponse.clone();
              
              // Obtener el nombre del caché actual dinámicamente
              getVersionFromManifest().then(manifestVersion => {
                const currentCacheName = `gym-tracker-v${manifestVersion}`;
                caches.open(currentCacheName)
                  .then(cache => {
                    cache.put(event.request, responseToCache);
                  });
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

self.addEventListener('activate', async event => {
  event.waitUntil(
    (async () => {
      try {
        // Obtener la versión actual del manifest
        const manifestVersion = await getVersionFromManifest();
        const currentCacheName = `gym-tracker-v${manifestVersion}`;
        
        const cacheWhitelist = [currentCacheName];
        const cacheNames = await caches.keys();
        
        await Promise.all(
          cacheNames.map(cacheName => {
            if (cacheWhitelist.indexOf(cacheName) === -1) {
              console.log('SW: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
        
        console.log(`SW: Activated with version ${manifestVersion}`);
      } catch (error) {
        console.error('SW: Error during activate:', error);
        // Fallback al comportamiento anterior
        const cacheWhitelist = [CACHE_NAME];
        const cacheNames = await caches.keys();
        
        await Promise.all(
          cacheNames.map(cacheName => {
            if (cacheWhitelist.indexOf(cacheName) === -1) {
              console.log('SW: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }
      
      // Force the SW to become active immediately
      return self.clients.claim();
    })()
  );
});