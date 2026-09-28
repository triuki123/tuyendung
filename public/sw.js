/* FADO AssetFlow — service worker tối thiểu, an toàn cho deploy thường xuyên.
   - Static hashed (_next/static, icon, manifest): cache-first (bất biến theo hash).
   - Điều hướng & phần còn lại: network-first, chỉ fallback cache khi offline.
   - KHÔNG đụng /api/* và SSE (realtime) — luôn để mạng xử lý. */
const CACHE = 'assetflow-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* Web Push: hiển thị thông báo đẩy khi có tin từ server (kể cả lúc app đã đóng). */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Thông báo', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'FADO AssetFlow';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
    tag: data.tag || undefined,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

/* Click vào thông báo đẩy → mở/đưa lên trước tab đúng URL. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      if ('focus' in client) {
        try { await client.navigate(url); } catch { /* cross-origin an toàn bỏ qua */ }
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname)) return;
  if (url.pathname.startsWith('/api/')) return; // API + SSE: luôn mạng

  const isStatic =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icon') ||
    url.pathname === '/manifest.json';

  if (isStatic) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  event.respondWith((async () => {
    try {
      return await fetch(req);
    } catch {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      return hit || Response.error();
    }
  })());
});
