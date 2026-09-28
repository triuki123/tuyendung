'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import AppLayout from '@/components/AppLayout';

export default function TraCuuLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Routes dưới /tra-cuu/du-lieu-cong highlight nav-cham-cong thay vì nav-tra-cuu
  const activePath = pathname.startsWith('/tra-cuu/du-lieu-cong')
    ? '/tra-cuu/du-lieu-cong'
    : '/tra-cuu';

  return (
    <AppLayout activePath={activePath}>
      {children}
    </AppLayout>
  );
}
