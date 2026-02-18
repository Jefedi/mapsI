const CACHE_NAME = 'mapsi-v2';
const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

// Install - cache static assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch - network first for API calls, cache first for static assets
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Network-only for API calls
    if (url.hostname.includes('nominatim') || url.hostname.includes('router.project-osrm')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Cache first for tile images
    if (url.hostname.includes('tile.openstreetmap.org')) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached) return cached;
                return fetch(event.request).then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return response;
                });
            })
        );
        return;
    }

    // Cache first, network fallback for static assets
    event.respondWith(
        caches.match(event.request).then(cached => cached || fetch(event.request))
    );
});
