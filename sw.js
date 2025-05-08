const CACHE_NAME = 'gym-tracker-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/auth.js',
  '/js/ui.js',
  '/js/store.js',
  '/js/firebase-config.js',
  '/manifest.json',
  '/assets/icons/icon-192x192.png',
  '/assets/icons/icon-512x512.png',
  'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'
  // Añade aquí cualquier otra fuente o imagen estática importante
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        return fetch(event.request).then(
          // Si la petición es exitosa, la clonamos y la guardamos en cache
          // Es importante clonar porque la respuesta es un Stream y solo puede ser consumida una vez
          function(response) {
            // Comprueba si recibimos una respuesta válida
            if(!response || response.status !== 200 || response.type !== 'basic') {
              if (event.request.url.includes('firestore.googleapis.com')) { // No cachear peticiones de Firestore
                return response;
              }
            }

            // No cachear peticiones a Firestore directamente aquí para evitar datos desactualizados,
            // Firebase SDK maneja su propia cache offline si está habilitada.
            // Solo cacheamos nuestros assets estáticos.
            if (!event.request.url.includes('firestore.googleapis.com') && !event.request.url.includes('firebaseapp.com')) {
                const responseToCache = response.clone();
                caches.open(CACHE_NAME)
                  .then(cache => {
                    cache.put(event.request, responseToCache);
                  });
            }
            return response;
          }
        );
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
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});