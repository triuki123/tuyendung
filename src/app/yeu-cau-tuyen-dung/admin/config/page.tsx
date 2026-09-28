'use client';

import AppLayout from '@/components/AppLayout';
import RequisitionConfigClient from './RequisitionConfigClient';

export default function RequisitionConfigPage() {
  return (
    <AppLayout activePath="/yeu-cau-tuyen-dung/admin/config">
      <RequisitionConfigClient />
    </AppLayout>
  );
}
