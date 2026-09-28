'use client';

import React from 'react';
import AppLayout from '@/components/AppLayout';

export default function SystemConfigLayout({ children }: { children: React.ReactNode }) {
  return <AppLayout activePath="/cau-hinh-he-thong">{children}</AppLayout>;
}
