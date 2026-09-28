'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Package, Users, Ticket, ClipboardList, CheckSquare, DoorOpen, ArrowUpRight, Loader2,
} from 'lucide-react';
import ErrorState from '@/components/ui/ErrorState';

interface DashboardOverview {
  assets: { total: number; warnings: number };
  headcount: number;
  ticketsOpen: number;
  tasksOpen: number;
  approvalsPending: number;
  roomsPending: number;
  recruitmentPending: number;
}

interface Kpi {
  key: string;
  label: string;
  value: number;
  sub: string;
  href: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  alert?: boolean;
}

/**
 * Dải KPI ĐA LĨNH VỰC cho "Trung tâm điều hành" — mỗi thẻ là một cổng nhảy vào module.
 * Cố tình KHÔNG đi sâu vào tài sản (phần đó nằm ở Dashboard module Quản Lý Tài Sản).
 */
export default function CommandCenterMetrics() {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    const stored = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    let role = '', id = '';
    if (stored) {
      try { const u = JSON.parse(stored); role = u.role ?? ''; id = u.id ?? ''; } catch { /* empty */ }
    }
    try {
      const res = await fetch('/api/dashboard/overview', {
        headers: { 'x-current-user-role': role, 'x-current-user-id': id },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) setData(json.overview);
      else throw new Error('Phản hồi không hợp lệ');
    } catch (e) {
      console.error('Error loading command center metrics:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const kpis: Kpi[] = data ? [
    {
      key: 'assets', label: 'Tổng Tài Sản', value: data.assets.total,
      sub: data.assets.warnings > 0 ? `${data.assets.warnings} cảnh báo sắp hết hạn` : 'Không có cảnh báo',
      href: '/asset-management', icon: <Package size={20} />,
      iconBg: 'bg-indigo-500/15', iconColor: 'text-indigo-400', alert: data.assets.warnings > 0,
    },
    {
      key: 'hr', label: 'Nhân Sự', value: data.headcount, sub: 'Đang làm việc',
      href: '/nguon-nhan-luc', icon: <Users size={20} />,
      iconBg: 'bg-emerald-500/15', iconColor: 'text-emerald-400',
    },
    {
      key: 'tickets', label: 'Ticket Đang Mở', value: data.ticketsOpen,
      sub: data.ticketsOpen > 0 ? 'Cần xử lý' : 'Đã xử lý hết',
      href: '/tickets', icon: <Ticket size={20} />,
      iconBg: 'bg-red-500/15', iconColor: 'text-red-400', alert: data.ticketsOpen > 0,
    },
    {
      key: 'tasks', label: 'Công Việc', value: data.tasksOpen, sub: 'Đang thực hiện',
      href: '/tasks', icon: <ClipboardList size={20} />,
      iconBg: 'bg-violet-500/15', iconColor: 'text-violet-400',
    },
    {
      key: 'approvals', label: 'Chờ Duyệt', value: data.approvalsPending,
      sub: data.approvalsPending > 0 ? 'Yêu cầu cần phê duyệt' : 'Không có yêu cầu',
      href: '/duyet-yeu-cau', icon: <CheckSquare size={20} />,
      iconBg: 'bg-amber-500/15', iconColor: 'text-amber-400', alert: data.approvalsPending > 0,
    },
    {
      key: 'rooms', label: 'Phòng Họp', value: data.roomsPending, sub: 'Đặt phòng chờ duyệt',
      href: '/room-bookings', icon: <DoorOpen size={20} />,
      iconBg: 'bg-teal-500/15', iconColor: 'text-teal-400',
    },
  ] : [];

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="rounded-2xl p-3 sm:p-4 border border-line-subtle h-24 sm:h-28 animate-pulse" style={{ background: 'var(--card)' }} />
        ))}
      </div>
    );
  }

  if (error) {
    return <ErrorState onRetry={load} />;
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-4">
      {kpis.map(k => (
        <Link
          key={k.key}
          href={k.href}
          className={`group rounded-2xl p-3 sm:p-4 border metric-card-hover transition-colors ${
            k.alert ? 'border-amber-500/25' : 'border-line-subtle'
          }`}
          style={{ background: 'var(--card)' }}
        >
          <div className="flex items-start justify-between mb-2 sm:mb-3">
            <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center ${k.iconBg} shrink-0`}>
              <span className={k.iconColor}>{k.icon}</span>
            </div>
            <ArrowUpRight size={15} className="text-muted-foreground/40 group-hover:text-foreground transition-colors" />
          </div>
          <p className="text-xl sm:text-2xl font-700 tabular-nums text-foreground">{k.value.toLocaleString('vi-VN')}</p>
          <p className="text-xs font-500 text-muted-foreground mt-0.5">{k.label}</p>
          <p className={`text-2xs mt-1 truncate ${k.alert ? 'text-amber-400/80' : 'text-muted-foreground/60'}`}>{k.sub}</p>
        </Link>
      ))}
    </div>
  );
}
