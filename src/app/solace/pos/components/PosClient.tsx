'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ShoppingBag, ListOrdered, ClipboardCheck, Loader2, Receipt, Store, PlayCircle, CircleDot } from 'lucide-react';
import { getCurrentUser } from '@/lib/authStore';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import type { UserModulePermissions } from '@/lib/modules';
import { formatVND } from '@/lib/format';
import { api } from '../../quan-ly/lib/solaceApi';
import PosOrder from './PosOrder';
import OrderQueue from './OrderQueue';
import OrderHistoryTab from '../../quan-ly/components/OrderHistoryTab';
import ShiftCloseModal from './ShiftCloseModal';
import OpenShiftModal from './OpenShiftModal';

interface ActiveShift { id: string; shift_label?: string | null; opened_by_name?: string | null; opened_at: string; opening_float: number; }

type View = 'order' | 'queue' | 'history';

export default function PosClient({ embedded }: { embedded?: boolean } = {}) {
  const [perms, setPerms] = useState<UserModulePermissions | undefined>();
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('order');
  const [showClose, setShowClose] = useState(false);
  const [showOpen, setShowOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [stats, setStats] = useState<{ total_orders: number; total_revenue: number; unpaid_total: number } | null>(null);
  const [shift, setShift] = useState<ActiveShift | null>(null);

  useEffect(() => {
    const u = getCurrentUser() as { role?: string; module_permissions?: UserModulePermissions } | null;
    setPerms(u?.module_permissions); setRole(u?.role ?? ''); setLoading(false);
  }, []);

  // Thống kê nhanh hôm nay + trạng thái ca (tải lại khi có đơn mới / đóng modal).
  useEffect(() => {
    api.get<{ data: { summary: { total_orders: number; total_revenue: number; unpaid_total: number }; activeShift: ActiveShift | null } }>('/api/solace/shift-close')
      .then(r => { setStats(r.data.summary); setShift(r.data.activeShift); }).catch(() => {});
  }, [reloadKey, showClose, showOpen]);

  const { canAccessInherited } = useUserPermissions(perms);
  const canPos = role === 'super_admin' || canAccessInherited('solace-pos', 'view');

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!canPos) {
    return (
      <div className="flex flex-col items-center py-20 text-muted-foreground">
        <ShoppingBag className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm">Bạn không có quyền bán hàng tại quầy</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {!embedded && (
        <Link href="/solace" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Quán Solace
        </Link>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-700 text-foreground">Bán Hàng (POS)</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Tạo đơn, thu tiền, theo dõi hàng đợi & kết ca</p>
        </div>
        <div className="flex items-center gap-2">
          {!embedded && (
            <Link href="/solace-pos"
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-600 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10">
              <Store className="h-4 w-4" /> Chuyển đến trang Quán Solace
            </Link>
          )}
          {stats && (
            <div className="flex items-center gap-3 rounded-xl border border-white/5 px-3 py-2 text-xs" style={{ background: 'var(--card)' }}>
              <span className="text-muted-foreground">Hôm nay: <span className="text-foreground font-600">{stats.total_orders}</span> đơn</span>
              <span className="text-muted-foreground">Thu: <span className="text-emerald-400 font-600">{formatVND(stats.total_revenue)}</span></span>
              {stats.unpaid_total > 0 && <span className="text-amber-400">Nợ: {formatVND(stats.unpaid_total)}</span>}
            </div>
          )}
          {shift ? (
            <span className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-600 border border-emerald-500/30 text-emerald-400" title={`Quỹ đầu ca: ${formatVND(shift.opening_float)}`}>
              <CircleDot className="h-3.5 w-3.5 animate-pulse" /> {shift.shift_label || 'Ca đang mở'}{shift.opened_by_name ? ` · ${shift.opened_by_name}` : ''}
            </span>
          ) : (
            <button onClick={() => setShowOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-600 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">
              <PlayCircle className="h-4 w-4" /> Mở ca
            </button>
          )}
          <button onClick={() => setShowClose(true)}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-600 border border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
            <ClipboardCheck className="h-4 w-4" /> Kết ca
          </button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-white/10">
        <button onClick={() => setView('order')}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm font-500 border-b-2 transition-colors ${view === 'order' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          <ShoppingBag className="h-4 w-4" /> Bán hàng
        </button>
        <button onClick={() => setView('queue')}
          className={`relative flex items-center gap-1.5 px-3 py-2 text-sm font-500 border-b-2 transition-colors ${view === 'queue' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          <ListOrdered className="h-4 w-4" /> Hàng đợi đơn
          {activeCount > 0 && <span className="ml-0.5 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-2xs font-700 bg-indigo-600 text-white">{activeCount}</span>}
        </button>
        <button onClick={() => setView('history')}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm font-500 border-b-2 transition-colors whitespace-nowrap ${view === 'history' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          <Receipt className="h-4 w-4" /> Lịch sử
        </button>
      </div>

      {/* Giữ cả 2 view mounted: Hàng đợi luôn chạy nền → nghe chuông + badge ngay cả khi đang bán. */}
      <div className={view === 'order' ? '' : 'hidden'}>
        <PosOrder onCreated={() => setReloadKey(k => k + 1)} />
      </div>
      <div className={view === 'queue' ? '' : 'hidden'}>
        <OrderQueue reloadKey={reloadKey} canDelete={role === 'super_admin'} onActiveCountChange={setActiveCount} />
      </div>
      {/* Lịch sử: mount khi mở (tự tải theo ngày). */}
      {view === 'history' && <OrderHistoryTab />}

      {showOpen && <OpenShiftModal onClose={() => setShowOpen(false)} onOpened={() => setShowOpen(false)} />}
      {showClose && <ShiftCloseModal onClose={() => setShowClose(false)} />}
    </div>
  );
}
