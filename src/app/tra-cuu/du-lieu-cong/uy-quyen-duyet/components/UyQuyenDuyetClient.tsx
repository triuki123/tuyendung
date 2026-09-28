'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import DelegationsManager from './DelegationsManager';

function readCurrentUser(): { id: string; role: string } | null {
  try {
    const raw = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (!raw) return null;
    const u = JSON.parse(raw);
    return { id: u.id ?? '', role: u.role ?? 'user' };
  } catch {
    return null;
  }
}

export default function UyQuyenDuyetClient() {
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const u = readCurrentUser();
    setUserId(u?.id ?? '');
    setRole(u?.role ?? 'user');
  }, []);

  if (role === null) return null;

  // Chốt hiển thị phía client (server vẫn kiểm vai hiệu lực theo công ty đang chọn).
  const isAdmin = role === 'super_admin' || role === 'admin';
  if (!isAdmin) {
    return (
      <div className="animate-fadeIn">
        <Link
          href="/tra-cuu/du-lieu-cong"
          className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Dữ Liệu Chấm Công
        </Link>
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <AlertCircle className="mb-3 h-10 w-10 opacity-30" />
          <p className="text-sm">Trang này chỉ dành cho Admin</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6 animate-fadeIn">
      <Link
        href="/tra-cuu/du-lieu-cong"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Dữ Liệu Chấm Công
      </Link>

      <div>
        <h1 className="text-xl sm:text-2xl font-700 text-foreground">Ủy Quyền Duyệt Công</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Giao quyền duyệt Nghỉ Phép · Bù Công · Tăng Ca cho người ngoài nhánh sơ đồ tổ chức
        </p>
      </div>

      <DelegationsManager userId={userId} role={role} />
    </div>
  );
}
