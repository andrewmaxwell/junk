// Cache version. Bumping it retires every previous cache on the next activate,
// which is the whole update mechanism: no cache entry ever has to be reasoned
// about across versions.
const VERSION = 'walk-comfort-v6';
const SHELL_CACHE = `${VERSION}-shell`;
const DATA_CACHE = `${VERSION}-data`;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './js/app.js',
  './js/weather.js',
  './js/comfort.js',
  './js/thermal.js',
  './js/chart.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Weather is worth showing stale when there is no network, but never worth
// preferring stale when there is one.
const DATA_HOSTS = [
  'api.open-meteo.com',
  'air-quality-api.open-meteo.com',
  'ensemble-api.open-meteo.com',
  'archive-api.open-meteo.com',
  'geocoding-api.open-meteo.com',
  'api.bigdatacloud.net',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // Individually, so one 404 in the list cannot fail the whole install.
      .then((cache) => Promise.allSettled(SHELL.map((path) => cache.add(path))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

// Serve immediately from cache and refresh in the background, so a launch is
// instant and the next launch is current.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached ?? network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (DATA_HOSTS.includes(url.hostname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  // A navigation that misses the cache and the network still has to render
  // something, and the shell is the only thing it can be.
  if (request.mode === 'navigate') {
    event.respondWith(staleWhileRevalidate(request).catch(() => caches.match('./index.html')));
    return;
  }

  if (url.origin === self.location.origin || url.hostname.endsWith('gstatic.com') || url.hostname.endsWith('googleapis.com')) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
