import React from 'react';
import type { Metadata } from 'next';
import '../styles/tailwind.css';
import { NotificationProvider } from '@/context/NotificationContext';
import { ToastProvider } from '@/context/ToastContext';
import { ConfirmProvider } from '@/context/ConfirmContext';
import { PreferencesProvider } from '@/context/PreferencesContext';
import { AttendanceRealtimeProvider } from '@/context/AttendanceRealtimeContext';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import ChunkErrorReloader from '@/components/ChunkErrorReloader';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://assetflow.fadoai.com';
const SITE_TITLE = 'FADO AssetFlow - Nền tảng vận hành doanh nghiệp tối ưu & thông minh';
const SITE_DESC = 'Hệ thống tích hợp cho phép các tổ chức quản lý hiệu quả tài sản, cấu trúc nhân sự, phân công công việc, yêu cầu hỗ trợ và các quy trình hành chính từ một nền tảng duy nhất.';

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: SITE_TITLE,
  description: SITE_DESC,
  manifest: '/manifest.json',
  // PWA: cài được, chạy toàn màn như app, hỗ trợ notch (safe-area).
  themeColor: '#060e1a',
  viewport: { width: 'device-width', initialScale: 1, maximumScale: 5, viewportFit: 'cover' },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AssetFlow',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', type: 'image/x-icon' },
    ],
    apple: '/apple-touch-icon.png',
  },
  // Preview khi chia sẻ link. Ảnh: public/og-image.png (1200×630). Thay file này là tự cập nhật.
  openGraph: {
    type: 'website',
    siteName: 'FADO AssetFlow',
    title: SITE_TITLE,
    description: SITE_DESC,
    url: APP_URL,
    locale: 'vi_VN',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: SITE_TITLE }],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESC,
    images: ['/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const recruitmentFocus = process.env.NEXT_PUBLIC_RECRUITMENT_FOCUS === 'true';
  return (
    <html lang="vi" className="light" suppressHydrationWarning>
      <head>
        {process.env.NODE_ENV === 'development' && (
          <script dangerouslySetInnerHTML={{ __html: `
            (async function () {
              if (!('serviceWorker' in navigator)) return;
              var controlled = navigator.serviceWorker.controller;
              var registrations = await navigator.serviceWorker.getRegistrations();
              var own = registrations.filter(function (registration) {
                return [registration.active, registration.waiting, registration.installing].some(function (worker) {
                  return worker && new URL(worker.scriptURL).pathname === '/sw.js';
                });
              });
              await Promise.all(own.map(function (registration) { return registration.unregister(); }));
              var keys = await caches.keys();
              await Promise.all(keys.filter(function (key) { return key.startsWith('assetflow-'); }).map(function (key) { return caches.delete(key); }));
              if (controlled && own.length && !sessionStorage.getItem('local_sw_cleaned')) {
                sessionStorage.setItem('local_sw_cleaned', '1');
                location.reload();
              }
            })().catch(function () {});
          ` }} />
        )}
        {/* Chống nháy theme: chỉ khi cờ light BẬT mới áp .light trước khi vẽ.
            Prod tắt cờ ⇒ không emit script ⇒ luôn dark, shim nằm im. */}
        {process.env.NEXT_PUBLIC_ENABLE_LIGHT_THEME === 'true' && (
          <script
            dangerouslySetInnerHTML={{
              __html:
                "(function(){try{var t=localStorage.getItem('assetflow_theme');var l=t==='light'||(t==='auto'&&window.matchMedia('(prefers-color-scheme: light)').matches);if(l)document.documentElement.classList.add('light');}catch(e){}})();",
            }}
          />
        )}
      </head>
      <body suppressHydrationWarning>
        <ServiceWorkerRegister />
        <ChunkErrorReloader />
        <PreferencesProvider>
          <ToastProvider>
            <ConfirmProvider>
              <NotificationProvider>
                {recruitmentFocus ? children : (
                  <AttendanceRealtimeProvider>{children}</AttendanceRealtimeProvider>
                )}
              </NotificationProvider>
            </ConfirmProvider>
          </ToastProvider>
        </PreferencesProvider>
      </body>
    </html>
  );
}
