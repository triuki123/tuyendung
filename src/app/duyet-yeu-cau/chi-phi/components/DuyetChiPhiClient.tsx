'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Receipt, Loader2, Inbox, Clock3, CheckCircle2, Eye } from 'lucide-react';
import { getCurrentUser } from '@/lib/authStore';
import { formatMoney } from '@/lib/format';
import { useToast } from '@/context/ToastContext';
import ListPagination, { usePagedList } from '@/components/ui/ListPagination';
import ExpenseDetailModal from '@/app/chi-phi/components/ExpenseDetailModal';
import { STATUS_CFG, type ExpenseRow } from '@/app/chi-phi/components/ChiPhiClient';

export default function DuyetChiPhiClient() {
  const toast = useToast();
  const router = useRouter();
  const user = useMemo(() => getCurrentUser() as any, []);

  const [items, setItems] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);
  const { paged, paginationProps } = usePagedList(items, 20);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/expenses?scope=approve', {
        headers: {
          'x-current-user-id': user?.id || '',
          'x-current-user-role': user?.role || '',
        },
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && Array.isArray(j?.data)) setItems(j.data);
      else if (!r.ok) toast.error(j?.error || 'Không tải được danh sách');
    } catch {
      toast.error('Lỗi kết nối');
    } finally {
      setLoading(false);
    }
  }, [toast, user?.id, user?.role]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-5 sm:space-y-6">
      <Link href="/duyet-yeu-cau" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Duyệt Yêu Cầu
      </Link>

      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-700 text-foreground sm:text-2xl">
            <Receipt className="h-6 w-6 text-emerald-400" /> Duyệt Chi Phí
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Các phiếu chi đang đến lượt bạn duyệt. Bạn có thể mở nhanh để xem chi tiết, trao đổi và phê duyệt ngay tại đây.
          </p>
        </div>
        <Link href="/chi-phi?tab=approve" className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-600 text-muted-foreground hover:bg-hover hover:text-foreground">
          <Clock3 size={14} /> Mở trang Chi Phí đầy đủ
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <Inbox className="mb-3 h-10 w-10 opacity-30" />
          <p className="text-sm">Không có phiếu chi nào chờ bạn duyệt.</p>
          <p className="mt-1 text-xs opacity-60">Khi có phiếu đến lượt, chúng sẽ xuất hiện tại đây.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {paged.map((e) => {
            const st = STATUS_CFG[e.status] || STATUS_CFG.draft;
            return (
              <div
                key={e.id}
                className="rounded-2xl border border-white/5 p-4 transition-colors hover:border-emerald-500/40 hover:bg-white/5"
                style={{ background: 'var(--card)' }}
              >
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                  <button type="button" onClick={() => setDetailId(e.id)} className="min-w-0 flex-1 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      {e.code && <span className="font-mono text-xs text-indigo-300">{e.code}</span>}
                      <span className="truncate text-sm font-600 text-foreground">{e.title}</span>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-600 ${st.cls}`}>{st.label}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {e.category_name || 'Chưa phân loại'} · {e.company_name || '—'} · {e.requester_name || '—'}
                    </p>
                  </button>
                  <div className="shrink-0 text-right">
                    <p className="tabular-nums text-base font-800 text-foreground">{formatMoney(Number(e.amount), e.currency)}</p>
                    <p className="text-2xs text-muted-foreground">{new Date(e.created_at).toLocaleDateString('vi-VN')}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setDetailId(e.id)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-600 text-foreground hover:bg-hover"
                  >
                    <Eye size={14} /> Xem chi phí
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailId(e.id)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-600 text-white hover:bg-emerald-500"
                  >
                    <CheckCircle2 size={14} /> Duyệt
                  </button>
                </div>
              </div>
            );
          })}
          <ListPagination {...paginationProps} />
        </div>
      )}

      {detailId && (
        <ExpenseDetailModal
          expenseId={detailId}
          currentUserId={user?.id || ''}
          canDeleteExpense={canDeleteExpense(user)}
          onClose={() => setDetailId(null)}
          onChanged={() => void load()}
          onEdit={(id) => router.push(`/chi-phi?open=${id}`)}
          onOpenExpense={(id) => setDetailId(id)}
          onSettle={() => router.push('/chi-phi')}
        />
      )}
    </div>
  );
}

function canDeleteExpense(user: any): boolean {
  return user?.role === 'super_admin' || (Array.isArray(user?.module_permissions?.expense) && user.module_permissions.expense.includes('delete'));
}
