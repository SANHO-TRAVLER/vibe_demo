'use strict';
// 인터넷이 없어도 열리도록 한 번 받은 파일을 보관한다.
// 먼저 새 파일을 받아 보고, 실패하면 보관본을 쓴다. 그래서 고친 내용이 바로 반영된다.
const CACHE = 'taktak-v3';
const SHELL = [
  './', 'index.html', 'style.css', 'dingbats.js', 'engine.js', 'app.js',
  'fonts/UnTaza.woff2', 'fonts/Galmuri11.woff2', 'fonts/Galmuri14.woff2', 'icons/icon-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const ours = url.origin === location.origin;
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!ours && !fonts) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        if (res.ok || res.type === 'opaque') caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request)),
  );
});
