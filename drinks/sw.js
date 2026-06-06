const CACHE_NAME = 'barista-bot-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './index.css',
  './main.js',
  './menu.js',
  './order.js',
  './formatter.js',
  './router.js',
  './ui.js',
  './manifest.json',
  './app_icon.png',
  './image.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Cache-first for same-origin assets; network-first for everything else (e.g. Google Fonts)
  if (new URL(event.request.url).origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request)),
    );
  } else {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request)),
    );
  }
});
