import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/**
 * Layout riêng cho /warehouse: manifest riêng (start_url + scope = /warehouse)
 * để công nhân cài lên điện thoại như 1 app độc lập, không lộ app chính.
 */
export const metadata: Metadata = {
  title: 'Warehouse — Chấm công kho',
  manifest: '/warehouse.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Warehouse' },
  viewport: { width: 'device-width', initialScale: 1, maximumScale: 1, viewportFit: 'cover' },
  themeColor: '#060e1a',
};

export default function WarehouseLayout({ children }: { children: ReactNode }) {
  return children;
}
