'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ListChecks, Loader2, CheckCircle2, ArrowRight,
  CheckSquare, Ticket, DoorOpen, FileText, ClipboardCheck, UserPlus, Package,
} from 'lucide-react';
import ErrorState from '@/components/ui/ErrorState';

interface Overview {
  assets: { total: number; warnings: number };
  ticketsOpen: number;
  approvalsPending: number;
  roomsPending: number;
  recruitmentPending: number;
}
interface Badges { contracts: number; evaluations: number; docs: number }

interface Item {
  key: string; label: string; count: number; href: string;
  icon: React.ReactNode; color: string; bg: string;
}

/** "Cần Xử Lý Hôm Nay" — gộp việc cần action từ nhiều module, mỗi dòng bấm nhảy thẳng vào. */
export default function ActionItemsCard() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [bg, setBg] = useState<Badges | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    const stored = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    let role = '', id = '';
    if (stored) { try { const u = JSON.parse(stored); role = u.role ?? ''; id = u.id ?? ''; } catch { /* */ } }
    const h = { 'x-current-user-role': role, 'x-current-user-id': id };
    try {
      const [r1, r2] = await Promise.all([
        fetch('/api/dashboard/overview', { headers: h }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/hr/badge-counts', { headers: h }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      // Cả hai endpoint đều fail → coi như lỗi (tránh hiện "đã xử lý hết" gây hiểu nhầm)
      if (!r1 && !r2) {
        setError(true);
        return;
      }
      if (r1?.success) setOv(r1.overview);
      if (r2?.success) setBg(r2.data ?? r2);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    load();
  }, []);

  const items: Item[] = [
    { key: 'approvals', label: 'Yêu cầu chờ duyệt', count: ov?.approvalsPending ?? 0, href: '/duyet-yeu-cau', icon: <CheckSquare size={15} />, color: 'text-amber-400', bg: 'bg-amber-500/15' },
    { key: 'tickets', label: 'Ticket đang mở', count: ov?.ticketsOpen ?? 0, href: '/tickets', icon: <Ticket size={15} />, color: 'text-red-400', bg: 'bg-red-500/15' },
    { key: 'contracts', label: 'Hợp đồng sắp hết hạn', count: bg?.contracts ?? 0, href: '/nhan-su', icon: <FileText size={15} />, color: 'text-orange-400', bg: 'bg-orange-500/15' },
    { key: 'evaluations', label: 'Đánh giá đến hạn', count: bg?.evaluations ?? 0, href: '/nhan-su', icon: <ClipboardCheck size={15} />, color: 'text-violet-400', bg: 'bg-violet-500/15' },
    { key: 'rooms', label: 'Đặt phòng chờ duyệt', count: ov?.roomsPending ?? 0, href: '/room-bookings', icon: <DoorOpen size={15} />, color: 'text-teal-400', bg: 'bg-teal-500/15' },
    { key: 'recruitment', label: 'Yêu cầu tuyển dụng chờ', count: ov?.recruitmentPending ?? 0, href: '/nguon-nhan-luc/yeu-cau-tuyen-dung', icon: <UserPlus size={15} />, color: 'text-indigo-400', bg: 'bg-indigo-500/15' },
    { key: 'assets', label: 'Tài sản sắp hết hạn', count: ov?.assets.warnings ?? 0, href: '/asset-management', icon: <Package size={15} />, color: 'text-sky-400', bg: 'bg-sky-500/15' },
  ];
  const active = items.filter(i => i.count > 0);
  const totalToDo = active.reduce((a, i) => a + i.count, 0);

  return (
    <div className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
      <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-line-subtle">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-rose-500/15 shrink-0">
            <ListChecks size={16} className="text-rose-400" />
          </div>
          <div>
            <h3 className="text-base font-600 text-foreground leading-tight">Cần Xử Lý Hôm Nay</h3>
            <p className="text-2xs text-muted-foreground">{loading ? 'Đang tải…' : totalToDo > 0 ? `${totalToDo} việc cần action` : 'Tất cả đã xử lý'}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <ErrorState onRetry={load} />
      ) : active.length === 0 ? (
        <div className="flex flex-col items-center py-10 text-muted-foreground">
          <CheckCircle2 className="h-9 w-9 mb-2.5 text-emerald-400/60" />
          <p className="text-sm">Không có việc cần xử lý 🎉</p>
          <p className="text-2xs mt-1 opacity-60">Mọi yêu cầu, ticket, hồ sơ đều đã được xử lý</p>
        </div>
      ) : (
        <div className="divide-y divide-line-subtle">
          {active.map(i => (
            <Link key={i.key} href={i.href} className="flex items-center gap-3 px-4 sm:px-5 py-2.5 hover:bg-white/[0.04] transition-colors group">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${i.bg}`}>
                <span className={i.color}>{i.icon}</span>
              </div>
              <span className="flex-1 text-sm text-foreground">{i.label}</span>
              <span className={`text-sm font-700 tabular-nums ${i.color}`}>{i.count}</span>
              <ArrowRight size={14} className="text-muted-foreground/40 group-hover:text-foreground transition-colors" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
