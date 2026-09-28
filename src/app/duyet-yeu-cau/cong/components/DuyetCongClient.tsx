'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, CheckCircle2, XCircle, Clock,
  FileText, AlertCircle, FilePlus, Timer, AlertTriangle,
  X, CalendarDays,
  Building2, Users, ChevronDown, ChevronRight,
} from 'lucide-react';
import { fmtOTHours, hasSpecialDaytimeOvertime } from '@/lib/utils/overtimeUtils';
import { bulkReview } from '@/lib/utils/bulkReview';
import type { Conflict } from '@/lib/services/attendanceConflictService';
import NghiPhepTab from './NghiPhepTab';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import ErrorState from '@/components/ui/ErrorState';
import { groupByOrg, subGroupByDept } from '@/lib/utils/orgGroup';

// ─── Types ─────────────────────────────────────────────────────────────────

interface Adjustment {
  id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  dept_name?: string | null;
  company_name?: string | null;
  adjustment_type: 'bu_cong' | 'bu_checkin' | 'bu_checkout' | 'cong_tac' | 'wfh' | 'lam_theo_ca';
  work_date: string;
  requested_checkin: string | null;
  requested_checkout: string | null;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reviewer_name: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

interface Overtime {
  id: string;
  user_id: string;
  user_name: string | null;
  dept_name?: string | null;
  company_name?: string | null;
  work_date: string;
  start_time: string;
  end_time: string;
  evening_hours: number;
  night_hours: number;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reviewer_name: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

// ─── Config ────────────────────────────────────────────────────────────────

const ADJ_TYPE_LABEL: Record<string, { label: string; color: string }> = {
  bu_cong:    { label: 'Bù Công',    color: 'text-rose-400 bg-rose-500/10 border-rose-500/30' },
  bu_cong_dac_biet: { label: 'Bù Công Đặc Thù', color: 'text-pink-400 bg-pink-500/10 border-pink-500/30' },
  bu_checkin: { label: 'Bù Giờ Vào', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30' },
  bu_checkout:{ label: 'Bù Giờ Ra',  color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  cong_tac:   { label: 'Công Tác',         color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' },
  wfh:        { label: 'Làm Việc Tại Nhà', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  lam_theo_ca:{ label: 'Làm Theo Ca',      color: 'text-violet-400 bg-violet-500/10 border-violet-500/30' },
};
const ADJ_TYPE_FALLBACK = { label: 'Khác', color: 'text-ink-muted bg-slate-500/10 border-slate-500/30' };

const STATUS_CFG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending:   { label: 'Chờ duyệt', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',    icon: <Clock className="h-3.5 w-3.5" /> },
  approved:  { label: 'Đã duyệt',  color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  rejected:  { label: 'Từ chối',   color: 'text-red-400 bg-red-500/10 border-red-500/30',           icon: <XCircle className="h-3.5 w-3.5" /> },
  cancelled: { label: 'Đã hủy',    color: 'text-muted-foreground bg-hover border-line',       icon: null },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getInitials(name: string | null) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}
function fmtDate(d: string) {
  // pg DATE columns serialize as ISO string (e.g. "2026-05-31T17:00:00.000Z") — must parse via VN timezone
  const dateKey = new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  return new Date(dateKey + 'T00:00:00').toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtTime(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
}
function isSpecialDaytimeLabel(workDate: string, startTime: string, eveningHours: number) {
  const dow = new Date(`${String(workDate).slice(0, 10)}T00:00:00+07:00`).getDay();
  return dow === 0 && hasSpecialDaytimeOvertime(startTime, eveningHours);
}
function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  return `${Math.floor(diff / 86400)} ngày trước`;
}
function InfoCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line-subtle p-3" style={{ background: 'var(--secondary)' }}>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      {children}
    </div>
  );
}

/** Pill cảnh báo mâu thuẫn nhỏ gọn trên card danh sách. */
function ConflictPill({ items }: { items: Conflict[] }) {
  if (!items.length) return null;
  const red = items.some(c => c.severity === 'red');
  return (
    <span title={items.map(c => c.message).join('\n')}
      className={`flex-shrink-0 inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-600 ${red ? 'text-red-400 border-red-500/40 bg-red-500/10' : 'text-amber-400 border-amber-500/40 bg-amber-500/10'}`}>
      <AlertTriangle className="h-3 w-3" />{red ? 'Mâu thuẫn' : 'Cảnh báo'}
    </span>
  );
}

/** Banner liệt kê chi tiết cảnh báo trong khung chi tiết. */
function ConflictBanner({ items }: { items: Conflict[] }) {
  if (!items.length) return null;
  const red = items.some(c => c.severity === 'red');
  return (
    <div className={`rounded-xl border p-3 space-y-1.5 ${red ? 'border-red-500/30 bg-red-500/8' : 'border-amber-500/30 bg-amber-500/8'}`}>
      <p className={`flex items-center gap-1.5 text-xs font-700 ${red ? 'text-red-400' : 'text-amber-400'}`}>
        <AlertTriangle className="h-3.5 w-3.5" /> {red ? 'Phát hiện mâu thuẫn — kiểm tra kỹ trước khi duyệt' : 'Lưu ý khi duyệt'}
      </p>
      <ul className="space-y-1">
        {items.map((c, i) => (
          <li key={i} className={`flex gap-1.5 text-xs ${c.severity === 'red' ? 'text-red-300' : 'text-amber-300/90'}`}>
            <span>{c.severity === 'red' ? '🔴' : '🟠'}</span><span>{c.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Tiêu đề nhóm phòng ban/công ty — bấm để thu gọn/mở rộng danh sách bên trong. */
function OrgGroupHeader({ label, count, pending, role, open, onToggle }: {
  label: string; count: number; pending: number; role: string; open: boolean; onToggle: () => void;
}) {
  return (
    <button type="button" onClick={onToggle}
      className="sticky top-0 z-10 w-full flex items-center gap-2 border-b border-white/[0.06] px-3 py-2 text-left hover:bg-white/[0.03] transition-colors"
      style={{ background: 'var(--card)' }}>
      {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
      {role === 'super_admin'
        ? <Building2 className="h-3.5 w-3.5 text-indigo-400 flex-shrink-0" />
        : <Users className="h-3.5 w-3.5 text-indigo-400 flex-shrink-0" />}
      <span className="text-xs font-700 text-foreground truncate">{label}</span>
      {pending > 0 && (
        <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-700 text-white flex-shrink-0">{pending}</span>
      )}
      <span className="ml-auto text-[10px] font-600 text-muted-foreground flex-shrink-0">{count}</span>
    </button>
  );
}

/** Tiêu đề nhóm PHÒNG BAN bên trong nhóm công ty (chỉ super_admin). */
function DeptSubHeader({ label, count, pending, open, onToggle }: {
  label: string; count: number; pending: number; open: boolean; onToggle: () => void;
}) {
  return (
    <button type="button" onClick={onToggle}
      className="w-full flex items-center gap-2 border-b border-white/[0.04] pl-7 pr-3 py-1.5 text-left hover:bg-white/[0.03] transition-colors"
      style={{ background: 'var(--secondary)' }}>
      {open ? <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
      <Users className="h-3 w-3 text-indigo-400 flex-shrink-0" />
      <span className="text-[11px] font-600 text-foreground truncate">{label}</span>
      {pending > 0 && (
        <span className="inline-flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-700 text-white flex-shrink-0">{pending}</span>
      )}
      <span className="ml-auto text-[10px] font-600 text-muted-foreground flex-shrink-0">{count}</span>
    </button>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

export default function DuyetCongClient() {
  const toast = useToast();
  const confirm = useConfirm();
  const [tab,        setTab]        = useState<'bu_cong' | 'tang_ca' | 'nghi_phep'>('bu_cong');
  const [lvPending,  setLvPending]  = useState(0);
  const [userRole,   setUserRole]   = useState('');
  const [userId,     setUserId]     = useState('');
  const [userPerms,  setUserPerms]  = useState('{}');

  // Bù Công state
  const [adjItems,   setAdjItems]   = useState<Adjustment[]>([]);
  const [adjView,    setAdjView]    = useState<'all' | 'team' | 'self' | null>(null);
  const [adjSel,     setAdjSel]     = useState<Adjustment | null>(null);
  const [adjLoading, setAdjLoading] = useState(true);
  const [adjError,   setAdjError]   = useState(false);
  const [adjFilter,  setAdjFilter]  = useState('pending');
  const [adjTypeFilter, setAdjTypeFilter] = useState('all');
  const [showArchive, setShowArchive] = useState(false); // hiện cả lệnh cũ (>60 ngày) đã xử lý
  const [adjNote,    setAdjNote]    = useState('');
  const [adjReview,  setAdjReview]  = useState(false);

  // Modal xác nhận hủy dùng chung
  const [revokeModal, setRevokeModal] = useState<{
    title: string;
    onConfirm: (reason: string) => void;
  } | null>(null);
  const [revokeReason, setRevokeReason] = useState('');

  // Tăng Ca state
  const [otItems,    setOtItems]    = useState<Overtime[]>([]);
  const [otView,     setOtView]     = useState<'all' | 'team' | 'self' | null>(null);
  const [otSel,      setOtSel]      = useState<Overtime | null>(null);
  const [otLoading,  setOtLoading]  = useState(true);
  const [otError,    setOtError]    = useState(false);
  const [otFilter,   setOtFilter]   = useState('pending');
  const [otNote,     setOtNote]     = useState('');
  const [otReview,   setOtReview]   = useState(false);

  // ── Duyệt hàng loạt (multi-select) ──
  const [adjSelIds,    setAdjSelIds]    = useState<Set<string>>(new Set());
  const [otSelIds,     setOtSelIds]     = useState<Set<string>>(new Set());
  const [bulkBusy,     setBulkBusy]     = useState(false);

  // Nhóm phòng ban/công ty đang MỞ (mặc định thu gọn hết cho đỡ scroll).
  const [adjOpenGroups, setAdjOpenGroups] = useState<Set<string>>(new Set());
  const [otOpenGroups,  setOtOpenGroups]  = useState<Set<string>>(new Set());
  const toggleGroup = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, label: string) =>
    setter(prev => { const n = new Set(prev); n.has(label) ? n.delete(label) : n.add(label); return n; });
  // Nhóm phòng ban con đang ĐÓNG (mặc định mở hết khi mở nhóm công ty).
  const [adjClosedSubs, setAdjClosedSubs] = useState<Set<string>>(new Set());
  const [otClosedSubs,  setOtClosedSubs]  = useState<Set<string>>(new Set());
  const [bulkReject,   setBulkReject]   = useState<'adj' | 'ot' | null>(null);
  const [bulkRejNote,  setBulkRejNote]  = useState('');

  // ── Duyệt / từ chối nhanh 1 yêu cầu ngay trên danh sách ──
  const [quickBusyId,  setQuickBusyId]  = useState<string | null>(null);
  const [quickReject,  setQuickReject]  = useState<{ kind: 'adj' | 'ot'; id: string; name: string | null } | null>(null);
  const [quickRejNote, setQuickRejNote] = useState('');

  // ── Soi mâu thuẫn (cảnh báo cho người duyệt) ──
  const [conflicts, setConflicts] = useState<Record<string, Conflict[]>>({});
  const cflOf = useCallback(
    (uid: string, date: string): Conflict[] => conflicts[`${uid}|${String(date).slice(0, 10)}`] ?? [],
    [conflicts],
  );
  const hasRed = useCallback(
    (uid: string, date: string) => cflOf(uid, date).some(c => c.severity === 'red'),
    [cflOf],
  );
  /** Nếu có cảnh báo đỏ → hỏi xác nhận trước khi duyệt. Trả false nếu user hủy. */
  const confirmIfRed = useCallback(async (uid: string, date: string, label = 'duyệt'): Promise<boolean> => {
    const reds = cflOf(uid, date).filter(c => c.severity === 'red');
    if (reds.length === 0) return true;
    return confirm({
      title: 'Đề xuất có cảnh báo mâu thuẫn?',
      message: `Đề xuất này có CẢNH BÁO MÂU THUẪN: ${reds.map(c => c.message).join('; ')}. Bạn đã kiểm tra và vẫn muốn ${label}?`,
      confirmLabel: 'Vẫn duyệt',
      danger: true,
    });
  }, [confirm, cflOf]);
  /** Ghi chú tự động khi DUYỆT bất chấp cảnh báo đỏ — để truy vết. */
  const redNote = useCallback((uid: string, date: string): string | undefined => {
    const reds = cflOf(uid, date).filter(c => c.severity === 'red');
    return reds.length ? `[Lưu ý] Duyệt dù có cảnh báo: ${reds.map(c => c.message).join('; ')}` : undefined;
  }, [cflOf]);

  useEffect(() => {
    const stored = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (stored) {
      try {
        const u = JSON.parse(stored);
        setUserRole(u.role ?? '');
        setUserId(u.id ?? '');
        setUserPerms(JSON.stringify(u.module_permissions ?? {}));
      } catch { /* empty */ }
    }
  }, []);

  // Fetch Bù Công
  const fetchAdj = useCallback(async () => {
    if (!userId) return;
    setAdjLoading(true);
    setAdjError(false);
    try {
      const params = new URLSearchParams();
      if (adjFilter !== 'all') params.set('status', adjFilter);
      const res  = await fetch(`/api/attendance/adjustments?${params}`, {
        headers: { 'x-current-user-role': userRole, 'x-current-user-id': userId },
      });
      const json = await res.json();
      if (json.success) { setAdjItems(json.data); setAdjView(json.view ?? null); }
      else setAdjError(true);
    } catch { setAdjError(true); } finally { setAdjLoading(false); }
  }, [userId, userRole, adjFilter]);

  // Fetch Tăng Ca
  const fetchOT = useCallback(async () => {
    if (!userId) return;
    setOtLoading(true);
    setOtError(false);
    try {
      const params = new URLSearchParams();
      if (otFilter !== 'all') params.set('status', otFilter);
      const res  = await fetch(`/api/attendance/overtime?${params}`, {
        headers: { 'x-current-user-role': userRole, 'x-current-user-id': userId },
      });
      const json = await res.json();
      if (json.success) { setOtItems(json.data); setOtView(json.view ?? null); }
      else setOtError(true);
    } catch { setOtError(true); } finally { setOtLoading(false); }
  }, [userId, userRole, otFilter]);

  const fetchLvPending = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch('/api/leave/requests?status=pending', {
        headers: { 'x-current-user-role': userRole, 'x-current-user-id': userId },
      });
      const json = await res.json();
      if (json.success) setLvPending(Array.isArray(json.data) ? json.data.length : 0);
    } catch {
      // Keep the current badge value if the lightweight count refresh fails.
    }
  }, [userId, userRole]);

  useEffect(() => { fetchAdj(); }, [fetchAdj]);
  useEffect(() => { fetchOT();  }, [fetchOT]);
  useEffect(() => { fetchLvPending(); }, [fetchLvPending]);

  // Hủy Bù Công đã duyệt
  function handleAdjRevoke() {
    if (!adjSel || adjReview) return;
    setRevokeReason('');
    setRevokeModal({
      title: `Hủy bù công của ${adjSel.user_name}`,
      onConfirm: async (reason) => {
        setAdjReview(true);
        try {
          const res = await fetch(`/api/attendance/adjustments/${adjSel.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-current-user-role': userRole, 'x-current-user-id': userId },
            body: JSON.stringify({ action: 'cancelled', review_note: reason }),
          });
          const json = await res.json();
          if (json.success) {
            setAdjSel(prev => prev ? { ...prev, status: 'cancelled' } : null);
            fetchAdj();
          } else {
            toast.error(json.error ?? 'Không hủy được');
          }
        } finally { setAdjReview(false); }
      },
    });
  }

  // Hủy Tăng Ca đã duyệt
  function handleOTRevoke() {
    if (!otSel || otReview) return;
    setRevokeReason('');
    setRevokeModal({
      title: `Hủy tăng ca của ${otSel.user_name}`,
      onConfirm: async (reason) => {
        setOtReview(true);
        try {
          const res = await fetch(`/api/attendance/overtime/${otSel.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-current-user-role': userRole, 'x-current-user-id': userId },
            body: JSON.stringify({ action: 'cancelled', review_note: reason }),
          });
          const json = await res.json();
          if (json.success) {
            setOtSel(prev => prev ? { ...prev, status: 'cancelled' } : null);
            fetchOT();
          } else {
            toast.error(json.error ?? 'Không hủy được');
          }
        } finally { setOtReview(false); }
      },
    });
  }

  // Duyệt Bù Công
  async function handleAdjReview(action: 'approved' | 'rejected') {
    if (!adjSel || adjReview) return;
    if (action === 'approved' && !(await confirmIfRed(adjSel.user_id, adjSel.work_date))) return;
    const reviewNote = action === 'approved'
      ? (redNote(adjSel.user_id, adjSel.work_date) ?? (adjNote.trim() || undefined))
      : (adjNote.trim() || undefined);
    setAdjReview(true);
    try {
      const res = await fetch(`/api/attendance/adjustments/${adjSel.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-current-user-role': userRole,
          'x-current-user-id':   userId,
        },
        body: JSON.stringify({ action, review_note: reviewNote }),
      });
      const json = await res.json();
      if (json.success) {
        setAdjSel(prev => prev ? { ...prev, status: action, review_note: adjNote } : null);
        setAdjNote('');
        toast.success(action === 'approved' ? 'Đã duyệt yêu cầu bù công' : 'Đã từ chối yêu cầu bù công');
        fetchAdj();
      } else {
        toast.error(json.error ?? 'Thao tác thất bại, vui lòng thử lại');
      }
    } catch {
      toast.error('Lỗi kết nối, vui lòng thử lại');
    } finally { setAdjReview(false); }
  }

  // Duyệt Tăng Ca
  async function handleOTReview(action: 'approved' | 'rejected') {
    if (!otSel || otReview) return;
    if (action === 'approved' && !(await confirmIfRed(otSel.user_id, otSel.work_date))) return;
    const reviewNote = action === 'approved'
      ? (redNote(otSel.user_id, otSel.work_date) ?? (otNote.trim() || undefined))
      : (otNote.trim() || undefined);
    setOtReview(true);
    try {
      const res = await fetch(`/api/attendance/overtime/${otSel.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-current-user-role': userRole,
          'x-current-user-id':   userId,
        },
        body: JSON.stringify({ action, review_note: reviewNote }),
      });
      const json = await res.json();
      if (json.success) {
        setOtSel(prev => prev ? { ...prev, status: action, review_note: otNote } : null);
        setOtNote('');
        toast.success(action === 'approved' ? 'Đã duyệt yêu cầu tăng ca' : 'Đã từ chối yêu cầu tăng ca');
        fetchOT();
      } else {
        toast.error(json.error ?? 'Thao tác thất bại, vui lòng thử lại');
      }
    } catch {
      toast.error('Lỗi kết nối, vui lòng thử lại');
    } finally { setOtReview(false); }
  }

  // ── Bù Công: chọn nhiều + duyệt hàng loạt ──
  function toggleAdjSel(id: string) {
    setAdjSelIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAllAdj(ids: string[]) {
    setAdjSelIds(prev => {
      const allSelected = ids.length > 0 && ids.every(id => prev.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  }
  async function handleAdjBulk(action: 'approved' | 'rejected', note?: string) {
    const ids = [...adjSelIds];
    if (ids.length === 0 || bulkBusy) return;
    if (action === 'approved') {
      const reds = ids.map(id => adjItems.find(x => x.id === id)).filter((x): x is Adjustment => !!x)
        .filter(it => hasRed(it.user_id, it.work_date)).length;
      const extra = reds ? ` Trong đó ${reds} đề xuất có cảnh báo mâu thuẫn.` : '';
      if (!(await confirm({ title: 'Duyệt hàng loạt?', message: `Duyệt ${ids.length} yêu cầu bù công đã chọn?${extra}`, confirmLabel: 'Duyệt', danger: !!reds }))) return;
    }
    setBulkBusy(true);
    try {
      const { ok, fail } = await bulkReview({
        ids,
        endpoint: id => `/api/attendance/adjustments/${id}`,
        headers: { 'x-current-user-role': userRole, 'x-current-user-id': userId },
        body: { action, review_note: note?.trim() || undefined },
      });
      setAdjSelIds(new Set());
      markBulkRejClean();
      setBulkReject(null);
      setBulkRejNote('');
      if (adjSel && ids.includes(adjSel.id)) setAdjSel(null);
      await fetchAdj();
      toast.success(`Đã ${action === 'approved' ? 'duyệt' : 'từ chối'} ${ok} yêu cầu${fail ? `, ${fail} lỗi` : ''}`);
    } finally { setBulkBusy(false); }
  }

  // ── Tăng Ca: chọn nhiều + duyệt hàng loạt ──
  function toggleOtSel(id: string) {
    setOtSelIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAllOt(ids: string[]) {
    setOtSelIds(prev => {
      const allSelected = ids.length > 0 && ids.every(id => prev.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  }
  async function handleOtBulk(action: 'approved' | 'rejected', note?: string) {
    const ids = [...otSelIds];
    if (ids.length === 0 || bulkBusy) return;
    if (action === 'approved') {
      const reds = ids.map(id => otItems.find(x => x.id === id)).filter((x): x is Overtime => !!x)
        .filter(it => hasRed(it.user_id, it.work_date)).length;
      const extra = reds ? ` Trong đó ${reds} khai báo có cảnh báo mâu thuẫn.` : '';
      if (!(await confirm({ title: 'Duyệt hàng loạt?', message: `Duyệt ${ids.length} khai báo tăng ca đã chọn?${extra}`, confirmLabel: 'Duyệt', danger: !!reds }))) return;
    }
    setBulkBusy(true);
    try {
      const { ok, fail } = await bulkReview({
        ids,
        endpoint: id => `/api/attendance/overtime/${id}`,
        headers: { 'x-current-user-role': userRole, 'x-current-user-id': userId },
        body: { action, review_note: note?.trim() || undefined },
      });
      setOtSelIds(new Set());
      markBulkRejClean();
      setBulkReject(null);
      setBulkRejNote('');
      if (otSel && ids.includes(otSel.id)) setOtSel(null);
      await fetchOT();
      toast.success(`Đã ${action === 'approved' ? 'duyệt' : 'từ chối'} ${ok} khai báo${fail ? `, ${fail} lỗi` : ''}`);
    } finally { setBulkBusy(false); }
  }

  // ── Duyệt / từ chối nhanh 1 yêu cầu trên danh sách (không cần mở chi tiết) ──
  async function quickReviewAdj(id: string, action: 'approved' | 'rejected', note?: string) {
    if (quickBusyId) return;
    const it = adjItems.find(x => x.id === id);
    if (action === 'approved' && it && !(await confirmIfRed(it.user_id, it.work_date))) return;
    const reviewNote = action === 'approved' && it
      ? (redNote(it.user_id, it.work_date) ?? (note?.trim() || undefined))
      : (note?.trim() || undefined);
    setQuickBusyId(id);
    try {
      const res = await fetch(`/api/attendance/adjustments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-current-user-role': userRole, 'x-current-user-id': userId },
        body: JSON.stringify({ action, review_note: reviewNote }),
      });
      const json = await res.json();
      if (!json.success) { toast.error(json.error ?? 'Thao tác thất bại'); return; }
      setAdjSelIds(prev => { const n = new Set(prev); n.delete(id); return n; });
      if (adjSel?.id === id) setAdjSel(prev => prev ? { ...prev, status: action } : null);
      await fetchAdj();
    } catch { toast.error('Lỗi kết nối, vui lòng thử lại'); }
    finally { setQuickBusyId(null); }
  }
  async function quickReviewOt(id: string, action: 'approved' | 'rejected', note?: string) {
    if (quickBusyId) return;
    const it = otItems.find(x => x.id === id);
    if (action === 'approved' && it && !(await confirmIfRed(it.user_id, it.work_date))) return;
    const reviewNote = action === 'approved' && it
      ? (redNote(it.user_id, it.work_date) ?? (note?.trim() || undefined))
      : (note?.trim() || undefined);
    setQuickBusyId(id);
    try {
      const res = await fetch(`/api/attendance/overtime/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-current-user-role': userRole, 'x-current-user-id': userId },
        body: JSON.stringify({ action, review_note: reviewNote }),
      });
      const json = await res.json();
      if (!json.success) { toast.error(json.error ?? 'Thao tác thất bại'); return; }
      setOtSelIds(prev => { const n = new Set(prev); n.delete(id); return n; });
      if (otSel?.id === id) setOtSel(prev => prev ? { ...prev, status: action } : null);
      await fetchOT();
    } catch { toast.error('Lỗi kết nối, vui lòng thử lại'); }
    finally { setQuickBusyId(null); }
  }

  // Bỏ chọn khi đổi tab/bộ lọc để tránh thao tác trên id đã ẩn
  useEffect(() => { setAdjSelIds(new Set()); }, [adjFilter, adjTypeFilter, tab]);
  useEffect(() => { setOtSelIds(new Set()); }, [otFilter, tab]);

  // Soi mâu thuẫn cho các yêu cầu đang chờ duyệt (cả bù công + tăng ca).
  useEffect(() => {
    if (!userId) return;
    const items = [
      ...adjItems.filter(i => i.status === 'pending').map(i => ({ userId: i.user_id, date: i.work_date })),
      ...otItems.filter(i => i.status === 'pending').map(i => ({ userId: i.user_id, date: i.work_date })),
    ];
    if (items.length === 0) { setConflicts({}); return; }
    let alive = true;
    fetch('/api/attendance/conflicts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-current-user-id': userId },
      body: JSON.stringify({ items }),
    }).then(r => r.json()).then(j => { if (alive && j.success) setConflicts(j.data ?? {}); }).catch(() => {});
    return () => { alive = false; };
  }, [adjItems, otItems, userId]);

  // Lưu trữ: ẩn lệnh ĐÃ XỬ LÝ (duyệt/từ chối) cũ hơn 60 ngày khỏi màn duyệt cho gọn.
  // Pending luôn hiện; bật "Lưu trữ" → hiện lại tất cả. KHÔNG đụng dữ liệu (chuyên cần vẫn đủ).
  const RECENT_MS = 60 * 86400000;
  const passArchive = (it: { status: string; reviewed_at: string | null }) => {
    if (showArchive) return true;
    if (it.status === 'pending') return true;
    if (!it.reviewed_at) return true;
    return Date.now() - new Date(it.reviewed_at).getTime() <= RECENT_MS;
  };

  const adjFiltered = adjItems.filter(i =>
    (adjTypeFilter === 'all' || i.adjustment_type === adjTypeFilter) && passArchive(i)
  );
  const otFiltered = otItems.filter(passArchive);
  const adjPending  = adjItems.filter(i => i.status === 'pending').length;
  const otPending   = otItems.filter(i => i.status === 'pending').length;
  // Số lệnh cũ đang bị ẩn (để nhắc có nút Lưu trữ)
  const adjArchivedCount = adjItems.filter(i => i.status !== 'pending' && i.reviewed_at && Date.now() - new Date(i.reviewed_at).getTime() > RECENT_MS).length;
  const otArchivedCount  = otItems.filter(i => i.status !== 'pending' && i.reviewed_at && Date.now() - new Date(i.reviewed_at).getTime() > RECENT_MS).length;

  // Id đang chờ duyệt trong khung nhìn hiện tại (để chọn-tất-cả)
  const adjPendingIds = adjFiltered.filter(i => i.status === 'pending').map(i => i.id);
  const otPendingIds  = otItems.filter(i => i.status === 'pending').map(i => i.id);
  const adjAllSelected = adjPendingIds.length > 0 && adjPendingIds.every(id => adjSelIds.has(id));
  const otAllSelected  = otPendingIds.length > 0 && otPendingIds.every(id => otSelIds.has(id));
  const totalPending = adjPending + otPending + lvPending;

  // ── UX modal (ESC + cảnh báo thay đổi chưa lưu) cho 4 modal nhập liệu ──
  const closeBulkReject = useCallback(() => setBulkReject(null), []);
  const { markDirty: markBulkRejDirty, markClean: markBulkRejClean, guardedClose: guardedCloseBulkReject } = useUnsavedGuard(closeBulkReject);
  useEscapeKey(guardedCloseBulkReject, !!bulkReject);

  const closeQuickReject = useCallback(() => setQuickReject(null), []);
  const { markDirty: markQuickRejDirty, markClean: markQuickRejClean, guardedClose: guardedCloseQuickReject } = useUnsavedGuard(closeQuickReject);
  useEscapeKey(guardedCloseQuickReject, !!quickReject);

  const closeRevoke = useCallback(() => setRevokeModal(null), []);
  const { markDirty: markRevokeDirty, markClean: markRevokeClean, guardedClose: guardedCloseRevoke } = useUnsavedGuard(closeRevoke);
  useEscapeKey(guardedCloseRevoke, !!revokeModal);

  // Kiểm tra quyền dựa vào `view` trả về từ API
  // view === 'self' → API trả về dữ liệu của chính mình → không phải trang dành cho người này
  const isAdmin    = userRole === 'super_admin' || userRole === 'admin';
  const hasLoaded  = !adjLoading && !otLoading;
  const hasNoTeam  = hasLoaded && !isAdmin && adjView === 'self' && otView === 'self';

  if (userRole && hasNoTeam) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <AlertCircle className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm font-500">Không có nhân viên trực thuộc</p>
        <p className="text-xs mt-1 opacity-60">Bạn chưa được gán làm Quản Lý Trực Tiếp của ai</p>
      </div>
    );
  }

  const STATUS_FILTERS = [
    { v: 'pending',  l: 'Chờ duyệt' },
    { v: 'approved', l: 'Đã duyệt'  },
    { v: 'rejected', l: 'Từ chối'   },
    { v: 'all',      l: 'Tất cả'    },
  ];

  return (
    <div className="space-y-5 animate-fadeIn">

      {/* ── Header ── */}
      <div>
        <Link href="/duyet-yeu-cau" className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Duyệt Yêu Cầu
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-700 text-foreground">Duyệt Công</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Xét duyệt đề xuất bù công và tăng ca của nhân viên
            </p>
          </div>
          {totalPending > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2">
              <Clock className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-600 text-amber-300">{totalPending} chờ duyệt</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs: Bù Công / Tăng Ca ── */}
      <div className="flex gap-2 border-b border-line">
        <button
          onClick={() => setTab('bu_cong')}
          className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-600 transition-colors ${
            tab === 'bu_cong'
              ? 'border-b-2 border-indigo-500 text-indigo-400'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <FilePlus className="h-4 w-4" />
          Bù Công
          {adjPending > 0 && (
            <span className="ml-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-700 text-white">
              {adjPending}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('tang_ca')}
          className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-600 transition-colors ${
            tab === 'tang_ca'
              ? 'border-b-2 border-violet-500 text-violet-400'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Timer className="h-4 w-4" />
          Tăng Ca
          {otPending > 0 && (
            <span className="ml-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-700 text-white">
              {otPending}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('nghi_phep')}
          className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-600 transition-colors ${
            tab === 'nghi_phep'
              ? 'border-b-2 border-teal-500 text-teal-400'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <CalendarDays className="h-4 w-4" />
          Nghỉ Phép
          {lvPending > 0 && (
            <span className="ml-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-700 text-white">
              {lvPending}
            </span>
          )}
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════ */}
      {/* TAB: NGHỈ PHÉP                                         */}
      {/* ══════════════════════════════════════════════════════ */}
      {tab === 'nghi_phep' && (
        <NghiPhepTab userId={userId} userRole={userRole} onPendingChange={setLvPending} />
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* TAB: BÙ CÔNG                                          */}
      {/* ══════════════════════════════════════════════════════ */}
      {tab === 'bu_cong' && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map(({ v, l }) => (
              <button key={v} onClick={() => setAdjFilter(v)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-600 transition-colors ${
                  adjFilter === v ? 'border-indigo-500/60 bg-indigo-500/20 text-indigo-300' : 'border-line text-muted-foreground hover:bg-hover'
                }`}>{l}</button>
            ))}
            <button onClick={() => setShowArchive(s => !s)}
              title="Hiện/ẩn các lệnh đã xử lý cũ hơn 60 ngày (dữ liệu vẫn được lưu, chuyên cần không đổi)"
              className={`inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-600 transition-colors ${
                showArchive ? 'border-amber-500/60 bg-amber-500/20 text-amber-300' : 'border-line text-muted-foreground hover:bg-hover'
              }`}>
              🗄️ Lưu trữ{!showArchive && adjArchivedCount > 0 ? ` (${adjArchivedCount})` : ''}
            </button>
            <div className="w-px bg-hover-strong mx-1" />
            {[['all','Tất cả loại'],['bu_cong','Bù Công'],['bu_cong_dac_biet','Bù Công Đặc Thù'],['bu_checkin','Bù Giờ Vào'],['bu_checkout','Bù Giờ Ra'],['cong_tac','Công Tác'],['wfh','Làm Việc Tại Nhà'],['lam_theo_ca','Làm Theo Ca']].map(([v,l]) => (
              <button key={v} onClick={() => setAdjTypeFilter(v)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-600 transition-colors ${
                  adjTypeFilter === v ? 'border-indigo-500/60 bg-indigo-500/20 text-indigo-300' : 'border-line text-muted-foreground hover:bg-hover'
                }`}>{l}</button>
            ))}
          </div>

          {/* Thanh duyệt hàng loạt */}
          {adjSelIds.size > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-2.5">
              <span className="text-sm font-600 text-indigo-300">Đã chọn {adjSelIds.size} yêu cầu</span>
              <div className="flex gap-2">
                <button onClick={() => { setBulkRejNote(''); setBulkReject('adj'); }} disabled={bulkBusy}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-600 text-red-400 hover:bg-red-500/20 disabled:opacity-40 transition-colors">
                  <XCircle className="h-3.5 w-3.5" /> Từ chối
                </button>
                <button onClick={() => handleAdjBulk('approved')} disabled={bulkBusy}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-600 text-white disabled:opacity-40 transition-colors">
                  {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Duyệt {adjSelIds.size}
                </button>
                <button onClick={() => setAdjSelIds(new Set())} disabled={bulkBusy}
                  className="btn-ghost rounded-xl px-3 py-1.5 text-xs font-600 disabled:opacity-40">Bỏ chọn</button>
              </div>
            </div>
          )}

          {/* Split layout */}
          <div className="grid grid-cols-1 lg:grid-cols-[350px_1fr] gap-4">
            {/* LEFT — List */}
            <div className="rounded-2xl border border-line-subtle overflow-hidden flex flex-col" style={{ background: 'var(--card)', maxHeight: '75vh' }}>
              <div className="border-b border-line-subtle px-4 py-3 flex-shrink-0 flex items-center justify-between gap-2">
                <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider">{adjFiltered.length} yêu cầu</p>
                {adjPendingIds.length > 0 && (
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                    <input type="checkbox" checked={adjAllSelected} onChange={() => toggleAllAdj(adjPendingIds)} className="h-3.5 w-3.5 accent-indigo-500" />
                    Chọn tất cả ({adjPendingIds.length})
                  </label>
                )}
              </div>
              <div className="overflow-y-auto flex-1">
                {adjLoading ? (
                  <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : adjError ? (
                  <ErrorState onRetry={fetchAdj} />
                ) : adjFiltered.length === 0 ? (
                  <div className="flex flex-col items-center py-12 text-muted-foreground">
                    <FileText className="h-8 w-8 mb-2 opacity-30" />
                    <p className="text-sm">Không có yêu cầu nào</p>
                  </div>
                ) : groupByOrg(adjFiltered, userRole).map(group => {
                  const open = adjOpenGroups.has(group.label);
                  const pending = group.items.filter(i => i.status === 'pending').length;
                  return (
                  <div key={group.label}>
                    <OrgGroupHeader label={group.label} count={group.items.length} pending={pending} role={userRole} open={open} onToggle={() => toggleGroup(setAdjOpenGroups, group.label)} />
                    {open && subGroupByDept(group.items, userRole).map(sub => {
                    const subKey = `${group.label}|${sub.label}`;
                    const subOpen = sub.label === null || !adjClosedSubs.has(subKey);
                    return (
                    <div key={sub.label ?? '__all'}>
                    {sub.label !== null && (
                      <DeptSubHeader label={sub.label} count={sub.items.length}
                        pending={sub.items.filter(i => i.status === 'pending').length}
                        open={subOpen} onToggle={() => toggleGroup(setAdjClosedSubs, subKey)} />
                    )}
                    {subOpen && sub.items.map(item => {
                  const typeCfg   = ADJ_TYPE_LABEL[item.adjustment_type] ?? ADJ_TYPE_FALLBACK;
                  const statusCfg = STATUS_CFG[item.status];
                  const selectable = item.status === 'pending';
                  return (
                    <div key={item.id}
                      className={`flex items-stretch border-b border-white/[0.04] last:border-0 ${adjSel?.id === item.id ? 'bg-indigo-500/10 border-l-2 border-l-indigo-500' : ''}`}
                    >
                      {selectable && (
                        <label className="flex items-center pl-3 cursor-pointer" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={adjSelIds.has(item.id)} onChange={() => toggleAdjSel(item.id)} className="h-4 w-4 accent-indigo-500" />
                        </label>
                      )}
                    <button onClick={() => { setAdjSel(item); setAdjNote(''); }}
                      className="flex-1 min-w-0 text-left px-4 py-3.5 hover:bg-white/[0.03] transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 h-9 w-9 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs font-700 text-indigo-400">
                          {getInitials(item.user_name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-600 text-foreground truncate">{item.user_name ?? 'Unknown'}</p>
                            <span className={`flex-shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-600 ${statusCfg.color}`}>
                              {statusCfg.icon}{statusCfg.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-600 ${typeCfg.color}`}>{typeCfg.label}</span>
                            <span className="text-xs text-muted-foreground">{fmtDate(item.work_date)}</span>
                            <ConflictPill items={cflOf(item.user_id, item.work_date)} />
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 truncate">{item.reason}</p>
                          <p className="text-[10px] text-muted-foreground opacity-60 mt-0.5">{timeAgo(item.created_at)}</p>
                        </div>
                      </div>
                    </button>
                    {selectable && (
                      <div className="flex flex-col justify-center gap-1.5 pr-2.5">
                        <button onClick={(e) => { e.stopPropagation(); void quickReviewAdj(item.id, 'approved'); }}
                          disabled={quickBusyId === item.id} title="Duyệt nhanh"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 transition-colors">
                          {quickBusyId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setQuickRejNote(''); setQuickReject({ kind: 'adj', id: item.id, name: item.user_name }); }}
                          disabled={quickBusyId === item.id} title="Từ chối"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-40 transition-colors">
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
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
            </div>

            {/* RIGHT — Detail */}
            <div>
              {!adjSel ? (
                <div className="rounded-2xl border border-line-subtle flex flex-col items-center justify-center py-24 text-muted-foreground" style={{ background: 'var(--card)' }}>
                  <FileText className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm">Chọn một yêu cầu để xem chi tiết</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
                  <div className="border-b border-line-subtle px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-full bg-indigo-500/20 flex items-center justify-center text-sm font-700 text-indigo-400">
                        {getInitials(adjSel.user_name)}
                      </div>
                      <div>
                        <p className="text-base font-700 text-foreground">{adjSel.user_name}</p>
                        <p className="text-xs text-muted-foreground">{adjSel.user_email}</p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-600 ${STATUS_CFG[adjSel.status].color}`}>
                      {STATUS_CFG[adjSel.status].icon}{STATUS_CFG[adjSel.status].label}
                    </span>
                  </div>

                  <div className="p-6 space-y-5">
                    <ConflictBanner items={cflOf(adjSel.user_id, adjSel.work_date)} />
                    <div className="grid grid-cols-2 gap-4">
                      <InfoCard label="Loại yêu cầu">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-600 ${(ADJ_TYPE_LABEL[adjSel.adjustment_type] ?? ADJ_TYPE_FALLBACK).color}`}>
                          {(ADJ_TYPE_LABEL[adjSel.adjustment_type] ?? ADJ_TYPE_FALLBACK).label}
                        </span>
                      </InfoCard>
                      <InfoCard label="Ngày làm">
                        <span className="text-sm font-600 text-foreground">{fmtDate(adjSel.work_date)}</span>
                      </InfoCard>
                      {adjSel.requested_checkin && (
                        <InfoCard label="Giờ vào đề xuất">
                          <span className="text-sm font-600 text-emerald-400">{fmtTime(adjSel.requested_checkin)}</span>
                        </InfoCard>
                      )}
                      {adjSel.requested_checkout && (
                        <InfoCard label="Giờ ra đề xuất">
                          <span className="text-sm font-600 text-amber-400">{fmtTime(adjSel.requested_checkout)}</span>
                        </InfoCard>
                      )}
                      <InfoCard label="Gửi lúc">
                        <span className="text-sm text-foreground">{new Date(adjSel.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</span>
                      </InfoCard>
                    </div>

                    <div>
                      <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider mb-2">Lý Do</p>
                      <div className="rounded-xl border border-line-subtle p-4" style={{ background: 'var(--secondary)' }}>
                        <p className="text-sm text-foreground leading-relaxed">{adjSel.reason}</p>
                      </div>
                    </div>

                    {(adjSel.status === 'approved' || adjSel.status === 'rejected') && (
                      <div className={`rounded-xl border p-4 ${adjSel.status === 'approved' ? 'border-emerald-500/30 bg-emerald-500/8' : 'border-red-500/30 bg-red-500/8'}`}>
                        <p className="text-xs font-600 text-muted-foreground mb-1">
                          {adjSel.status === 'approved' ? '✅ Đã duyệt bởi' : '❌ Từ chối bởi'} {adjSel.reviewer_name}
                          {adjSel.reviewed_at && <span className="ml-2 opacity-60">{new Date(adjSel.reviewed_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</span>}
                        </p>
                        {adjSel.review_note && <p className="text-sm text-foreground">{adjSel.review_note}</p>}
                      </div>
                    )}

                    {adjSel.status === 'pending' && (
                      <div className="space-y-3 pt-2 border-t border-line-subtle">
                        <div>
                          <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Ghi chú từ chối (nếu cần)</label>
                          <textarea value={adjNote} onChange={e => setAdjNote(e.target.value)} placeholder="Nhập lý do từ chối..." rows={2}
                            className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500/60 focus:outline-none resize-none" />
                        </div>
                        <div className="flex gap-3">
                          <button onClick={() => handleAdjReview('rejected')} disabled={adjReview}
                            className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-600 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-40">
                            {adjReview ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Từ Chối
                          </button>
                          <button onClick={() => handleAdjReview('approved')} disabled={adjReview}
                            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-sm font-600 text-white transition-colors disabled:opacity-40">
                            {adjReview ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Duyệt Ngay
                          </button>
                        </div>
                      </div>
                    )}
                    {adjSel.status === 'approved' && (
                      <div className="pt-2 border-t border-line-subtle">
                        <button onClick={handleAdjRevoke} disabled={adjReview}
                          className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-600 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-40">
                          {adjReview ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Hủy Bù Công Đã Duyệt
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* TAB: TĂNG CA                                          */}
      {/* ══════════════════════════════════════════════════════ */}
      {tab === 'tang_ca' && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map(({ v, l }) => (
              <button key={v} onClick={() => setOtFilter(v)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-600 transition-colors ${
                  otFilter === v ? 'border-violet-500/60 bg-violet-500/20 text-violet-300' : 'border-line text-muted-foreground hover:bg-hover'
                }`}>{l}</button>
            ))}
            <button onClick={() => setShowArchive(s => !s)}
              title="Hiện/ẩn các lệnh đã xử lý cũ hơn 60 ngày (dữ liệu vẫn được lưu)"
              className={`inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-600 transition-colors ${
                showArchive ? 'border-amber-500/60 bg-amber-500/20 text-amber-300' : 'border-line text-muted-foreground hover:bg-hover'
              }`}>
              🗄️ Lưu trữ{!showArchive && otArchivedCount > 0 ? ` (${otArchivedCount})` : ''}
            </button>
          </div>

          {/* Thanh duyệt hàng loạt */}
          {otSelIds.size > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2.5">
              <span className="text-sm font-600 text-violet-300">Đã chọn {otSelIds.size} khai báo</span>
              <div className="flex gap-2">
                <button onClick={() => { setBulkRejNote(''); setBulkReject('ot'); }} disabled={bulkBusy}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-600 text-red-400 hover:bg-red-500/20 disabled:opacity-40 transition-colors">
                  <XCircle className="h-3.5 w-3.5" /> Từ chối
                </button>
                <button onClick={() => handleOtBulk('approved')} disabled={bulkBusy}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-600 text-white disabled:opacity-40 transition-colors">
                  {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Duyệt {otSelIds.size}
                </button>
                <button onClick={() => setOtSelIds(new Set())} disabled={bulkBusy}
                  className="btn-ghost rounded-xl px-3 py-1.5 text-xs font-600 disabled:opacity-40">Bỏ chọn</button>
              </div>
            </div>
          )}

          {/* Split layout */}
          <div className="grid grid-cols-1 lg:grid-cols-[350px_1fr] gap-4">
            {/* LEFT — List */}
            <div className="rounded-2xl border border-line-subtle overflow-hidden flex flex-col" style={{ background: 'var(--card)', maxHeight: '75vh' }}>
              <div className="border-b border-line-subtle px-4 py-3 flex-shrink-0 flex items-center justify-between gap-2">
                <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider">{otItems.length} yêu cầu</p>
                {otPendingIds.length > 0 && (
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                    <input type="checkbox" checked={otAllSelected} onChange={() => toggleAllOt(otPendingIds)} className="h-3.5 w-3.5 accent-violet-500" />
                    Chọn tất cả ({otPendingIds.length})
                  </label>
                )}
              </div>
              <div className="overflow-y-auto flex-1">
                {otLoading ? (
                  <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : otError ? (
                  <ErrorState onRetry={fetchOT} />
                ) : otItems.length === 0 ? (
                  <div className="flex flex-col items-center py-12 text-muted-foreground">
                    <Timer className="h-8 w-8 mb-2 opacity-30" />
                    <p className="text-sm">Không có yêu cầu nào</p>
                  </div>
                ) : groupByOrg(otFiltered, userRole).map(group => {
                  const open = otOpenGroups.has(group.label);
                  const pending = group.items.filter(i => i.status === 'pending').length;
                  return (
                  <div key={group.label}>
                    <OrgGroupHeader label={group.label} count={group.items.length} pending={pending} role={userRole} open={open} onToggle={() => toggleGroup(setOtOpenGroups, group.label)} />
                    {open && subGroupByDept(group.items, userRole).map(sub => {
                    const subKey = `${group.label}|${sub.label}`;
                    const subOpen = sub.label === null || !otClosedSubs.has(subKey);
                    return (
                    <div key={sub.label ?? '__all'}>
                    {sub.label !== null && (
                      <DeptSubHeader label={sub.label} count={sub.items.length}
                        pending={sub.items.filter(i => i.status === 'pending').length}
                        open={subOpen} onToggle={() => toggleGroup(setOtClosedSubs, subKey)} />
                    )}
                    {subOpen && sub.items.map(item => {
                  const statusCfg = STATUS_CFG[item.status];
                  const totalH    = Number(item.evening_hours) + Number(item.night_hours);
                  const selectable = item.status === 'pending';
                  return (
                    <div key={item.id}
                      className={`flex items-stretch border-b border-white/[0.04] last:border-0 ${otSel?.id === item.id ? 'bg-violet-500/10 border-l-2 border-l-violet-500' : ''}`}
                    >
                      {selectable && (
                        <label className="flex items-center pl-3 cursor-pointer" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={otSelIds.has(item.id)} onChange={() => toggleOtSel(item.id)} className="h-4 w-4 accent-violet-500" />
                        </label>
                      )}
                    <button onClick={() => { setOtSel(item); setOtNote(''); }}
                      className="flex-1 min-w-0 text-left px-4 py-3.5 hover:bg-white/[0.03] transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 h-9 w-9 rounded-full bg-violet-500/20 flex items-center justify-center text-xs font-700 text-violet-400">
                          {getInitials(item.user_name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-600 text-foreground truncate">{item.user_name ?? 'Unknown'}</p>
                            <span className={`flex-shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-600 ${statusCfg.color}`}>
                              {statusCfg.icon}{statusCfg.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="inline-flex rounded-full border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-600 text-violet-400">
                              ⏰ {item.start_time}–{item.end_time}
                            </span>
                            <span className="text-xs text-muted-foreground">{fmtDate(item.work_date)}</span>
                            <ConflictPill items={cflOf(item.user_id, item.work_date)} />
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs font-600 text-violet-400">{fmtOTHours(totalH)}</span>
                            {Number(item.evening_hours) > 0 && <span className="text-[10px] text-orange-400">{isSpecialDaytimeLabel(item.work_date, item.start_time, Number(item.evening_hours)) ? '🌤 ' : '🌆 '}{fmtOTHours(Number(item.evening_hours))}</span>}
                            {Number(item.night_hours)   > 0 && <span className="text-[10px] text-indigo-400">🌙{fmtOTHours(Number(item.night_hours))}</span>}
                          </div>
                          <p className="text-[10px] text-muted-foreground opacity-60 mt-0.5">{timeAgo(item.created_at)}</p>
                        </div>
                      </div>
                    </button>
                    {selectable && (
                      <div className="flex flex-col justify-center gap-1.5 pr-2.5">
                        <button onClick={(e) => { e.stopPropagation(); void quickReviewOt(item.id, 'approved'); }}
                          disabled={quickBusyId === item.id} title="Duyệt nhanh"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 transition-colors">
                          {quickBusyId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setQuickRejNote(''); setQuickReject({ kind: 'ot', id: item.id, name: item.user_name }); }}
                          disabled={quickBusyId === item.id} title="Từ chối"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-40 transition-colors">
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
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
            </div>

            {/* RIGHT — Detail */}
            <div>
              {!otSel ? (
                <div className="rounded-2xl border border-line-subtle flex flex-col items-center justify-center py-24 text-muted-foreground" style={{ background: 'var(--card)' }}>
                  <Timer className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm">Chọn một khai báo tăng ca để xem chi tiết</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
                  <div className="border-b border-line-subtle px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-full bg-violet-500/20 flex items-center justify-center text-sm font-700 text-violet-400">
                        {getInitials(otSel.user_name)}
                      </div>
                      <div>
                        <p className="text-base font-700 text-foreground">{otSel.user_name}</p>
                        <p className="text-xs text-muted-foreground">{fmtDate(otSel.work_date)}</p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-600 ${STATUS_CFG[otSel.status].color}`}>
                      {STATUS_CFG[otSel.status].icon}{STATUS_CFG[otSel.status].label}
                    </span>
                  </div>

                  <div className="p-6 space-y-5">
                    <ConflictBanner items={cflOf(otSel.user_id, otSel.work_date)} />
                    {/* Thông tin tăng ca */}
                    <div className="grid grid-cols-2 gap-4">
                      <InfoCard label="Giờ tăng ca">
                        <span className="text-sm font-600 text-violet-400">{otSel.start_time} – {otSel.end_time}</span>
                      </InfoCard>
                      <InfoCard label="Tổng giờ">
                        <span className="text-sm font-700 text-violet-400">
                          {fmtOTHours(Number(otSel.evening_hours) + Number(otSel.night_hours))}
                        </span>
                      </InfoCard>
                      {Number(otSel.evening_hours) > 0 && (
                        <InfoCard label={isSpecialDaytimeLabel(otSel.work_date, otSel.start_time, Number(otSel.evening_hours)) ? '🌤 Tăng ca ngày nghỉ / lễ' : '🌆 Khung tối (17:30–22:00)'}>
                          <span className="text-sm font-600 text-orange-400">{fmtOTHours(Number(otSel.evening_hours))}</span>
                        </InfoCard>
                      )}
                      {Number(otSel.night_hours) > 0 && (
                        <InfoCard label="🌙 Khung đêm (22:00–07:00)">
                          <span className="text-sm font-600 text-indigo-400">{fmtOTHours(Number(otSel.night_hours))}</span>
                        </InfoCard>
                      )}
                      <InfoCard label="Gửi lúc">
                        <span className="text-sm text-foreground">{new Date(otSel.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</span>
                      </InfoCard>
                    </div>

                    {otSel.reason && (
                      <div>
                        <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider mb-2">Lý Do</p>
                        <div className="rounded-xl border border-line-subtle p-4" style={{ background: 'var(--secondary)' }}>
                          <p className="text-sm text-foreground leading-relaxed">{otSel.reason}</p>
                        </div>
                      </div>
                    )}

                    {(otSel.status === 'approved' || otSel.status === 'rejected') && (
                      <div className={`rounded-xl border p-4 ${otSel.status === 'approved' ? 'border-emerald-500/30 bg-emerald-500/8' : 'border-red-500/30 bg-red-500/8'}`}>
                        <p className="text-xs font-600 text-muted-foreground mb-1">
                          {otSel.status === 'approved' ? '✅ Đã duyệt bởi' : '❌ Từ chối bởi'} {otSel.reviewer_name}
                          {otSel.reviewed_at && <span className="ml-2 opacity-60">{new Date(otSel.reviewed_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</span>}
                        </p>
                        {otSel.review_note && <p className="text-sm text-foreground">{otSel.review_note}</p>}
                      </div>
                    )}

                    {otSel.status === 'pending' && (
                      <div className="space-y-3 pt-2 border-t border-line-subtle">
                        <div>
                          <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Ghi chú từ chối (nếu cần)</label>
                          <textarea value={otNote} onChange={e => setOtNote(e.target.value)} placeholder="Nhập lý do từ chối..." rows={2}
                            className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-violet-500/60 focus:outline-none resize-none" />
                        </div>
                        <div className="flex gap-3">
                          <button onClick={() => handleOTReview('rejected')} disabled={otReview}
                            className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-600 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-40">
                            {otReview ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Từ Chối
                          </button>
                          <button onClick={() => handleOTReview('approved')} disabled={otReview}
                            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-sm font-600 text-white transition-colors disabled:opacity-40">
                            {otReview ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Duyệt Ngay
                          </button>
                        </div>
                      </div>
                    )}
                    {otSel.status === 'approved' && (
                      <div className="pt-2 border-t border-line-subtle">
                        <button onClick={handleOTRevoke} disabled={otReview}
                          className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-600 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-40">
                          {otReview ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Hủy Tăng Ca Đã Duyệt
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Modal từ chối hàng loạt ── */}
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
                Từ chối <span className="font-600 text-foreground">{bulkReject === 'adj' ? adjSelIds.size : otSelIds.size}</span> {bulkReject === 'adj' ? 'yêu cầu bù công' : 'khai báo tăng ca'} đã chọn. Ghi chú sẽ áp dụng cho tất cả.
              </p>
              <div>
                <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Ghi chú từ chối (tùy chọn)</label>
                <textarea value={bulkRejNote} onChange={e => setBulkRejNote(e.target.value)} placeholder="Nhập lý do từ chối..." rows={3} autoFocus
                  className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-red-500/60 focus:outline-none resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
              <button onClick={guardedCloseBulkReject} disabled={bulkBusy} className="btn-ghost rounded-xl px-4 py-2 text-sm disabled:opacity-40">Đóng</button>
              <button
                disabled={bulkBusy}
                onClick={() => bulkReject === 'adj' ? handleAdjBulk('rejected', bulkRejNote) : handleOtBulk('rejected', bulkRejNote)}
                className="inline-flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-2 text-sm font-600 text-red-400 hover:bg-red-500/25 disabled:opacity-40 transition-colors">
                {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Từ chối tất cả
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal từ chối nhanh 1 yêu cầu ── */}
      {quickReject && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) guardedCloseQuickReject(); }}>
          <div className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl border border-line overflow-hidden sheet-up sm:animate-fadeIn"
            style={{ background: 'var(--card)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
              <h2 className="text-base font-700 text-foreground">Từ Chối Yêu Cầu</h2>
              <button onClick={guardedCloseQuickReject} className="btn-ghost rounded-lg p-1.5">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4" onChange={markQuickRejDirty}>
              <p className="text-sm text-muted-foreground">
                Từ chối {quickReject.kind === 'adj' ? 'yêu cầu bù công' : 'khai báo tăng ca'} của <span className="font-600 text-foreground">{quickReject.name ?? 'nhân viên'}</span>.
              </p>
              <div>
                <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Lý do từ chối (tùy chọn)</label>
                <textarea value={quickRejNote} onChange={e => setQuickRejNote(e.target.value)} placeholder="Nhập lý do từ chối..." rows={3} autoFocus
                  className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-red-500/60 focus:outline-none resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
              <button onClick={guardedCloseQuickReject} disabled={!!quickBusyId} className="btn-ghost rounded-xl px-4 py-2 text-sm disabled:opacity-40">Đóng</button>
              <button
                disabled={!!quickBusyId}
                onClick={() => {
                  const { kind, id } = quickReject;
                  const note = quickRejNote;
                  markQuickRejClean();
                  setQuickReject(null);
                  setQuickRejNote('');
                  void (kind === 'adj' ? quickReviewAdj : quickReviewOt)(id, 'rejected', note);
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-2 text-sm font-600 text-red-400 hover:bg-red-500/25 disabled:opacity-40 transition-colors">
                {quickBusyId ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Từ chối
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal duyệt Bảng Công ── */}
      {/* ── Modal xác nhận hủy dùng chung ── */}
      {revokeModal && (
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
              <p className="text-sm text-muted-foreground">{revokeModal.title}</p>
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
                disabled={!revokeReason.trim()}
                onClick={() => {
                  const cb = revokeModal.onConfirm;
                  markRevokeClean();
                  setRevokeModal(null);
                  cb(revokeReason.trim());
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-2 text-sm font-600 text-red-400 hover:bg-red-500/25 disabled:opacity-40 transition-colors">
                <XCircle className="h-4 w-4" /> Xác nhận hủy
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
