'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertCircle, ListChecks, Users, BellRing } from 'lucide-react';
import LeaveTypesTab from './LeaveTypesTab';
import BalancesTab from './BalancesTab';
import ConfigReminderRecipientLens from '@/components/config/ConfigReminderRecipientLens';

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

export default function CauHinhPhepClient() {
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<string | null>(null);
  const [tab, setTab] = useState<'types' | 'balances' | 'reminders'>('types');

  useEffect(() => {
    const u = readCurrentUser();
    setUserId(u?.id ?? '');
    setRole(u?.role ?? 'user');
  }, []);

  if (role === null) return null;

  const isAdmin = role === 'super_admin' || role === 'admin';
  if (!isAdmin) {
    return (
      <div className="animate-fadeIn">
        <Link
          href="/tra-cuu/du-lieu-cong/nghi-phep"
          className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Nghỉ Phép
        </Link>
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <AlertCircle className="mb-3 h-10 w-10 opacity-30" />
          <p className="text-sm">Trang này chỉ dành cho Admin</p>
        </div>
      </div>
    );
  }

  const TABS = [
    { v: 'types' as const, label: 'Loại Phép', icon: ListChecks },
    { v: 'balances' as const, label: 'Quỹ Phép Nhân Sự', icon: Users },
    { v: 'reminders' as const, label: 'Nhắc Nhở', icon: BellRing },
  ];

  return (
    <div className="space-y-5 sm:space-y-6 animate-fadeIn">
      <Link
        href="/tra-cuu/du-lieu-cong/nghi-phep"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Nghỉ Phép
      </Link>

      <div>
        <h1 className="text-xl sm:text-2xl font-700 text-foreground">Cấu Hình Nghỉ Phép</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Loại nghỉ phép và quỹ phép của nhân sự. Chính sách phép năm được quản lý tại Quy tắc chấm công.
        </p>
      </div>

      <div className="flex gap-2 border-b border-line overflow-x-auto">
        {TABS.map(({ v, label, icon: Icon }) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`flex items-center gap-2 whitespace-nowrap px-4 py-2.5 text-sm font-600 transition-colors ${
              tab === v
                ? 'border-b-2 border-teal-500 text-teal-400'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'types' && <LeaveTypesTab userId={userId} role={role} />}
      {tab === 'balances' && <BalancesTab userId={userId} role={role} />}
      {tab === 'reminders' && (
        <ConfigReminderRecipientLens reminderTypes={['leave_balance']} canEdit={role === 'super_admin'} />
      )}
    </div>
  );
}
