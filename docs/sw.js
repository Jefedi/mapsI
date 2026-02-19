const CACHE_NAME = 'mapsi-v31';
const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './lib/leaflet/leaflet.css',
    './lib/leaflet/leaflet.js',
    './lib/markercluster/leaflet.markercluster.js',
    './lib/markercluster/MarkerCluster.css',
    './lib/markercluster/MarkerCluster.Default.css',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './offline.html'
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

// Fetch - network first for API calls, cache first for tiles and static assets
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Network-only for local API proxies (with offline fallback)
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(event.request).catch(() => {
                return new Response(JSON.stringify({ error: 'offline' }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return;
    }

    // Cache first for self-hosted tile images (only cache successful responses)
    if (url.pathname.startsWith('/tiles/')) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached) return cached;
                return fetch(event.request).then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return response;
                }).catch(() => new Response('', { status: 408 }));
            })
        );
        return;
    }

    // Cache first, network fallback for static assets, offline page as last resort for HTML
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request).catch(() => {
                if (event.request.mode === 'navigate') {
                    return caches.match('./offline.html');
                }
                return new Response('', { status: 408 });
            });
        })
    );
});

// Message handler for offline tile pre-caching
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'CACHE_TILES') {
        const { tiles } = event.data;
        if (!tiles || !Array.isArray(tiles)) return;

        const total = tiles.length;
        let done = 0;
        let errors = 0;

        const cacheTile = async (tileUrl) => {
            try {
                const response = await fetch(tileUrl);
                if (response.ok) {
                    const cache = await caches.open(CACHE_NAME);
                    await cache.put(tileUrl, response);
                }
            } catch (e) {
                errors++;
            }
            done++;
            // Report progress every 10 tiles
            if (done % 10 === 0 || done === total) {
                self.clients.matchAll().then(clients => {
                    clients.forEach(client => {
                        client.postMessage({
                            type: 'CACHE_TILES_PROGRESS',
                            done,
                            total,
                            errors
                        });
                    });
                });
            }
        };

        // Process tiles in batches of 6 to avoid overwhelming the server
        const processBatch = async (startIndex) => {
            const batch = tiles.slice(startIndex, startIndex + 6);
            if (batch.length === 0) return;
            await Promise.all(batch.map(url => cacheTile(url)));
            if (startIndex + 6 < tiles.length) {
                await processBatch(startIndex + 6);
            }
        };

        processBatch(0);
    }
});
