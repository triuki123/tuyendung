'use client';

import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import ConfigReminderRecipientLens from '@/components/config/ConfigReminderRecipientLens';
import AssetCategoriesManager from './AssetCategoriesManager';
import AssetWarrantyPeriodsManager from './AssetWarrantyPeriodsManager';

function readRole(): string | null {
  try {
    const raw = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (!raw) return 'user';
    return JSON.parse(raw).role ?? 'user';
  } catch { return 'user'; }
}

export default function AssetConfigClient() {
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => { setRole(readRole()); }, []);

  if (role === null) return null;
  const isAdmin = role === 'super_admin' || role === 'admin';

  return (
    <div className="space-y-5 sm:space-y-6 animate-fadeIn">
      <div>
        <h1 className="text-xl sm:text-2xl font-700 text-foreground">Cấu Hình Tài Sản</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Danh mục loại tài sản, thời hạn bảo hành và mốc nhắc bảo trì / bảo hành
        </p>
      </div>

      {!isAdmin ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <AlertCircle className="mb-3 h-10 w-10 opacity-30" />
          <p className="text-sm">Trang này chỉ dành cho Admin</p>
        </div>
      ) : (
        <div className="space-y-5 sm:space-y-6">
          <AssetCategoriesManager canEdit={isAdmin} />

          {/* Thời hạn bảo hành — lưu qua system_settings, chỉ Super Admin sửa (giống mốc nhắc). */}
          <AssetWarrantyPeriodsManager canEdit={role === 'super_admin'} />

          <div>
            <h2 className="text-lg font-700 text-foreground mb-1">Nhắc Nhở Bảo Trì / Bảo Hành</h2>
            <p className="text-xs text-muted-foreground mb-3">Mốc nhắc và người nhận cho tài sản không có người dùng</p>
            <ConfigReminderRecipientLens
              reminderTypes={['asset_maintenance']}
              recipientTypes={['asset_maintenance']}
              canEdit={role === 'super_admin'}
            />
          </div>
        </div>
      )}
    </div>
  );
}
