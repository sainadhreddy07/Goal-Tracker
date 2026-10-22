// Day Tracker — Service Worker
const CACHE_NAME = 'daytracker-v2';
const CDN_CACHE  = 'daytracker-cdn-v2';

// App shell — files to pre-cache on install
const SHELL = [
  './',
  './app.html',
  './manifest.json',
];

// ── Install: pre-cache shell ──
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      // addAll fails the whole install if any file 404s.
      // Use individual adds so a missing file doesn't break everything.
      return Promise.allSettled(
        SHELL.map(function(url) {
          return cache.add(url).catch(function(e) {
            console.warn('[SW] Failed to cache:', url, e);
          });
        })
      );
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// ── Activate: delete old caches ──
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) {
          return k !== CACHE_NAME && k !== CDN_CACHE;
        }).map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

// ── Fetch ──
self.addEventListener('fetch', function(event) {
  const url = new URL(event.request.url);

  // CDN (Chart.js) — cache on first use
  if (url.hostname === 'cdnjs.cloudflare.com') {
    event.respondWith(
      caches.open(CDN_CACHE).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          if (cached) return cached;
          return fetch(event.request).then(function(res) {
            if (res.ok) cache.put(event.request, res.clone());
            return res;
          }).catch(function() { return cached; });
        });
      })
    );
    return;
  }

  // Navigation (HTML page) — stale-while-revalidate
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          const fetchPromise = fetch(event.request).then(function(res) {
            if (res.ok) cache.put(event.request, res.clone());
            return res;
          }).catch(function() { return null; });
          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  // Everything else — network first, cache fallback
  event.respondWith(
    fetch(event.request).catch(function() {
      return caches.match(event.request);
    })
  );
});

// ── Message: force update ──
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
