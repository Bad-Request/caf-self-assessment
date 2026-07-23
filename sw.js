// Service worker for the CAF Self-Assessment Tool.
//
// This app has no build step, so the cache list below is hand-maintained —
// add new assets/js/*.js files here when they're added to the app, and add
// a comment note to AGENTS.md if that checklist needs it too.
//
// CACHE_VERSION must be bumped (any string change is enough) whenever any
// cached file's contents change, so returning visitors pick up the update
// instead of being stuck on a stale offline copy.
const CACHE_VERSION = 'v2.3.1';
const CACHE_NAME = 'caf-shell-' + CACHE_VERSION;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/style.css',
  './assets/data.js',
  './assets/js/app.js',
  './assets/js/assessments.js',
  './assets/js/baselines.js',
  './assets/js/dashboard.js',
  './assets/js/dom.js',
  './assets/js/download.js',
  './assets/js/framework.js',
  './assets/js/model.js',
  './assets/js/storage.js',
  './assets/js/ui-shell.js',
  './assets/js/utils.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-192.png',
  './assets/icons/icon-maskable-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(APP_SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (names) {
        return Promise.all(
          names
            .filter(function (name) { return name !== CACHE_NAME; })
            .map(function (name) { return caches.delete(name); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

// Navigations: try the network first so visitors online get the latest
// build, falling back to the cached shell when offline. Everything else
// (CSS/JS/icons): cache-first, since these are content-hashed-by-release
// static files that only change when CACHE_VERSION bumps anyway.
self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(function () {
        return caches.match('./index.html');
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (response.ok) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      });
    })
  );
});
