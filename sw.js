/* Beam service worker: caches the app shell so it opens instantly and can be installed.
   Transfers never touch the cache; they are live WebRTC connections. */
var CACHE = 'beam-shell-v2';
var SHELL = ['./', './index.html', './settings.html', './beam.css', './common.js', './topo.js', './direct.js', './diag.js', './manifest.webmanifest', './icon.svg'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
// Share target: the OS share sheet POSTs files and text here. Park them in a cache and open the app.
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.origin === location.origin && /\/share$/.test(url.pathname)) {
    e.respondWith(e.request.formData().then(function (fd) {
      return caches.open('beam-share').then(function (c) {
        var puts = [];
        fd.getAll('files').forEach(function (f, i) {
          if (f && f.size !== undefined) puts.push(c.put('./share-files/' + encodeURIComponent(f.name || ('shared-' + i)), new Response(f, { headers: { 'Content-Type': f.type || 'application/octet-stream' } })));
        });
        var text = [fd.get('title'), fd.get('text'), fd.get('url')].filter(function (x) { return x && String(x).trim(); }).join('\n');
        if (text) puts.push(c.put('./share-text', new Response(text, { headers: { 'Content-Type': 'text/plain' } })));
        return Promise.all(puts);
      }).then(function () { return Response.redirect('./?share=1', 303); });
    }).catch(function () { return Response.redirect('./', 303); }));
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(function (res) {
    var copy = res.clone();
    caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
    return res;
  }).catch(function () { return caches.match(e.request, { ignoreSearch: true }); }));
});
