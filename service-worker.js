const CACHE_NAME = 'qrguardian-terminal-v2';

const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',

  // CSS
  '/css/bootstrap.min.css',
  '/css/bootstrap-icons.min.css',
  '/css/index.css',

  // FONTS POPPINS
  '/css/fonts/poppins-v24-latin_latin-ext-100.woff2',
  '/css/fonts/poppins-v24-latin_latin-ext-200.woff2',
  '/css/fonts/poppins-v24-latin_latin-ext-300.woff2',
  '/css/fonts/poppins-v24-latin_latin-ext-regular.woff2',
  '/css/fonts/poppins-v24-latin_latin-ext-500.woff2',
  '/css/fonts/poppins-v24-latin_latin-ext-600.woff2',
  '/css/fonts/poppins-v24-latin_latin-ext-700.woff2',
  '/css/fonts/poppins-v24-latin_latin-ext-800.woff2',
  '/css/fonts/poppins-v24-latin_latin-ext-900.woff2',

  // JS
  '/js/qrcode.min.js',
  '/js/jsQR.min.js',
  '/js/database.js',
  '/js/scanner.js',
  '/js/app.js',

  // ICONS
  
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];


// INSTALL
self.addEventListener('install', event => {

  self.skipWaiting();

  event.waitUntil(

    caches.open(CACHE_NAME).then(async cache => {

      for (const url of urlsToCache) {

        try {

          const response = await fetch(url, { mode: 'no-cors' });

          await cache.put(url, response);

        } catch (err) {

          console.warn("Impossible de cacher :", url);

        }

      }

    })

  );

});


// FETCH
self.addEventListener('fetch', event => {

  if (event.request.method !== 'GET') return;

  event.respondWith(

    caches.match(event.request)
      .then(cached => {

        const networkFetch = fetch(event.request)
          .then(networkResponse => {

            if (networkResponse && networkResponse.status === 200) {

              const clone = networkResponse.clone();

              caches.open(CACHE_NAME)
                .then(cache => cache.put(event.request, clone));

            }

            return networkResponse;

          })
          .catch(() => cached);

        return cached || networkFetch;

      })
      .catch(() => {

        if (event.request.mode === 'navigate') {

          return caches.match('/index.html');

        }

      })

  );

});


// ACTIVATE
self.addEventListener('activate', event => {

  event.waitUntil(

    caches.keys().then(cacheNames => {

      return Promise.all(

        cacheNames.map(name => {

          if (name !== CACHE_NAME) {

            console.log("Suppression cache :", name);

            return caches.delete(name);

          }

        })

      );

    })

  );

  return self.clients.claim();

});
