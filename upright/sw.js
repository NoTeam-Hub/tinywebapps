/* Upright service worker: lets the installed app open and work offline.
   Pages and scripts: network first, cached copy when offline. Music, fonts and icons: cache first. */
const V = 'upright-v2-1', SHELL = ['./', 'index.html', 'fx.js', 'engine.js', 'export.js', 'store.js', 'auto.js', 'ui.js', 'app.js', 'lib.js', 'whisper.js', 'mp4-muxer.js', 'favicon.svg', 'site.webmanifest', 'fonts/fraunces.woff2', 'fonts/fraunces-i.woff2', 'fonts/instrument.woff2', 'fonts/jbmono.woff2'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('upright-') && k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const r = e.request; if (r.method !== 'GET') return; const u = new URL(r.url); if (u.origin !== location.origin || !u.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  if (r.headers.has('range')) return;
  const cacheFirst = /\/(music|fonts|brand|sample)\//.test(u.pathname);
  if (cacheFirst) { e.respondWith(caches.match(r).then((hit) => hit || fetch(r).then((res) => { if (res.ok) { const c = res.clone(); caches.open(V).then((ca) => ca.put(r, c)); } return res; }))); return; }
  e.respondWith(fetch(r).then((res) => { if (res.ok) { const c = res.clone(); caches.open(V).then((ca) => ca.put(r, c)); } return res; }).catch(() => caches.match(r, { ignoreSearch: true }).then((h) => h || caches.match('index.html'))));
});
