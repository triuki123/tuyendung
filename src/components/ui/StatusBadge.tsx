import React from 'react';
import { AssetStatus } from '@/lib/mockData';

const STATUS_CONFIG: Record<AssetStatus, { label: string; className: string }> = {
  available: { label: 'Sẵn sàng', className: 'status-available' },
  assigned: { label: 'Đang dùng', className: 'status-assigned' },
  maintenance: { label: 'Bảo trì', className: 'status-maintenance' },
  broken: { label: 'Hỏng', className: 'status-broken' },
  retired: { label: 'Thanh lý', className: 'status-retired' },
  // Dòng chảy Chi Phí (mua tài sản): treo từ phiếu chi → nhận hàng mới Sẵn sàng.
  cho_mua: { label: 'Chờ mua', className: 'status-maintenance' },
  dang_mua: { label: 'Đang mua', className: 'status-assigned' },
};

/** Status lạ (dữ liệu cũ/tương lai) → fallback, KHÔNG crash. */
const FALLBACK = { label: 'Khác', className: 'status-retired' };

interface StatusBadgeProps {
  status: AssetStatus;
  size?: 'sm' | 'md';
}

export default function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] || FALLBACK;
  const sizeClass = size === 'sm' ? 'text-2xs px-2 py-0.5' : 'text-xs px-2.5 py-1';

  return (
    <span className={`inline-flex items-center rounded-full font-600 ${config.className} ${sizeClass}`}>
      <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-current opacity-70" />
      {config.label}
    </span>
  );
}