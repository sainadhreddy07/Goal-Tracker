// Day Tracker — Service Worker
// Strategy: cache-first for the app shell, network-first for CDN assets

const CACHE_NAME = 'daytracker-v1';
const CACHE_VERSION = 1;

// App shell — what to pre-cache on install
const SHELL = [
  './',
  './dayops.html',
  './manifest.json',
];

// CDN assets cached on first fetch (Chart.js)
const CDN_CACHE = 'daytracker-cdn-v1';

// ── Install: pre-cache app shell ──
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(SHELL);
    }).then(function() {
      return self.skipWaiting(); // activate immediately
    })
  );
});

// ── Activate: clean up old caches ──
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) {
          return key !== CACHE_NAME && key !== CDN_CACHE;
        }).map(function(key) {
          return caches.delete(key);
        })
      );
    }).then(function() {
      return self.clients.claim(); // take control immediately
    })
  );
});

// ── Fetch: serve from cache, fall back to network ──
self.addEventListener('fetch', function(event) {
  const url = new URL(event.request.url);

  // CDN requests (Chart.js etc) — cache on first fetch
  if (url.hostname === 'cdnjs.cloudflare.com') {
    event.respondWith(
      caches.open(CDN_CACHE).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          if (cached) return cached;
          return fetch(event.request).then(function(response) {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(function() {
            return cached; // offline fallback — return whatever we have
          });
        });
      })
    );
    return;
  }

  // App shell — cache-first
  if (event.request.mode === 'navigate' || SHELL.some(function(s) { return url.pathname.endsWith(s.replace('./', '')); })) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        // Return cached immediately, but also fetch update in background
        const fetchPromise = fetch(event.request).then(function(response) {
          if (response.ok) {
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, response.clone());
            });
          }
          return response;
        }).catch(function() { return cached; });

        return cached || fetchPromise;
      })
    );
    return;
  }

  // Everything else — network, fall back to cache
  event.respondWith(
    fetch(event.request).catch(function() {
      return caches.match(event.request);
    })
  );
});

// ── Background sync message ──
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
