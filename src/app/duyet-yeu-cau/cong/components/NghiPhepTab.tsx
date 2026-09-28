'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, CheckCircle2, XCircle, Clock, CalendarDays, X, AlertTriangle,
  Building2, Users, ChevronDown, ChevronRight,
} from 'lucide-react';
import { bulkReview } from '@/lib/utils/bulkReview';
import type { Conflict } from '@/lib/services/attendanceConflictService';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { fmtDays } from '@/lib/format';
import ErrorState from '@/components/ui/ErrorState';
import { groupByOrg, subGroupByDept } from '@/lib/utils/orgGroup';

/** Tiêu đề nhóm phòng ban/công ty — bấm để thu gọn/mở rộng. */
function OrgGroupHeader({ label, count, pending, role, open, onToggle }: {
  label: string; count: number; pending: number; role: string; open: boolean; onToggle: () => void;
}) {
  return (
    <button type="button" onClick={onToggle}
      className="w-full flex items-center gap-2 rounded-xl border border-line-subtle px-3 py-2 text-left hover:bg-white/[0.03] transition-colors"
      style={{ background: 'var(--card)' }}>
      {open ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
      {role === 'super_admin'
        ? <Building2 className="h-4 w-4 text-teal-400 flex-shrink-0" />
        : <Users className="h-4 w-4 text-teal-400 flex-shrink-0" />}
      <span className="text-sm font-700 text-foreground truncate">{label}</span>
      {pending > 0 && (
        <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-700 text-white flex-shrink-0">{pending}</span>
      )}
      <span className="ml-auto text-xs font-600 text-muted-foreground flex-shrink-0">{count}</span>
    </button>
  );
}

/** Tiêu đề nhóm PHÒNG BAN bên trong nhóm công ty (chỉ super_admin). */
function DeptSubHeader({ label, count, pending, open, onToggle }: {
  label: string; count: number; pending: number; open: boolean; onToggle: () => void;
}) {
  return (
    <button type="button" onClick={onToggle}
      className="ml-4 w-[calc(100%-1rem)] flex items-center gap-2 rounded-lg border border-line-subtle px-3 py-1.5 text-left hover:bg-white/[0.03] transition-colors"
      style={{ background: 'var(--secondary)' }}>
      {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
      <Users className="h-3.5 w-3.5 text-teal-400 flex-shrink-0" />
      <span className="text-xs font-600 text-foreground truncate">{label}</span>
      {pending > 0 && (
        <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-700 text-white flex-shrink-0">{pending}</span>
      )}
      <span className="ml-auto text-[10px] font-600 text-muted-foreground flex-shrink-0">{count}</span>
    </button>
  );
}

interface LeaveItem {
  id: string;
  user_id: string;
  user_name: string | null;
  user_department: string | null;
  company_name?: string | null;
  mode: 'day' | 'hour';
  day_part: 'morning' | 'afternoon' | null;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  total_days: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reviewed_at: string | null;
  reviewer_name: string | null;
  review_note: string | null;
  type_name: string | null;
  type_color: string | null;
  type_paid_by: string | null;
  type_deducts_balance: boolean | null;
  created_at: string;
}

interface NghiPhepTabProps {
  userId: string;
  userRole: string;
  onPendingChange: (count: number) => void;
}

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  pending: { label: 'Chờ duyệt', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  approved: { label: 'Đã duyệt', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  rejected: { label: 'Từ chối', color: 'text-red-400 bg-red-500/10 border-red-500/30' },
  cancelled: { label: 'Đã hủy', color: 'text-muted-foreground bg-hover border-line' },
};

const PAID_BY_LABEL: Record<string, string> = {
  company: 'Công ty trả lương',
  insurance: 'Hưởng BHXH',
  unpaid: 'Không lương',
};

const STATUS_FILTERS = [
  { v: 'pending', l: 'Chờ duyệt' },
  { v: 'approved', l: 'Đã duyệt' },
  { v: 'rejected', l: 'Từ chối' },
  { v: 'all', l: 'Tất cả' },
];

function fmtDate(d: string) {
  return new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('vi-VN', {
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

export default function NghiPhepTab({ userId, userRole, onPendingChange }: NghiPhepTabProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<LeaveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState('pending');
  const [showArchive, setShowArchive] = useState(false); // hiện cả lệnh cũ (>60 ngày) đã xử lý
  const [reviewing, setReviewing] = useState<LeaveItem | null>(null);
  const [detailItem, setDetailItem] = useState<LeaveItem | null>(null); // modal xem chi tiết + lịch sử
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [balanceInfo, setBalanceInfo] = useState<number | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<LeaveItem | null>(null);
  const [revokeReason, setRevokeReason] = useState('');

  // ── Duyệt hàng loạt (multi-select) ──
  const [selIds, setSelIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkReject, setBulkReject] = useState(false);
  // Nhóm phòng ban/công ty đang MỞ (mặc định thu gọn hết).
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (label: string) =>
    setOpenGroups(prev => { const n = new Set(prev); n.has(label) ? n.delete(label) : n.add(label); return n; });
  // Nhóm phòng ban con đang ĐÓNG (mặc định mở hết khi mở công ty).
  const [closedSubs, setClosedSubs] = useState<Set<string>>(new Set());
  const toggleSub = (key: string) =>
    setClosedSubs(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const [bulkRejNote, setBulkRejNote] = useState('');

  // ── Duyệt / từ chối nhanh 1 đơn ngay trên danh sách ──
  const [quickBusyId, setQuickBusyId] = useState<string | null>(null);
  const [quickReject, setQuickReject] = useState<LeaveItem | null>(null);
  const [quickRejNote, setQuickRejNote] = useState('');

  // ── Soi mâu thuẫn (chấm công/tăng ca trùng ngày nghỉ) ──
  const [conflicts, setConflicts] = useState<Record<string, Conflict[]>>({});
  /** Liệt kê các ngày trong đơn có cảnh báo. */
  const leaveConflicts = useCallback((r: LeaveItem): { date: string; items: Conflict[] }[] => {
    const out: { date: string; items: Conflict[] }[] = [];
    const s = new Date(String(r.start_date).slice(0, 10) + 'T00:00:00');
    const e = new Date(String(r.end_date).slice(0, 10) + 'T00:00:00');
    for (let d = new Date(s); d <= e && out.length < 92; d.setDate(d.getDate() + 1)) {
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const cs = conflicts[`${r.user_id}|${date}`];
      if (cs?.length) out.push({ date, items: cs });
    }
    return out;
  }, [conflicts]);
  const leaveHasRed = useCallback(
    (r: LeaveItem) => leaveConflicts(r).some(d => d.items.some(c => c.severity === 'red')),
    [leaveConflicts],
  );
  const confirmLeaveRed = useCallback(async (r: LeaveItem): Promise<boolean> => {
    const days = leaveConflicts(r).filter(d => d.items.some(c => c.severity === 'red'));
    if (days.length === 0) return true;
    const lines = days.map(d => `${d.date}: ${d.items.filter(c => c.severity === 'red').map(c => c.message).join('; ')}`).join(' | ');
    return confirm({
      title: 'Đơn có cảnh báo mâu thuẫn?',
      message: `Đơn này có CẢNH BÁO MÂU THUẪN: ${lines}. Bạn đã kiểm tra và vẫn muốn duyệt?`,
      confirmLabel: 'Vẫn duyệt',
      danger: true,
    });
  }, [confirm, leaveConflicts]);
  const leaveRedNote = useCallback((r: LeaveItem): string | undefined => {
    const msgs = leaveConflicts(r).flatMap(d => d.items.filter(c => c.severity === 'red').map(c => c.message));
    return msgs.length ? `[Lưu ý] Duyệt dù có cảnh báo: ${[...new Set(msgs)].join('; ')}` : undefined;
  }, [leaveConflicts]);

  const fetchItems = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('status', filter);
      const res = await fetch(`/api/leave/requests?${params}`, {
        headers: { 'x-current-user-role': userRole, 'x-current-user-id': userId },
      });
      const json = await res.json();
      if (json.success) {
        setItems(json.data);
        const pendingRes = await fetch(`/api/leave/requests?status=pending`, {
          headers: { 'x-current-user-role': userRole, 'x-current-user-id': userId },
        });
        const pendingJson = await pendingRes.json();
        if (pendingJson.success) onPendingChange(pendingJson.data.length);
      } else {
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [userId, userRole, filter, onPendingChange]);

  useEffect(() => { void fetchItems(); }, [fetchItems]);

  // Soi mâu thuẫn cho các đơn đang chờ duyệt (mỗi ngày trong khoảng nghỉ).
  useEffect(() => {
    if (!userId) return;
    const pend: { userId: string; date: string }[] = [];
    for (const r of items) {
      if (r.status !== 'pending') continue;
      const s = new Date(String(r.start_date).slice(0, 10) + 'T00:00:00');
      const e = new Date(String(r.end_date).slice(0, 10) + 'T00:00:00');
      for (let d = new Date(s); d <= e && pend.length < 800; d.setDate(d.getDate() + 1)) {
        pend.push({ userId: r.user_id, date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` });
      }
    }
    if (pend.length === 0) { setConflicts({}); return; }
    let alive = true;
    fetch('/api/attendance/conflicts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-current-user-id': userId },
      body: JSON.stringify({ items: pend }),
    }).then(r => r.json()).then(j => { if (alive && j.success) setConflicts(j.data ?? {}); }).catch(() => {});
    return () => { alive = false; };
  }, [items, userId]);

  // Số dư phép năm của nhân viên đang duyệt (chỉ loại trừ quỹ)
  useEffect(() => {
    if (!reviewing || !reviewing.type_deducts_balance) {
      setBalanceInfo(null);
      return;
    }
    (async () => {
      try {
        const year = Number(String(reviewing.start_date).slice(0, 4));
        const res = await fetch(`/api/leave/balance?year=${year}&userId=${reviewing.user_id}`, {
          headers: { 'x-current-user-role': userRole, 'x-current-user-id': userId },
        });
        const json = await res.json();
        if (res.ok && json.success) setBalanceInfo(Number(json.data.balance));
      } catch {
        setBalanceInfo(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewing?.id]);

  function handleRevoke(item: LeaveItem) {
    setRevokeReason('');
    setRevokeTarget(item);
  }

  async function confirmRevoke() {
    if (!revokeTarget || !revokeReason.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/leave/requests/${revokeTarget.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-current-user-role': userRole,
          'x-current-user-id': userId,
        },
        body: JSON.stringify({ action: 'cancelled', review_note: revokeReason.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        markRevokeClean();
        setRevokeTarget(null);
        void fetchItems();
      } else {
        toast.error(json.error ?? 'Không hủy được đơn');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReview(action: 'approved' | 'rejected') {
    if (!reviewing || submitting) return;
    if (action === 'approved' && !(await confirmLeaveRed(reviewing))) return;
    const reviewNote = action === 'approved'
      ? (leaveRedNote(reviewing) ?? (note.trim() || undefined))
      : (note.trim() || undefined);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/leave/requests/${reviewing.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-current-user-role': userRole,
          'x-current-user-id': userId,
        },
        body: JSON.stringify({ action, review_note: reviewNote }),
      });
      const json = await res.json();
      if (json.success) {
        markReviewClean();
        setReviewing(null);
        setNote('');
        void fetchItems();
      } else {
        toast.error(json.error ?? 'Không duyệt được đơn');
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ── Chọn nhiều + duyệt hàng loạt ──
  function toggleSel(id: string) {
    setSelIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelIds(prev => {
      const allSelected = pendingIds.length > 0 && pendingIds.every(id => prev.has(id));
      return allSelected ? new Set() : new Set(pendingIds);
    });
  }
  async function handleBulk(action: 'approved' | 'rejected', note?: string) {
    const ids = [...selIds];
    if (ids.length === 0 || bulkBusy) return;
    if (action === 'approved' && !(await confirm({ title: 'Duyệt hàng loạt?', message: `Duyệt ${ids.length} đơn nghỉ phép đã chọn?`, confirmLabel: 'Duyệt' }))) return;
    setBulkBusy(true);
    try {
      const { ok, fail } = await bulkReview({
        ids,
        endpoint: id => `/api/leave/requests/${id}`,
        headers: { 'x-current-user-role': userRole, 'x-current-user-id': userId },
        body: { action, review_note: note?.trim() || undefined },
      });
      setSelIds(new Set());
      markBulkRejClean();
      setBulkReject(false);
      setBulkRejNote('');
      await fetchItems();
      toast.success(`Đã ${action === 'approved' ? 'duyệt' : 'từ chối'} ${ok} đơn${fail ? `, ${fail} lỗi` : ''}`);
    } finally { setBulkBusy(false); }
  }

  // ── Duyệt / từ chối nhanh 1 đơn (không cần mở modal chi tiết) ──
  async function quickReview(id: string, action: 'approved' | 'rejected', note?: string) {
    if (quickBusyId) return;
    const r = items.find(x => x.id === id);
    if (action === 'approved' && r && !(await confirmLeaveRed(r))) return;
    const reviewNote = action === 'approved' && r
      ? (leaveRedNote(r) ?? (note?.trim() || undefined))
      : (note?.trim() || undefined);
    setQuickBusyId(id);
    try {
      const res = await fetch(`/api/leave/requests/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-current-user-role': userRole, 'x-current-user-id': userId },
        body: JSON.stringify({ action, review_note: reviewNote }),
      });
      const json = await res.json();
      if (!json.success) { toast.error(json.error ?? 'Thao tác thất bại'); return; }
      setSelIds(prev => { const n = new Set(prev); n.delete(id); return n; });
      void fetchItems();
    } catch { toast.error('Lỗi kết nối, vui lòng thử lại'); }
    finally { setQuickBusyId(null); }
  }

  // Bỏ chọn khi đổi bộ lọc
  useEffect(() => { setSelIds(new Set()); }, [filter]);

  // Lưu trữ: ẩn lệnh đã xử lý cũ hơn 60 ngày cho gọn (dữ liệu vẫn nguyên, chuyên cần không đổi).
  const RECENT_MS = 60 * 86400000;
  const passArchive = (it: { status: string; reviewed_at: string | null }) =>
    showArchive || it.status === 'pending' || !it.reviewed_at ||
    Date.now() - new Date(it.reviewed_at).getTime() <= RECENT_MS;
  const shown = items.filter(passArchive);
  const archivedCount = items.filter(i => i.status !== 'pending' && i.reviewed_at && Date.now() - new Date(i.reviewed_at).getTime() > RECENT_MS).length;

  const pendingIds = items.filter(i => i.status === 'pending').map(i => i.id);
  const allSelected = pendingIds.length > 0 && pendingIds.every(id => selIds.has(id));

  // ── UX modal (ESC + cảnh báo thay đổi chưa lưu) cho 4 modal nhập liệu ──
  const closeRevoke = useCallback(() => setRevokeTarget(null), []);
  const { markDirty: markRevokeDirty, markClean: markRevokeClean, guardedClose: guardedCloseRevoke } = useUnsavedGuard(closeRevoke);
  useEscapeKey(guardedCloseRevoke, !!revokeTarget);

  const closeBulkReject = useCallback(() => setBulkReject(false), []);
  const { markDirty: markBulkRejDirty, markClean: markBulkRejClean, guardedClose: guardedCloseBulkReject } = useUnsavedGuard(closeBulkReject);
  useEscapeKey(guardedCloseBulkReject, bulkReject);

  const closeQuickReject = useCallback(() => setQuickReject(null), []);
  const { markDirty: markQuickRejDirty, markClean: markQuickRejClean, guardedClose: guardedCloseQuickReject } = useUnsavedGuard(closeQuickReject);
  useEscapeKey(guardedCloseQuickReject, !!quickReject);

  const closeReviewing = useCallback(() => { setReviewing(null); setNote(''); }, []);
  const { markDirty: markReviewDirty, markClean: markReviewClean, guardedClose: guardedCloseReviewing } = useUnsavedGuard(closeReviewing);
  useEscapeKey(guardedCloseReviewing, !!reviewing);
  useEscapeKey(() => setDetailItem(null), !!detailItem);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map(({ v, l }) => (
          <button
            key={v}
            onClick={() => setFilter(v)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-600 transition-colors ${
              filter === v
                ? 'border-teal-500/60 bg-teal-500/20 text-teal-300'
                : 'border-line text-muted-foreground hover:bg-hover'
            }`}
          >
            {l}
          </button>
        ))}
        <button onClick={() => setShowArchive(s => !s)}
          title="Hiện/ẩn các lệnh đã xử lý cũ hơn 60 ngày (dữ liệu vẫn được lưu, chuyên cần không đổi)"
          className={`inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-600 transition-colors ${
            showArchive ? 'border-amber-500/60 bg-amber-500/20 text-amber-300' : 'border-line text-muted-foreground hover:bg-hover'
          }`}>
          🗄️ Lưu trữ{!showArchive && archivedCount > 0 ? ` (${archivedCount})` : ''}
        </button>
        {pendingIds.length > 0 && (
          <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-3.5 w-3.5 accent-teal-500" />
            Chọn tất cả ({pendingIds.length})
          </label>
        )}
      </div>

      {/* Thanh duyệt hàng loạt */}
      {selIds.size > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-2.5">
          <span className="text-sm font-600 text-teal-300">Đã chọn {selIds.size} đơn</span>
          <div className="flex gap-2">
            <button onClick={() => { setBulkRejNote(''); setBulkReject(true); }} disabled={bulkBusy}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-600 text-red-400 hover:bg-red-500/20 disabled:opacity-40 transition-colors">
              <XCircle className="h-3.5 w-3.5" /> Từ chối
            </button>
            <button onClick={() => handleBulk('approved')} disabled={bulkBusy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-600 text-white disabled:opacity-40 transition-colors">
              {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Duyệt {selIds.size}
            </button>
            <button onClick={() => setSelIds(new Set())} disabled={bulkBusy}
              className="btn-ghost rounded-xl px-3 py-1.5 text-xs font-600 disabled:opacity-40">Bỏ chọn</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : loadError ? (
        <ErrorState onRetry={fetchItems} />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <CalendarDays className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Không có đơn nghỉ phép nào</p>
          <p className="text-xs mt-1 opacity-60">Đơn của nhân viên trực thuộc sẽ hiện tại đây</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groupByOrg(shown, userRole).map((group) => {
          const open = openGroups.has(group.label);
          const pending = group.items.filter(i => i.status === 'pending').length;
          return (
          <div key={group.label} className="space-y-3">
            <OrgGroupHeader label={group.label} count={group.items.length} pending={pending} role={userRole} open={open} onToggle={() => toggleGroup(group.label)} />
            {open && subGroupByDept(group.items, userRole).map(sub => {
            const subKey = `${group.label}|${sub.label}`;
            const subOpen = sub.label === null || !closedSubs.has(subKey);
            return (
            <div key={sub.label ?? '__all'} className="space-y-3">
            {sub.label !== null && (
              <DeptSubHeader label={sub.label} count={sub.items.length}
                pending={sub.items.filter(i => i.status === 'pending').length}
                open={subOpen} onToggle={() => toggleSub(subKey)} />
            )}
            {subOpen && sub.items.map((r) => {
            const st = STATUS_CFG[r.status];
            return (
              <div
                key={r.id}
                onClick={() => setDetailItem(r)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailItem(r); } }}
                title="Bấm để xem chi tiết & lịch sử"
                className="rounded-2xl border border-line-subtle p-4 sm:p-5 cursor-pointer transition-colors hover:border-indigo-500/40 hover:bg-hover/40"
                style={{ background: 'var(--card)' }}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    {r.status === 'pending' && (
                      <input type="checkbox" checked={selIds.has(r.id)} onClick={e => e.stopPropagation()} onChange={() => toggleSel(r.id)} className="mt-1 h-4 w-4 flex-shrink-0 accent-teal-500" />
                    )}
                    <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-600 text-foreground">{r.user_name}</span>
                      {r.user_department && (
                        <span className="text-xs text-muted-foreground">· {r.user_department}</span>
                      )}
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-500 ${st.color}`}>
                        {st.label}
                      </span>
                      {r.status === 'pending' && leaveConflicts(r).length > 0 && (
                        <span title={leaveConflicts(r).flatMap(d => d.items.map(c => `${d.date}: ${c.message}`)).join('\n')}
                          className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-600 ${leaveHasRed(r) ? 'text-red-400 border-red-500/40 bg-red-500/10' : 'text-amber-400 border-amber-500/40 bg-amber-500/10'}`}>
                          <AlertTriangle className="h-3 w-3" />{leaveHasRed(r) ? 'Mâu thuẫn' : 'Cảnh báo'}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-hover px-2 py-0.5"
                      >
                        <span className="h-2 w-2 rounded-full" style={{ background: r.type_color ?? '#6366f1' }} />
                        {r.type_name}
                      </span>
                      <Clock className="h-3.5 w-3.5" />
                      {r.mode === 'hour'
                        ? r.day_part
                          ? `${fmtDate(r.start_date)} · ${r.day_part === 'morning' ? 'Buổi sáng' : 'Buổi chiều'}`
                          : `${fmtDate(r.start_date)} · ${r.start_time}–${r.end_time}`
                        : r.start_date === r.end_date
                          ? fmtDate(r.start_date)
                          : `${fmtDate(r.start_date)} → ${fmtDate(r.end_date)}`}
                      <span className="font-600 text-foreground">({r.total_days} ngày công)</span>
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">Lý do: {r.reason}</p>
                    {r.review_note && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Phản hồi{r.reviewer_name ? ` (${r.reviewer_name})` : ''}: {r.review_note}
                      </p>
                    )}
                    {r.status === 'pending' && leaveConflicts(r).length > 0 && (
                      <div className={`mt-2 rounded-lg border px-2.5 py-1.5 space-y-0.5 ${leaveHasRed(r) ? 'border-red-500/30 bg-red-500/8' : 'border-amber-500/30 bg-amber-500/8'}`}>
                        {leaveConflicts(r).map((d, i) => (
                          <p key={i} className={`flex gap-1.5 text-[11px] ${leaveHasRed(r) ? 'text-red-300' : 'text-amber-300/90'}`}>
                            <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                            <span><span className="font-600">{d.date}:</span> {d.items.map(c => c.message).join(' ')}</span>
                          </p>
                        ))}
                      </div>
                    )}
                    </div>
                  </div>
                  {r.status === 'pending' && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); void quickReview(r.id, 'approved'); }}
                        disabled={quickBusyId === r.id}
                        title="Duyệt nhanh"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 transition-colors"
                      >
                        {quickBusyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setQuickRejNote(''); setQuickReject(r); }}
                        disabled={quickBusyId === r.id}
                        title="Từ chối"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-40 transition-colors"
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setReviewing(r); setNote(''); }}
                        className="btn-indigo rounded-xl px-4 py-2 text-xs font-600"
                      >
                        Xét duyệt
                      </button>
                    </div>
                  )}
                  {r.status === 'approved' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRevoke(r); }}
                      disabled={submitting}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-600 text-red-400 hover:bg-red-500/20 disabled:opacity-40 transition-colors flex-shrink-0"
                    >
                      <X className="h-3.5 w-3.5" /> Hủy duyệt
                    </button>
                  )}
                </div>
              </div>
            );
            })}
            </div>
            );
            })}
          </div>
          );
          })}
        </div>
      )}

      {/* Modal xác nhận hủy */}
      {revokeTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) guardedCloseRevoke(); }}>
          <div className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl border border-line overflow-hidden sheet-up sm:animate-fadeIn"
            style={{ background: 'var(--card)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
              <h2 className="text-base font-700 text-foreground">Xác Nhận Hủy</h2>
              <button onClick={guardedCloseRevoke} className="btn-ghost rounded-lg p-1.5">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4" onChange={markRevokeDirty}>
              <p className="text-sm text-muted-foreground">
                Hủy đơn <span className="font-600 text-foreground">{revokeTarget.type_name}</span> của <span className="font-600 text-foreground">{revokeTarget.user_name}</span>.
                {revokeTarget.type_deducts_balance && ' Quỹ phép năm sẽ được hoàn lại.'}
              </p>
              <div>
                <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">
                  Lý do hủy <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={revokeReason}
                  onChange={e => setRevokeReason(e.target.value)}
                  placeholder="Nhập lý do hủy..."
                  rows={3}
                  autoFocus
                  className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-red-500/60 focus:outline-none resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
              <button onClick={guardedCloseRevoke}
                className="btn-ghost rounded-xl px-4 py-2 text-sm">Đóng</button>
              <button
                disabled={!revokeReason.trim() || submitting}
                onClick={confirmRevoke}
                className="inline-flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-2 text-sm font-600 text-red-400 hover:bg-red-500/25 disabled:opacity-40 transition-colors">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Xác nhận hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal CHI TIẾT + LỊCH SỬ đơn nghỉ phép / công đặc biệt */}
      {detailItem && (() => {
        const d = detailItem;
        const st = STATUS_CFG[d.status];
        const fmtDT = (s: string | null) => s
          ? new Date(s).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
          : '—';
        const timeText = d.mode === 'hour'
          ? (d.day_part
              ? `${fmtDate(d.start_date)} · ${d.day_part === 'morning' ? 'Buổi sáng' : 'Buổi chiều'}`
              : `${fmtDate(d.start_date)} · ${d.start_time}–${d.end_time}`)
          : (d.start_date === d.end_date ? fmtDate(d.start_date) : `${fmtDate(d.start_date)} → ${fmtDate(d.end_date)}`);
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
            onClick={e => { if (e.target === e.currentTarget) setDetailItem(null); }}>
            <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-line overflow-hidden sheet-up sm:animate-fadeIn"
              style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
                <h2 className="text-base font-700 text-foreground">Chi Tiết Đơn</h2>
                <button onClick={() => setDetailItem(null)} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
              </div>
              {/* Body */}
              <div className="max-h-[70vh] overflow-y-auto p-6 space-y-4">
                {/* Người + trạng thái */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-700 text-foreground">{d.user_name}</span>
                  {d.user_department && <span className="text-xs text-muted-foreground">· {d.user_department}</span>}
                  {d.company_name && <span className="text-xs text-muted-foreground">· {d.company_name}</span>}
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-500 ${st.color}`}>{st.label}</span>
                </div>

                {/* Thông tin đơn */}
                <div className="rounded-xl border border-line-subtle bg-hover/30 p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">Loại</span>
                    <span className="inline-flex items-center gap-1.5 text-sm font-600 text-foreground">
                      <span className="h-2 w-2 rounded-full" style={{ background: d.type_color ?? '#6366f1' }} />{d.type_name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">Thời gian</span>
                    <span className="text-sm text-foreground text-right">{timeText}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">Số ngày công</span>
                    <span className="text-sm font-700 text-foreground">{fmtDays(d.total_days)} ngày</span>
                  </div>
                  {d.type_paid_by && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">Chế độ lương</span>
                      <span className="text-sm text-foreground">{PAID_BY_LABEL[d.type_paid_by] ?? d.type_paid_by}</span>
                    </div>
                  )}
                  {d.type_deducts_balance != null && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">Trừ quỹ phép</span>
                      <span className="text-sm text-foreground">{d.type_deducts_balance ? 'Có' : 'Không'}</span>
                    </div>
                  )}
                </div>

                {/* Lý do */}
                <div>
                  <p className="mb-1 text-xs font-600 text-muted-foreground uppercase tracking-wider">Lý do</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{d.reason || '—'}</p>
                </div>

                {/* Lịch sử */}
                <div>
                  <p className="mb-2 text-xs font-600 text-muted-foreground uppercase tracking-wider">Lịch sử</p>
                  <div className="space-y-3">
                    {/* Tạo */}
                    <div className="flex gap-3">
                      <span className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-indigo-400" />
                      <div className="min-w-0">
                        <p className="text-sm font-600 text-foreground">Tạo yêu cầu</p>
                        <p className="text-xs text-muted-foreground">{fmtDT(d.created_at)}</p>
                      </div>
                    </div>
                    {/* Kết quả duyệt */}
                    {d.status === 'pending' ? (
                      <div className="flex gap-3">
                        <span className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-amber-400" />
                        <div className="min-w-0"><p className="text-sm font-600 text-amber-400">Đang chờ duyệt</p></div>
                      </div>
                    ) : (
                      <div className="flex gap-3">
                        <span className={`mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full ${d.status === 'approved' ? 'bg-emerald-400' : d.status === 'rejected' ? 'bg-red-400' : 'bg-muted-foreground'}`} />
                        <div className="min-w-0">
                          <p className={`text-sm font-600 ${d.status === 'approved' ? 'text-emerald-400' : d.status === 'rejected' ? 'text-red-400' : 'text-muted-foreground'}`}>
                            {st.label}{d.reviewer_name ? ` · ${d.reviewer_name}` : ''}
                          </p>
                          <p className="text-xs text-muted-foreground">{fmtDT(d.reviewed_at)}</p>
                          {d.review_note && <p className="mt-1 text-xs text-foreground">Ghi chú: {d.review_note}</p>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {/* Footer */}
              <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
                <button onClick={() => setDetailItem(null)} className="btn-ghost rounded-xl px-4 py-2 text-sm">Đóng</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal từ chối hàng loạt */}
      {bulkReject && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) guardedCloseBulkReject(); }}>
          <div className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl border border-line overflow-hidden sheet-up sm:animate-fadeIn"
            style={{ background: 'var(--card)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
              <h2 className="text-base font-700 text-foreground">Từ Chối Hàng Loạt</h2>
              <button onClick={guardedCloseBulkReject} className="btn-ghost rounded-lg p-1.5">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4" onChange={markBulkRejDirty}>
              <p className="text-sm text-muted-foreground">
                Từ chối <span className="font-600 text-foreground">{selIds.size}</span> đơn nghỉ phép đã chọn. Ghi chú sẽ áp dụng cho tất cả.
              </p>
              <div>
                <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Ghi chú từ chối (tùy chọn)</label>
                <textarea value={bulkRejNote} onChange={e => setBulkRejNote(e.target.value)} placeholder="Nhập lý do từ chối..." rows={3} autoFocus
                  className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-red-500/60 focus:outline-none resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
              <button onClick={guardedCloseBulkReject} disabled={bulkBusy} className="btn-ghost rounded-xl px-4 py-2 text-sm disabled:opacity-40">Đóng</button>
              <button disabled={bulkBusy} onClick={() => handleBulk('rejected', bulkRejNote)}
                className="inline-flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-2 text-sm font-600 text-red-400 hover:bg-red-500/25 disabled:opacity-40 transition-colors">
                {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Từ chối tất cả
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal từ chối nhanh */}
      {quickReject && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) guardedCloseQuickReject(); }}>
          <div className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl border border-line overflow-hidden sheet-up sm:animate-fadeIn"
            style={{ background: 'var(--card)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
              <h2 className="text-base font-700 text-foreground">Từ Chối Đơn</h2>
              <button onClick={guardedCloseQuickReject} className="btn-ghost rounded-lg p-1.5">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4" onChange={markQuickRejDirty}>
              <p className="text-sm text-muted-foreground">
                Từ chối đơn <span className="font-600 text-foreground">{quickReject.type_name}</span> của <span className="font-600 text-foreground">{quickReject.user_name}</span>.
              </p>
              <div>
                <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Lý do từ chối (tùy chọn)</label>
                <textarea value={quickRejNote} onChange={e => setQuickRejNote(e.target.value)} placeholder="Nhập lý do từ chối..." rows={3} autoFocus
                  className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-red-500/60 focus:outline-none resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
              <button onClick={guardedCloseQuickReject} disabled={!!quickBusyId} className="btn-ghost rounded-xl px-4 py-2 text-sm disabled:opacity-40">Đóng</button>
              <button disabled={!!quickBusyId}
                onClick={() => { const id = quickReject.id; const note = quickRejNote; markQuickRejClean(); setQuickReject(null); setQuickRejNote(''); void quickReview(id, 'rejected', note); }}
                className="inline-flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-2 text-sm font-600 text-red-400 hover:bg-red-500/25 disabled:opacity-40 transition-colors">
                {quickBusyId ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Từ chối
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal duyệt */}
      {reviewing && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) guardedCloseReviewing(); }}
        >
          <div
            className="w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-line overflow-hidden sheet-up sm:animate-fadeIn"
            style={{ background: 'var(--card)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
              <h2 className="text-base font-700 text-foreground">Duyệt đơn nghỉ phép</h2>
              <button
                onClick={guardedCloseReviewing}
                className="btn-ghost rounded-lg p-1.5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4" onChange={markReviewDirty}>
              <div className="space-y-2 text-sm">
                <p className="text-foreground font-600">{reviewing.user_name}</p>
                <p className="text-xs text-muted-foreground">
                  {reviewing.type_name}
                  {reviewing.type_paid_by && ` · ${PAID_BY_LABEL[reviewing.type_paid_by] ?? ''}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {reviewing.mode === 'hour'
                    ? reviewing.day_part
                      ? `${fmtDate(reviewing.start_date)} · ${reviewing.day_part === 'morning' ? 'Buổi sáng' : 'Buổi chiều'}`
                      : `${fmtDate(reviewing.start_date)} · ${reviewing.start_time}–${reviewing.end_time}`
                    : reviewing.start_date === reviewing.end_date
                      ? fmtDate(reviewing.start_date)
                      : `${fmtDate(reviewing.start_date)} → ${fmtDate(reviewing.end_date)}`}
                  {' '}· <span className="font-600 text-foreground">{reviewing.total_days} ngày công</span>
                </p>
                <p className="text-xs text-muted-foreground">Lý do: {reviewing.reason}</p>
                {reviewing.type_deducts_balance && balanceInfo != null && (
                  <p className={`text-xs font-600 ${balanceInfo >= reviewing.total_days ? 'text-teal-400' : 'text-red-400'}`}>
                    Quỹ phép năm hiện có: {fmtDays(balanceInfo)} ngày
                    {balanceInfo < reviewing.total_days && ' — KHÔNG đủ cho đơn này'}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">
                  Ghi chú (tùy chọn)
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Ghi chú gửi lại nhân viên..."
                  className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
              <button
                onClick={() => handleReview('rejected')}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-600 text-red-400 hover:bg-red-500/20 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Từ chối
              </button>
              <button
                onClick={() => handleReview('approved')}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-sm font-600 text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Duyệt
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
