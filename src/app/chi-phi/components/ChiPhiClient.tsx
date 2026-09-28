'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Receipt, Plus, Loader2, Clock3, Building2, Settings2, Inbox, Pencil, Send, Trash2, Eye, LayoutDashboard } from 'lucide-react';
import { getCurrentUser } from '@/lib/authStore';
import { formatMoney } from '@/lib/format';
import { useToast } from '@/context/ToastContext';
import ListPagination, { usePagedList } from '@/components/ui/ListPagination';
import ExpenseFormModal from './ExpenseFormModal';
import ExpenseDetailModal from './ExpenseDetailModal';
import ExpenseConfigTab from './ExpenseConfigTab';

// Recharts nặng → chỉ tải khi mở tab Tổng quan (không vào bundle của tab danh sách).
const ExpenseDashboardTab = dynamic(() => import('./ExpenseDashboardTab'), {
  ssr: false,
  loading: () => <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>,
});

export interface ExpenseRow {
  id: string;
  code: string | null;
  title: string;
  amount: number;
  currency?: string | null;
  status: string;
  company_id: string;
  company_name?: string | null;
  category_name?: string | null;
  category_flow_type?: string | null;
  requester_name?: string | null;
  requested_by: string;
  created_at: string;
}

export const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  draft:              { label: 'Nháp', cls: 'text-muted-foreground bg-hover border-line' },
  pending_approval:   { label: 'Chờ duyệt', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  approved:           { label: 'Đã duyệt', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  rejected:           { label: 'Từ chối', cls: 'text-red-400 bg-red-500/10 border-red-500/30' },
  cancelled:          { label: 'Đã hủy', cls: 'text-muted-foreground bg-hover border-line' },
  sent_to_accounting: { label: 'Đã gửi Kế toán', cls: 'text-sky-400 bg-sky-500/10 border-sky-500/30' },
  posted:             { label: 'Đã hạch toán', cls: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30' },
  paid:               { label: 'Đã chi', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
};

type Tab = 'overview' | 'mine' | 'approve' | 'company' | 'config';

export default function ChiPhiClient() {
  const toast = useToast();
  const user = useMemo(() => getCurrentUser() as any, []);
  const isSA = user?.role === 'super_admin';
  const expPerms: string[] = Array.isArray(user?.module_permissions?.expense) ? user.module_permissions.expense : [];
  const canManage = isSA || expPerms.includes('manage');
  const canDeleteExpense = isSA || expPerms.includes('delete');
  // Dashboard là số liệu TOÀN CÔNG TY → chỉ có nghĩa với người có quyền xem phạm vi công ty.
  const canViewCompany = isSA || expPerms.includes('view');

  const [tab, setTab] = useState<Tab>(canViewCompany ? 'overview' : 'mine');
  const [items, setItems] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [companyId, setCompanyId] = useState('');

  const { paged, resetPage, paginationProps } = usePagedList(items, 20);

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<{
    related_type?: string;
    related_id?: string;
    advance?: { id: string; code: string | null; title: string; amount: number; company_id: string; currency?: string };
  } | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const open = sp.get('open');
    if (open) setDetailId(open);
    const t = sp.get('tab');
    if (t === 'overview' || t === 'approve' || t === 'company' || t === 'config' || t === 'mine') setTab(t as Tab);
    if (sp.get('new') === '1') {
      const ticketId = sp.get('ticketId');
      if (ticketId) setPrefill({ related_type: 'ticket', related_id: ticketId });
      setFormOpen(true);
    }
  }, []);

  useEffect(() => {
    fetch('/api/companies')
      .then((r) => r.json())
      .then((j) => {
        const list = Array.isArray(j) ? j : (j?.data ?? []);
        setCompanies(list.map((c: any) => ({ id: c.id, name: c.name })));
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set('scope', tab === 'config' ? 'mine' : tab);
      if (tab === 'company' && companyId) qs.set('company_id', companyId);
      if (statusFilter !== 'all') qs.set('status', statusFilter);

      const r = await fetch(`/api/expenses?${qs.toString()}`, {
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
    // `toast` CỐ Ý không nằm trong deps: toast.error() làm context re-render → `load` đổi
    // identity → useEffect bên dưới chạy lại → fetch lại → lại lỗi → lặp vô hạn (toast
    // chồng chất, spinner quay mãi).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, statusFilter, tab, user?.id, user?.role]);

  useEffect(() => { if (tab !== 'config' && tab !== 'overview') void load(); }, [load, tab]);
  useEffect(() => { resetPage(); }, [tab, statusFilter, companyId, resetPage]);

  const quickSubmit = async (id: string) => {
    if (!window.confirm('Gửi phiếu này vào luồng duyệt?')) return;
    try {
      const r = await fetch(`/api/expenses/${id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-current-user-id': user?.id || '' },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return toast.error(j?.error || 'Gửi duyệt thất bại');
      toast.success('Đã gửi duyệt');
      await load();
    } catch {
      toast.error('Lỗi kết nối');
    }
  };

  const quickDelete = async (id: string) => {
    if (!window.confirm('Xóa phiếu chi này? Hành động này không thể hoàn tác.')) return;
    try {
      const r = await fetch(`/api/expenses/${id}`, {
        method: 'DELETE',
        headers: { 'x-current-user-id': user?.id || '' },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return toast.error(j?.error || 'Xóa phiếu thất bại');
      toast.success('Đã xóa phiếu chi');
      await load();
    } catch {
      toast.error('Lỗi kết nối');
    }
  };

  const tabs: Array<{ key: Tab; label: string; icon: React.ReactNode; show: boolean }> = [
    { key: 'overview', label: 'Tổng quan', icon: <LayoutDashboard size={15} />, show: canViewCompany },
    { key: 'mine', label: 'Của tôi', icon: <Receipt size={15} />, show: true },
    { key: 'approve', label: 'Chờ tôi duyệt', icon: <Clock3 size={15} />, show: true },
    { key: 'company', label: 'Theo công ty', icon: <Building2 size={15} />, show: true },
    { key: 'config', label: 'Cấu hình', icon: <Settings2 size={15} />, show: canManage },
  ];

  const filters = [
    { v: 'all', l: 'Tất cả' },
    { v: 'draft', l: 'Nháp' },
    { v: 'pending_approval', l: 'Chờ duyệt' },
    { v: 'approved', l: 'Đã duyệt' },
    { v: 'rejected', l: 'Từ chối' },
  ];

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-700 text-foreground sm:text-2xl">
            <Receipt className="h-6 w-6 text-amber-400" /> Chi Phí
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Đề nghị chi, duyệt phân cấp theo hạn mức và chạy một luồng xuyên suốt tới Kế toán.
          </p>
        </div>
        <button
          onClick={() => { setEditId(null); setPrefill(null); setFormOpen(true); }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-600 text-white hover:bg-indigo-500"
        >
          <Plus size={16} /> Tạo phiếu chi
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-white/10">
        {tabs.filter((t) => t.show).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-600 transition-colors ${
              tab === t.key ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <ExpenseDashboardTab companies={companies} onOpenExpense={(id) => setDetailId(id)} />
      ) : tab === 'config' ? (
        <ExpenseConfigTab companies={companies} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {filters.map((f) => (
              <button
                key={f.v}
                onClick={() => setStatusFilter(f.v)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-600 transition-colors ${
                  statusFilter === f.v ? 'border-indigo-500/60 bg-indigo-500/20 text-indigo-300' : 'border-line text-muted-foreground hover:bg-hover'
                }`}
              >
                {f.l}
              </button>
            ))}
            {tab === 'company' && (
              <select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className="ml-auto rounded-xl border border-white/10 bg-[#162033] px-3 py-1.5 text-xs text-foreground outline-none"
              >
                <option value="">— Chọn công ty —</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-muted-foreground">
              <Inbox className="mb-3 h-10 w-10 opacity-30" />
              <p className="text-sm">
                {tab === 'approve'
                  ? 'Không có phiếu nào chờ bạn duyệt.'
                  : tab === 'company' && !companyId
                    ? 'Chọn công ty để xem chi phí.'
                    : 'Chưa có phiếu chi nào.'}
              </p>
              {tab === 'mine' && <p className="mt-1 text-xs opacity-60">Bấm "Tạo phiếu chi" để bắt đầu.</p>}
            </div>
          ) : (
            <div className="space-y-2.5">
              {paged.map((e) => {
                const st = STATUS_CFG[e.status] || STATUS_CFG.draft;
                const isMine = String(e.requested_by).toLowerCase() === String(user?.id || '').toLowerCase();
                const canEdit = isMine && (e.status === 'draft' || e.status === 'rejected');
                const canQuickDelete = canDeleteExpense && (e.status === 'draft' || e.status === 'rejected');
                const canQuickApprove = tab === 'approve' && e.status === 'pending_approval';

                return (
                  <div
                    key={e.id}
                    className="rounded-2xl border border-white/5 p-4 transition-colors hover:border-indigo-500/40 hover:bg-white/5"
                    style={{ background: 'var(--card)' }}
                  >
                    <button type="button" onClick={() => setDetailId(e.id)} className="w-full text-left">
                      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {e.code && <span className="font-mono text-xs text-indigo-300">{e.code}</span>}
                            <span className="truncate text-sm font-600 text-foreground">{e.title}</span>
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-600 ${st.cls}`}>{st.label}</span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {e.category_name || 'Chưa phân loại'} · {e.company_name || '—'} · {e.requester_name || '—'}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="tabular-nums text-base font-800 text-foreground">{formatMoney(Number(e.amount), e.currency)}</p>
                          <p className="text-2xs text-muted-foreground">{new Date(e.created_at).toLocaleDateString('vi-VN')}</p>
                        </div>
                      </div>
                    </button>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setDetailId(e.id)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-600 text-foreground hover:bg-hover"
                      >
                        <Eye size={14} /> Xem chi phí
                      </button>

                      {canEdit && (
                        <>
                          <button
                            type="button"
                            onClick={() => { setEditId(e.id); setFormOpen(true); }}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-600 text-foreground hover:bg-hover"
                          >
                            <Pencil size={14} /> Sửa
                          </button>
                          <button
                            type="button"
                            onClick={() => void quickSubmit(e.id)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-600 text-white hover:bg-indigo-500"
                          >
                            <Send size={14} /> Gửi duyệt
                          </button>
                        </>
                      )}

                      {canQuickDelete && (
                        <button
                          type="button"
                          onClick={() => void quickDelete(e.id)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-600 text-red-400 hover:bg-red-500/20"
                        >
                          <Trash2 size={14} /> Xóa phiếu
                        </button>
                      )}

                      {canQuickApprove && (
                        <button
                          type="button"
                          onClick={() => setDetailId(e.id)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-600 text-white hover:bg-emerald-500"
                        >
                          <Receipt size={14} /> Duyệt
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              <ListPagination {...paginationProps} />
            </div>
          )}
        </>
      )}

      {formOpen && (
        <ExpenseFormModal
          expenseId={editId}
          companies={companies}
          prefill={prefill}
          onClose={() => { setFormOpen(false); setEditId(null); setPrefill(null); }}
          onSaved={(id) => { setFormOpen(false); setEditId(null); setPrefill(null); void load(); setDetailId(id); }}
        />
      )}

      {detailId && (
        <ExpenseDetailModal
          expenseId={detailId}
          currentUserId={user?.id || ''}
          canDeleteExpense={canDeleteExpense}
          onClose={() => setDetailId(null)}
          onChanged={() => void load()}
          onEdit={(id) => { setDetailId(null); setEditId(id); setFormOpen(true); }}
          onOpenExpense={(id) => setDetailId(id)}
          onSettle={(adv) => { setDetailId(null); setEditId(null); setPrefill({ advance: adv }); setFormOpen(true); }}
        />
      )}
    </div>
  );
}
