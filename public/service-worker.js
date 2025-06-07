const CACHE_NAME = 'sankalpa-v1';
const urlsToCache = [
  '/',
  '/about',
  '/home',
  '/login',
  '/register',
  '/static/sankalpa.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
  '/offline.html'  // We'll create this next
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request)
          .then((response) => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            // Cache successful responses
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                if (event.request.method === 'GET') {
                  cache.put(event.request, responseToCache);
                }
              });
            return response;
          })
          .catch(() => {
            // Return offline page for navigation requests
            if (event.request.mode === 'navigate') {
              return caches.match('/offline.html');
            }
            // Return a fallback image for image requests
            if (event.request.destination === 'image') {
              return caches.match('/icons/icon-192x192.png');
            }
          });
      })
  );
});
