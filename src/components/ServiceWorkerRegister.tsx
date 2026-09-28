'use client';

import { useEffect } from 'react';

/**
 * Đăng ký service worker để PWA cài được + chạy offline cơ bản.
 * CHỈ ở production — tránh can thiệp HMR khi dev.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') {
      // Old production workers can cache the unversioned dev JS URLs forever,
      // producing a blank page after restarting the dev compiler.
      void (async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        const ownWorkers = registrations.filter(registration =>
          [registration.active, registration.waiting, registration.installing]
            .some(worker => worker && new URL(worker.scriptURL).pathname === '/sw.js'),
        );
        await Promise.all(ownWorkers.map(registration => registration.unregister()));
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => key.startsWith('assetflow-')).map(key => caches.delete(key)));
        if (ownWorkers.length && navigator.serviceWorker.controller && !sessionStorage.getItem('local_sw_cleaned')) {
          sessionStorage.setItem('local_sw_cleaned', '1');
          window.location.reload();
        }
      })().catch(() => {});
      return;
    }
    navigator.serviceWorker.register('/sw.js').catch(() => { /* bỏ qua lỗi đăng ký */ });
  }, []);
  return null;
}
