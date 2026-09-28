'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import ConfigReminderRecipientLens from '@/components/config/ConfigReminderRecipientLens';

function readRole(): string | null {
  try {
    const raw = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (!raw) return 'user';
    return JSON.parse(raw).role ?? 'user';
  } catch { return 'user'; }
}

export default function RequisitionConfigClient() {
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => { setRole(readRole()); }, []);

  if (role === null) return null;
  const isAdmin = role === 'super_admin' || role === 'admin';

  return (
    <div className="space-y-5 sm:space-y-6 animate-fadeIn">
      <Link href="/yeu-cau-tuyen-dung" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" /> Yêu Cầu Tuyển Dụng
      </Link>

      <div>
        <h1 className="text-xl sm:text-2xl font-700 text-foreground">Cấu Hình Nhắc Nhở Tuyển Dụng</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Mốc nhắc bộ phận tuyển dụng khi yêu cầu sắp tới hạn đóng
        </p>
      </div>

      {!isAdmin ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <AlertCircle className="mb-3 h-10 w-10 opacity-30" />
          <p className="text-sm">Trang này chỉ dành cho Admin</p>
        </div>
      ) : (
        <ConfigReminderRecipientLens
          reminderTypes={['requisition']}
          canEdit={role === 'super_admin'}
        />
      )}
    </div>
  );
}
