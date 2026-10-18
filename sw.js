/* Kelma — service worker (hors ligne). Aucun serveur : simple cache du navigateur.
   Change VERSION à chaque mise à jour du fichier HTML pour forcer le rafraîchissement. */
const VERSION = 'kelma-pop-9';
const SHELL = ['./', './index.html', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
const RUNTIME_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c =>
    Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => null)))
  ).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  /* Page HTML : réseau d'abord (pour recevoir les mises à jour), cache si hors ligne */
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); return r; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
    return;
  }
  /* Audio : Safari/iOS demande des plages d'octets (Range). On répond en 206 depuis le fichier complet en cache. */
  if (url.origin === location.origin && url.pathname.includes('/audio/') && req.headers.has('range')) {
    e.respondWith((async () => {
      const c = await caches.open(VERSION), key = url.href;
      let full = await c.match(key);
      if (!full) { const r = await fetch(key); if (!r.ok) return r; await c.put(key, r.clone()); full = r; }
      const buf = await full.arrayBuffer(), size = buf.byteLength;
      const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range')) || [];
      let a = m[1] ? +m[1] : 0, b = m[2] ? +m[2] : size - 1;
      if (!m[1] && m[2]) { a = Math.max(0, size - +m[2]); b = size - 1; }
      b = Math.min(b, size - 1);
      if (a > b) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
      return new Response(buf.slice(a, b + 1), { status: 206, headers: {
        'Content-Type': full.headers.get('Content-Type') || 'audio/mp4',
        'Content-Range': 'bytes ' + a + '-' + b + '/' + size, 'Content-Length': String(b - a + 1), 'Accept-Ranges': 'bytes' } });
    })());
    return;
  }
  /* Polices et bibliothèques CDN : cache puis mise à jour en arrière-plan */
  if (url.origin === location.origin || RUNTIME_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.open(VERSION).then(c => c.match(req).then(hit => {
      const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    })));
  }
});
