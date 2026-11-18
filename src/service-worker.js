const PREFIX = `trama-qda-${encodeURIComponent(self.registration.scope)}-`;
const CACHE = `${PREFIX}__TRAMA_CACHE_VERSION__`;
const FILES = __TRAMA_PRECACHE__;
const urls = FILES.map(path => new URL(path, self.registration.scope).href);
const index = new URL('index.html', self.registration.scope).href;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(urls)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)))));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  if (request.mode === 'navigate' && (url.pathname === scope.pathname || url.pathname === new URL(index).pathname)) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(index)).then(response => response || fetch(request)));
  } else if (urls.includes(url.href)) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(request)).then(response => response || fetch(request)));
  }
});
