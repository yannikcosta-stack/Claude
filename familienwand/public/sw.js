/* Service Worker: App-Hülle offline verfügbar, letzte Termine als Rückfall.
   (skipWaiting/clients.claim wie bei momo: neue Versionen greifen sofort.) */
var VERSION = 'fw-v1';
var SHELL = ['/', '/wall', '/app.css', '/app.js', '/parse.js', '/fonts/lexend-latin.woff2', '/fonts/baloo2-latin.woff2', '/icons/icon.svg', '/icons/icon-192.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function offlineCopy(res) {
  return res.blob().then(function (body) {
    var h = new Headers(res.headers); h.set('x-fw-offline', '1');
    return new Response(body, { status: res.status, statusText: res.statusText, headers: h });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname === '/api/stream') return;
  if (url.pathname.indexOf('/api/') === 0) {
    // Netzwerk zuerst, sonst letzter Stand
    e.respondWith(fetch(req).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) { return hit ? offlineCopy(hit) : new Response('{"error":"Offline"}', { status: 503, headers: { 'content-type': 'application/json' } }); });
    }));
    return;
  }
  // App-Hülle: Netzwerk zuerst (immer aktuell), Cache als Rückfall
  var key = url.pathname === '/wall' || url.pathname === '/wall/' ? '/wall' : (url.pathname === '/' ? '/' : url.pathname);
  e.respondWith(fetch(req).then(function (res) {
    if (res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(key, copy); }); }
    return res;
  }).catch(function () { return caches.match(key).then(function (hit) { return hit || caches.match(req); }); }));
});
