const CACHE_VERSION = 'brain-survival-nf-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION)
            .map((oldKey) => caches.delete(oldKey)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Skip cross-origin requests (Firebase RTDB, CDN flags, Google Fonts) and dynamic API calls
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.endsWith('/sw.js')) return;

  // Network-First: always attempt live network first so GitHub Push updates reflect immediately;
  // fall back to cache only when offline/network fails.
  event.respondWith(
    fetch(request, { cache: 'no-store' })
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_VERSION).then((cache) => {
            cache.put(request, clone).catch(() => {});
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const fallbackIndex = await caches.match('./index.html');
          if (fallbackIndex) return fallbackIndex;
        }
        return Response.error();
      }),
  );
});
