'use client';

import AppLayout from '@/components/AppLayout';
import LegalClient from './components/LegalClient';

/**
 * Pháp Chế — pháp lý doanh nghiệp VN: giấy phép & văn bản, lịch tuân thủ,
 * hợp đồng thương mại, ủy quyền + sổ con dấu.
 * RBAC NGHIÊM NGẶT module 'legal' (không bypass super_admin); mô hình TẬP TRUNG —
 * ai có quyền thấy dữ liệu MỌI công ty.
 */
export default function PhapChePage() {
  return (
    <AppLayout activePath="/phap-che">
      <LegalClient />
    </AppLayout>
  );
}
