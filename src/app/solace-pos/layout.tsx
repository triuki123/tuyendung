import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/**
 * Layout riêng cho /solace-pos: override manifest gốc bằng manifest POS
 * (start_url + scope = /solace-pos) → khi cài lên điện thoại từ trang này,
 * app chỉ mở thẳng vào /solace-pos thay vì toàn bộ webapp.
 */
export const metadata: Metadata = {
  title: 'Solace POS — Vận hành quán',
  manifest: '/solace-pos.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Solace POS' },
};

export default function SolacePosLayout({ children }: { children: ReactNode }) {
  return children;
}
