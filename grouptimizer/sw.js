// Minimal offline shell. Network-first so edits to the app show up immediately;
// the cache is only a fallback when the network is unavailable.
const CACHE = 'grouptimizer-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      c.addAll([
        './',
        'index.html',
        'main.js',
        'getData.js',
        'solver.js',
        'SimulatedAnnealer.js',
        'makeReport.js',
        'makeAttendanceTable.js',
        'statGraph.js',
        'utils.js',
        'manifest.webmanifest',
        'icon-192.png',
        'icon-512.png',
      ])
    )
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const {request} = e;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
        return res;
      })
      .catch(() => caches.match(request).then((r) => r || caches.match('./')))
  );
});
