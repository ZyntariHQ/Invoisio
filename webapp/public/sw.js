const CACHE_NAME = 'invoisio-pwa-v1';
const OFFLINE_URL = '/offline.html';
const ASSETS = [
  '/',
  OFFLINE_URL,
  '/assest/invoisio_logo.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-HTTP(S) schemes (e.g., chrome-extension:, data:, file:)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return; // Do not attempt caching or intercepting
  }

  // Bypass Next.js internals/HMR and RSC endpoints to avoid dev breakage
  if (url.pathname.startsWith('/_next/')) {
    return; // Let network handle framework assets
  }

  // Navigation requests: network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // Only cache GET requests
  if (request.method !== 'GET') {
    return; // pass-through
  }

  // Static assets and regular GETs: cache-first, then network and cache
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        const copy = response.clone();
        // Only cache successful, safe responses
        if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, copy).catch(() => {});
          });
        }
        return response;
      }).catch(() => cached);
    })
  );
});