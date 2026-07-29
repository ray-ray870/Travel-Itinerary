/* ツアー進行管理アプリ オフライン用サービスワーカー
   - アプリ本体とアイコンを端末に保存し、圏外でも起動できるようにします
   - index.html は「通信優先・失敗したら保存版」なので、更新後は自動で新しい版になります
   - キャッシュ名の版数を上げると、古い保存分は自動で削除されます                     */
const CACHE = 'tour-itinerary-v1';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 1つ失敗しても全体が止まらないよう、個別に取得します
    await Promise.all(ASSETS.map(async (url) => {
      try { await cache.add(new Request(url, {cache: 'reload'})); }
      catch (err) { /* 取得できないものは飛ばす */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE ? caches.delete(k) : null)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = (url.origin === self.location.origin);

  // ページ本体：通信優先。失敗したら保存版で起動（＝圏外でも開ける）
  if (req.mode === 'navigate' || (sameOrigin && url.pathname.endsWith('index.html'))) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (err) {
        const cached = await caches.match('./index.html') || await caches.match('./');
        if (cached) return cached;
        return new Response(
          '<meta charset="utf-8"><p style="font-family:sans-serif;padding:24px">オフラインのため表示できません。一度オンラインで開いてください。</p>',
          {headers: {'Content-Type': 'text/html; charset=utf-8'}}
        );
      }
    })());
    return;
  }

  // アイコンなどの自サイト内ファイル：保存版優先（速い・オフラインでも表示）
  if (sameOrigin) {
    e.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.status === 200) {
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch (err) {
        return new Response('', {status: 504});
      }
    })());
    return;
  }

  // 外部（Googleフォントなど）：取れたら保存し、圏外では保存版を使う
  e.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh && (fresh.status === 200 || fresh.type === 'opaque')) {
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (err) {
      const cached = await caches.match(req);
      if (cached) return cached;
      return new Response('', {status: 504});
    }
  })());
});
