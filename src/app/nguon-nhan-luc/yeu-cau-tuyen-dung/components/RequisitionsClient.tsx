'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { usePersistentView } from '@/hooks/usePersistentView';
import Link from 'next/link';
import MoneyInput from '@/components/ui/MoneyInput';
import {
  Loader2, ArrowLeft, ClipboardList, Plus, X, Pencil, Trash2, AlertTriangle, Clock, Users2,
  CheckCircle2, PauseCircle, PlayCircle, Archive, RotateCcw, Check, Ban, ShieldCheck,
  LayoutGrid, Columns, Table2, Copy, MessageSquare, Send, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  DollarSign, Funnel, Search, UserPlus, Star, History, Eye,
} from 'lucide-react';
import {
  listRequisitions, createRequisition, updateRequisition, deleteRequisition,
  acceptRequisition, rejectRequisition, approveRequisition, uploadAttachment,
  cloneRequisition, listComments, addComment,
  listRequisitionHistory, toggleFollowRequisition, RequisitionAuditEntry,
  listRequisitionCandidates, RequisitionCandidate,
  Requisition, RequisitionComment, REQ_STATUS_LABELS, REQ_PRIORITY_LABELS, ReqStatus,
  calcDaysUntilClose,
} from '@/lib/api/requisitionApi';
import { JdPicker, AttachmentsPanel } from '@/components/RequisitionExtras';
import { RequisitionQuickView, FollowButton, RequisitionPeopleLines } from '@/components/RequisitionQuickView';
import { loadOrgData, searchCvs, linkRequisition, CvItem } from '@/lib/api/onboardingApi';
import { getCurrentUser } from '@/lib/authStore';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { STAGE_MAP, avatarFor } from '@/app/nguon-nhan-luc/kho-ung-vien/components/candidateShared';
import RequesterCandidateDrawer from '@/app/yeu-cau-tuyen-dung/components/RequesterCandidateDrawer';
import DateInputVN from '@/components/ui/DateInputVN';
import { useToast } from '@/context/ToastContext';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import ErrorState from '@/components/ui/ErrorState';

type Org = Awaited<ReturnType<typeof loadOrgData>>;
const STATUSES: ReqStatus[] = ['pending_approval', 'pending', 'open', 'on_hold', 'filled', 'cancelled', 'rejected'];
const MODAL_STATUSES: ReqStatus[] = ['open', 'on_hold', 'filled', 'cancelled'];

// Phạm vi hiển thị: việc đang xử lý vs việc đã đóng (giữ cho báo cáo, ẩn khỏi màn làm việc).
const ACTIVE_STATUSES: ReqStatus[] = ['pending_approval', 'pending', 'open', 'on_hold'];
const CLOSED_STATUSES: ReqStatus[] = ['filled', 'cancelled', 'rejected'];
type Scope = 'active' | 'closed' | 'all';
const SCOPE_STATUSES: Record<Scope, ReqStatus[]> = {
  active: ACTIVE_STATUSES,
  closed: CLOSED_STATUSES,
  all: STATUSES,
};

const SALARY_TYPE_LABELS: Record<string, string> = {
  gross: 'Gross', net: 'Net', negotiable: 'Thỏa thuận',
};

function fmtSalary(min?: number | null, max?: number | null, type?: string | null): string | null {
  if (!min && !max) return null;
  const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}tr` : `${(n / 1_000).toFixed(0)}k`;
  const range = min && max ? `${fmt(min)} – ${fmt(max)}` : min ? `≥ ${fmt(min)}` : `≤ ${fmt(max!)}`;
  return `${range} ${SALARY_TYPE_LABELS[type || 'negotiable'] || ''}`.trim();
}

function authH(): Record<string, string> {
  const h: Record<string, string> = {};
  if (typeof window !== 'undefined') {
    try {
      const u = JSON.parse(localStorage.getItem('assetflow_auth') || '{}');
      if (u.id) h['x-current-user-id'] = u.id;
      if (u.role) h['x-current-user-role'] = u.role;
      if (u.module_permissions) h['x-user-permissions'] = JSON.stringify(u.module_permissions);
    } catch { /* noop */ }
  }
  return h;
}

/**
 * Quyền phê duyệt yêu cầu tuyển dụng:
 *   - super_admin: luôn được.
 *   - admin: phải có quyền 'approve' trong module 'hr-requisitions'.
 * (Phải khớp với kiểm tra server-side ở route /approve.)
 */
function useCanApprove() {
  const [can, setCan] = useState(false);
  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('assetflow_auth') || '{}');
      if (u.role === 'super_admin') { setCan(true); return; }
      const perms = u.module_permissions?.['hr-requisitions'];
      setCan(u.role === 'admin' && Array.isArray(perms) && perms.includes('approve'));
    } catch { setCan(false); }
  }, []);
  return can;
}

// ── SLA badge ──────────────────────────────────────────────────────────────────
function SlaBadge({ targetCloseDate, status }: { targetCloseDate: string | null; status: ReqStatus }) {
  if (!targetCloseDate || !['open', 'on_hold', 'pending'].includes(status)) return null;
  const days = calcDaysUntilClose(targetCloseDate);
  if (days === null) return null;
  if (days < 0) return (
    <span className="inline-flex items-center gap-0.5 rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-2xs font-600 text-rose-400">
      <AlertTriangle className="h-2.5 w-2.5" /> Quá hạn {Math.abs(days)}n
    </span>
  );
  if (days <= 3) return (
    <span className="inline-flex items-center gap-0.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-2xs font-600 text-rose-300">
      <Clock className="h-2.5 w-2.5" /> Còn {days}n
    </span>
  );
  if (days <= 7) return (
    <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-2xs font-600 text-amber-400">
      <Clock className="h-2.5 w-2.5" /> Còn {days}n
    </span>
  );
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full border border-line bg-hover px-2 py-0.5 text-2xs text-muted-foreground">
      <Clock className="h-2.5 w-2.5" /> Còn {days}n
    </span>
  );
}

// ── Pipeline mini funnel ───────────────────────────────────────────────────────
function PipelineMini({ r }: { r: Requisition }) {
  const stages = [
    { label: 'Tìm', value: r.cnt_sourcing ?? 0, color: 'bg-indigo-500' },
    { label: 'CV', value: r.cnt_screening ?? 0, color: 'bg-sky-500' },
    { label: 'PV', value: r.cnt_interview ?? 0, color: 'bg-amber-500' },
    { label: 'Offer', value: r.cnt_offer ?? 0, color: 'bg-emerald-500' },
  ];
  const hasAny = stages.some(s => s.value > 0);
  if (!hasAny) return null;
  return (
    <div className="flex items-center gap-1.5 mt-2">
      {stages.map(s => (
        <div key={s.label} className="flex items-center gap-1">
          <div className={`h-1.5 w-1.5 rounded-full ${s.color} opacity-80`} />
          <span className="text-2xs text-muted-foreground">{s.label}: <b className="text-foreground">{s.value}</b></span>
        </div>
      ))}
    </div>
  );
}

// ── Comment panel ──────────────────────────────────────────────────────────────
function CommentPanel({ reqId }: { reqId: string }) {
  const [comments, setComments] = useState<RequisitionComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    listComments(reqId).then(setComments).catch(() => {}).finally(() => setLoading(false));
  }, [reqId]);

  const submit = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      const c = await addComment(reqId, text.trim());
      setComments(prev => [...prev, c]);
      setText('');
    } catch { /* noop */ } finally { setSending(false); }
  };

  return (
    <div className="space-y-2">
      {loading ? (
        <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : comments.length === 0 ? (
        <p className="text-2xs text-muted-foreground text-center py-1">Chưa có ghi chú</p>
      ) : (
        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
          {comments.map(c => (
            <div key={c.id} className="text-2xs">
              <span className="font-600 text-foreground">{c.user_name || 'Ẩn danh'}</span>
              <span className="text-muted-foreground ml-1.5">{new Date(c.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              <p className="text-foreground/80 mt-0.5 leading-relaxed">{c.content}</p>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 items-end">
        <textarea
          value={text} onChange={e => setText(e.target.value)}
          rows={2} placeholder="Ghi chú tiến độ, cập nhật..."
          className="flex-1 px-2.5 py-1.5 rounded-xl text-2xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 resize-none"
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(); }}
        />
        <button onClick={submit} disabled={sending || !text.trim()}
          className="h-8 w-8 flex items-center justify-center rounded-xl btn-indigo disabled:opacity-40 shrink-0">
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

/** Pop-up "Ghi chú & Tiến độ" — mở/đóng không ảnh hưởng chiều cao thẻ (thay vì giãn thẻ ra như trước). */
function CommentModal({ reqId, title, onClose }: { reqId: string; title: string; onClose: () => void }) {
  useEscapeKey(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full max-w-md max-h-[85vh] flex flex-col rounded-3xl border border-white/10" style={{ background: 'var(--card)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line-subtle px-5 py-4 shrink-0">
          <div className="min-w-0">
            <p className="text-sm font-700 text-foreground flex items-center gap-1.5"><MessageSquare className="h-4 w-4" /> Ghi chú &amp; Tiến độ</p>
            <p className="text-2xs text-muted-foreground truncate mt-0.5">{title}</p>
          </div>
          <button onClick={onClose} className="btn-ghost rounded-lg p-2.5 -m-1 shrink-0"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          <CommentPanel reqId={reqId} />
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function RequisitionsClient() {
  const toast = useToast();
  const canApprove = useCanApprove();

  const [items, setItems] = useState<Requisition[]>([]);
  const [org, setOrg] = useState<Org | null>(null);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [scope, setScope] = useState<Scope>('active');
  const [statusFilter, setStatusFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [viewMode, setViewMode] = usePersistentView('requisitions_view_mode', ['card', 'kanban', 'table'] as const, 'card');
  const [editing, setEditing] = useState<Requisition | null>(null);
  const [viewing, setViewing] = useState<Requisition | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Requisition | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Requisition | null>(null);
  // ESC đóng hộp xác nhận xóa (chỉ khi đang mở).
  useEscapeKey(() => setConfirmDel(null), !!confirmDel);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    setError(false);
    try { setItems(await listRequisitions()); } catch (e) { console.error(e); setError(true); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    loadOrgData().then(setOrg).catch(() => toast.error('Không tải được dữ liệu tổ chức (công ty/phòng ban), vui lòng thử lại'));
    fetch('/api/hr/recruiters', { headers: authH() })
      .then(r => r.json()).then(d => {
        const arr = Array.isArray(d?.data) ? d.data : [];
        setUsers(arr.map((u: any) => ({ id: String(u.id), name: u.name })));
      }).catch(() => toast.error('Không tải được danh sách người phụ trách, vui lòng thử lại'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Danh sách trạng thái thuộc phạm vi hiện tại + đếm số việc đã đóng để hiện badge.
  const scopeStatuses = SCOPE_STATUSES[scope];
  const closedCount = useMemo(() => items.filter(i => CLOSED_STATUSES.includes(i.status)).length, [items]);

  const filtered = useMemo(() => {
    let list = items.filter(i => scopeStatuses.includes(i.status));
    if (statusFilter) list = list.filter(i => i.status === statusFilter);
    if (companyFilter) list = list.filter(i => (i.company_id || '') === companyFilter);
    if (deptFilter) list = list.filter(i => (i.department_id || '') === deptFilter);
    if (ownerFilter) list = list.filter(i => ownerFilter === 'unassigned' ? !i.owner_id : String(i.owner_id || '') === ownerFilter);
    return list;
  }, [items, scopeStatuses, statusFilter, companyFilter, deptFilter, ownerFilter]);

  const filterOwners = useMemo(() => {
    const options = new Map(users.map(u => [u.id, u.name]));
    items.forEach(i => {
      if (i.owner_id && !options.has(String(i.owner_id))) {
        options.set(String(i.owner_id), i.owner_name || 'Người phụ trách chưa cập nhật tên');
      }
    });
    return Array.from(options, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }, [users, items]);

  const filterDepts = useMemo(
    () => (org && companyFilter ? org.departments.filter(d => d.company_id === companyFilter) : []),
    [org, companyFilter]
  );

  const boardItems = useMemo(() => {
    let list = items.filter(i => scopeStatuses.includes(i.status));
    if (companyFilter) list = list.filter(i => (i.company_id || '') === companyFilter);
    if (deptFilter) list = list.filter(i => (i.department_id || '') === deptFilter);
    if (ownerFilter) list = list.filter(i => ownerFilter === 'unassigned' ? !i.owner_id : String(i.owner_id || '') === ownerFilter);
    return list;
  }, [items, scopeStatuses, companyFilter, deptFilter, ownerFilter]);

  const changeStatus = async (r: Requisition, status: ReqStatus) => {
    try { onSaved(await updateRequisition(r.id, { status })); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Lỗi cập nhật'); }
  };
  const accept = async (r: Requisition) => {
    try { onSaved(await acceptRequisition(r.id)); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Lỗi tiếp nhận'); }
  };
  const approve = async (r: Requisition) => {
    try { onSaved(await approveRequisition(r.id)); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Lỗi phê duyệt'); }
  };
  const doClone = async (r: Requisition) => {
    try { onSaved(await cloneRequisition(r)); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Lỗi nhân bản'); }
  };

  const toggleComments = useCallback((id: string) => {
    setExpandedComments(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const stats = useMemo(() => {
    const needApproval = items.filter(i => i.status === 'pending_approval').length;
    const open = items.filter(i => i.status === 'open' || i.status === 'on_hold');
    const totalTarget = open.reduce((a, b) => a + b.target_headcount, 0);
    const totalFilled = open.reduce((a, b) => a + b.filled_count, 0);
    const overdue = items.filter(i => {
      const d = calcDaysUntilClose(i.target_close_date);
      return d !== null && d < 0 && ['open', 'on_hold'].includes(i.status);
    }).length;
    return { openCount: open.length, totalTarget, totalFilled, needApproval, overdue };
  }, [items]);

  const onSaved = (r: Requisition) => {
    setItems(prev => {
      const i = prev.findIndex(x => x.id === r.id);
      if (i >= 0) { const cp = [...prev]; cp[i] = r; return cp; }
      return [r, ...prev];
    });
    setEditing(null); setCreating(false);
    // Modal xem nhanh đang mở cùng bản ghi → cập nhật luôn cho khớp.
    setViewing(v => (v && v.id === r.id ? r : v));
  };

  const doDelete = async () => {
    if (!confirmDel) return;
    try { await deleteRequisition(confirmDel.id); setItems(prev => prev.filter(x => x.id !== confirmDel.id)); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Lỗi'); }
    finally { setConfirmDel(null); }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <Link href="/nguon-nhan-luc" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Tuyển Dụng
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-700 flex items-center gap-2.5">
            <ClipboardList className="h-6 w-6 text-emerald-400" /> Yêu Cầu Tuyển Dụng
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Quản lý nhu cầu tuyển: số lượng cần, người phụ trách, tiến độ</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-accent rounded-xl px-4 py-2 text-sm font-600 flex items-center gap-2 shrink-0">
          <Plus className="h-4 w-4" /> Tạo yêu cầu
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        <Stat icon={ClipboardList} label="Đang tuyển" value={stats.openCount} color="text-emerald-400" bg="bg-emerald-500/15" />
        <Stat icon={Users2} label="Tổng cần tuyển" value={stats.totalTarget} color="text-indigo-400" bg="bg-indigo-500/15" />
        <Stat icon={Clock} label="Đã tuyển được" value={stats.totalFilled} color="text-amber-400" bg="bg-amber-500/15" />
        <Stat icon={AlertTriangle} label="Quá hạn" value={stats.overdue} color="text-rose-400" bg="bg-rose-500/15"
          extra={stats.needApproval > 0 ? <span className="text-2xs text-violet-400 mt-0.5 block">{stats.needApproval} chờ duyệt</span> : undefined} />
      </div>

      {/* Scope: việc đang hoạt động vs đã đóng */}
      <div className="flex items-center gap-1.5 rounded-xl border border-line p-1 w-fit" style={{ background: 'var(--surface-2)' }}>
        {([
          ['active', 'Đang hoạt động', items.filter(i => ACTIVE_STATUSES.includes(i.status)).length],
          ['closed', 'Đã đóng', closedCount],
          ['all', 'Tất cả', items.length],
        ] as const).map(([sc, lbl, cnt]) => (
          <button key={sc} onClick={() => { setScope(sc); setStatusFilter(''); }}
            className={`rounded-lg px-3 py-1.5 text-xs font-600 transition-colors ${scope === sc ? 'bg-indigo-500/20 text-indigo-300' : 'text-muted-foreground hover:text-foreground'}`}>
            {lbl} <span className="opacity-70">({cnt})</span>
          </button>
        ))}
      </div>

      {/* Status filter tabs (trong phạm vi đã chọn) */}
      <div className="flex gap-2 border-b border-line overflow-x-auto">
        <button onClick={() => setStatusFilter('')} className={`px-3 py-2 text-sm font-500 border-b-2 whitespace-nowrap ${!statusFilter ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-muted-foreground'}`}>Tất cả ({boardItems.length})</button>
        {scopeStatuses.map(s => {
          const cnt = items.filter(i => i.status === s).length;
          if (cnt === 0 && statusFilter !== s) return null;
          return (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-2 text-sm font-500 border-b-2 whitespace-nowrap ${statusFilter === s ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-muted-foreground'}`}>
              {REQ_STATUS_LABELS[s].label} ({cnt})
            </button>
          );
        })}
      </div>

      {/* Filters + view toggle */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5">
        <select value={companyFilter} onChange={e => { setCompanyFilter(e.target.value); setDeptFilter(''); }}
          className="h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 sm:w-56">
          <option value="">Tất cả công ty</option>
          {(org?.companies || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} disabled={!companyFilter}
          className="h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-50 sm:w-56">
          <option value="">{companyFilter ? 'Tất cả phòng ban' : '— Chọn công ty trước —'}</option>
          {filterDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} aria-label="Người phụ trách tuyển dụng"
          className="h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 sm:w-64">
          <option value="">Người phụ trách tuyển dụng · Tất cả</option>
          <option value="unassigned">Chưa giao người phụ trách</option>
          {filterOwners.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        {(companyFilter || deptFilter || statusFilter || ownerFilter) && (
          <button onClick={() => { setCompanyFilter(''); setDeptFilter(''); setStatusFilter(''); setOwnerFilter(''); }}
            className="h-10 px-3 rounded-xl btn-ghost border border-line text-xs shrink-0">Xóa lọc</button>
        )}
        <div className="flex items-center gap-2 sm:ml-auto">
          <span className="text-xs text-muted-foreground">{viewMode === 'kanban' ? boardItems.length : filtered.length} yêu cầu</span>
          <div className="flex items-center rounded-xl border border-line p-0.5" style={{ background: 'var(--surface-2)' }}>
            {([['card', LayoutGrid, 'Thẻ'], ['kanban', Columns, 'Kanban'], ['table', Table2, 'Bảng']] as const).map(([m, Icon, lbl]) => (
              <button key={m} onClick={() => setViewMode(m)} title={lbl}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-2xs font-600 transition-colors ${viewMode === m ? 'bg-indigo-500/20 text-indigo-300' : 'text-muted-foreground hover:text-foreground'}`}>
                <Icon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{lbl}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <ErrorState message="Không tải được danh sách yêu cầu tuyển dụng. Vui lòng thử lại." onRetry={load} />
      ) : (viewMode === 'kanban' ? boardItems : filtered).length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <ClipboardList className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Chưa có yêu cầu tuyển dụng</p>
          <p className="text-xs mt-1 opacity-60">Bấm &quot;Tạo yêu cầu&quot; để bắt đầu theo dõi nhu cầu tuyển</p>
        </div>
      ) : viewMode === 'card' ? (
        // Masonry (columns) thay vì grid — thẻ có panel mở rộng (Ứng viên liên kết/Ghi chú) cao thấp
        // khác nhau; grid-cols cứng để lại khoảng trắng lớn dưới thẻ ngắn khi thẻ cùng hàng bị giãn cao.
        <div className="columns-1 sm:columns-2 xl:columns-3 gap-4">
          {filtered.map(r => (
            <div key={r.id} className="mb-4 break-inside-avoid">
              <ReqCard r={r} canApprove={canApprove}
                onView={() => setViewing(r)} onChanged={onSaved}
                showComments={expandedComments.has(r.id)}
                onToggleComments={() => toggleComments(r.id)}
                onEdit={() => setEditing(r)}
                onDelete={() => setConfirmDel(r)}
                onStatus={(s) => changeStatus(r, s)}
                onAccept={() => accept(r)}
                onReject={() => setRejectTarget(r)}
                onApprove={() => approve(r)}
                onClone={() => doClone(r)}
              />
            </div>
          ))}
        </div>
      ) : viewMode === 'kanban' ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {scopeStatuses.map(s => {
            const col = boardItems.filter(i => i.status === s);
            const stt = REQ_STATUS_LABELS[s];
            return (
              <div key={s} className="w-72 shrink-0">
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className={`text-2xs font-700 uppercase tracking-wider ${stt.color.split(' ')[0]}`}>{stt.label}</span>
                  <span className="text-2xs text-muted-foreground bg-hover rounded-full px-1.5">{col.length}</span>
                </div>
                <div className="space-y-3">
                  {col.map(r => (
                    <ReqCard key={r.id} r={r} compact canApprove={canApprove}
                      onView={() => setViewing(r)} onChanged={onSaved}
                      showComments={expandedComments.has(r.id)}
                      onToggleComments={() => toggleComments(r.id)}
                      onEdit={() => setEditing(r)}
                      onDelete={() => setConfirmDel(r)}
                      onStatus={(st2) => changeStatus(r, st2)}
                      onAccept={() => accept(r)}
                      onReject={() => setRejectTarget(r)}
                      onApprove={() => approve(r)}
                      onClone={() => doClone(r)}
                    />
                  ))}
                  {col.length === 0 && <div className="rounded-xl border border-dashed border-line py-8 text-center text-2xs text-muted-foreground">Trống</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <ReqTable items={filtered} canApprove={canApprove}
          onView={(r) => setViewing(r)} onChanged={onSaved}
          onEdit={(r) => setEditing(r)}
          onDelete={(r) => setConfirmDel(r)}
          onStatus={changeStatus}
          onAccept={accept}
          onReject={setRejectTarget}
          onApprove={approve}
          onClone={doClone}
        />
      )}

      {(creating || editing) && org && (
        <RequisitionModal
          req={editing} org={org} users={users}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={onSaved}
        />
      )}

      {viewing && (
        <RequisitionQuickView
          req={viewing}
          onClose={() => setViewing(null)}
          onEdit={() => setEditing(viewing)}
          onChanged={onSaved}
          candidatesSlot={<LinkedCandidatesPanel requisitionId={viewing.id} />}
          actionsSlot={
            <StatusButtons status={viewing.status} canApprove={canApprove}
              onStatus={async (st) => { try { onSaved(await updateRequisition(viewing.id, { status: st })); } catch (e) { toast.error(e instanceof Error ? e.message : 'Lỗi cập nhật'); } }}
              onAccept={() => accept(viewing)}
              onReject={() => { setViewing(null); setRejectTarget(viewing); }}
              onApprove={() => approve(viewing)} />
          }
        />
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setConfirmDel(null)}>
          <div className="w-full max-w-sm rounded-3xl border border-line p-6" style={{ background: 'var(--card)' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-700 text-foreground mb-2">Xóa yêu cầu tuyển dụng?</h3>
            <p className="text-xs text-muted-foreground mb-5">&quot;{confirmDel.title}&quot; sẽ bị xóa khỏi danh sách.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDel(null)} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
              <button onClick={doDelete} className="rounded-xl px-4 py-2 text-sm font-600 text-white bg-red-600 hover:bg-red-700">Xóa</button>
            </div>
          </div>
        </div>
      )}

      {rejectTarget && (
        <RejectModal req={rejectTarget} onClose={() => setRejectTarget(null)} onDone={(r) => { onSaved(r); setRejectTarget(null); }} />
      )}
    </div>
  );
}

// ── Shared helpers ─────────────────────────────────────────────────────────────
function RejectModal({ req, onClose, onDone }: { req: Requisition; onClose: () => void; onDone: (r: Requisition) => void }) {
  useEscapeKey(onClose);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    if (!reason.trim()) { setErr('Vui lòng nhập lý do từ chối'); return; }
    setSaving(true); setErr('');
    try { onDone(await rejectRequisition(req.id, reason.trim())); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Lỗi từ chối'); setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl border border-line overflow-hidden" style={{ background: 'var(--card)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
          <h2 className="text-base font-700 text-foreground">Từ chối yêu cầu tuyển dụng</h2>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-6 space-y-3">
          <p className="text-xs text-muted-foreground">Yêu cầu: <b className="text-foreground">{req.title}</b>. Lý do sẽ được gửi tới người đặt yêu cầu.</p>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4} autoFocus
            placeholder="VD: Vị trí tạm hoãn do điều chỉnh ngân sách..."
            className="w-full px-3 py-2 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 resize-none" />
          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>
        <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
          <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
          <button onClick={submit} disabled={saving} className="rounded-xl px-4 py-2 text-sm font-600 text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Từ chối &amp; thông báo
          </button>
        </div>
      </div>
    </div>
  );
}

function QuickBtn({ onClick, icon: Icon, label, cls }: { onClick: () => void; icon: any; label: string; cls: string }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-2xs font-600 transition-colors ${cls}`}>
      <Icon className="h-3 w-3" /> {label}
    </button>
  );
}

function StatusButtons({ status, canApprove, onStatus, onAccept, onReject, onApprove }: {
  status: ReqStatus; canApprove: boolean; onStatus: (s: ReqStatus) => void; onAccept: () => void; onReject: () => void; onApprove: () => void;
}) {
  const wrap = 'flex flex-wrap gap-1.5';
  if (status === 'pending_approval') {
    return (
      <div className={wrap}>
        {canApprove && <QuickBtn onClick={onApprove} icon={ShieldCheck} label="Phê duyệt" cls="border-violet-500/30 text-violet-300 hover:bg-violet-500/10" />}
        {canApprove && <QuickBtn onClick={onReject} icon={Ban} label="Từ chối" cls="border-rose-500/30 text-rose-300 hover:bg-rose-500/10" />}
        {!canApprove && <span className="text-2xs text-muted-foreground">Chờ Admin phê duyệt</span>}
      </div>
    );
  }
  if (status === 'pending') {
    return (
      <div className={wrap}>
        <QuickBtn onClick={onAccept} icon={Check} label="Tiếp nhận" cls="border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10" />
        <QuickBtn onClick={onReject} icon={Ban} label="Từ chối" cls="border-rose-500/30 text-rose-300 hover:bg-rose-500/10" />
      </div>
    );
  }
  if (status === 'rejected') {
    return (
      <div className={wrap}>
        <QuickBtn onClick={() => onStatus('pending')} icon={RotateCcw} label="Xem xét lại" cls="border-sky-500/30 text-sky-300 hover:bg-sky-500/10" />
      </div>
    );
  }
  return (
    <div className={wrap}>
      {(status === 'open' || status === 'on_hold') && <QuickBtn onClick={() => onStatus('filled')} icon={CheckCircle2} label="Hoàn thành" cls="border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10" />}
      {status === 'open' && <QuickBtn onClick={() => onStatus('on_hold')} icon={PauseCircle} label="Dừng tuyển" cls="border-amber-500/30 text-amber-300 hover:bg-amber-500/10" />}
      {status === 'on_hold' && <QuickBtn onClick={() => onStatus('open')} icon={PlayCircle} label="Tiếp tục" cls="border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10" />}
      {status !== 'cancelled' && <QuickBtn onClick={() => onStatus('cancelled')} icon={Archive} label="Lưu trữ" cls="border-line text-muted-foreground hover:bg-hover" />}
      {status === 'cancelled' && <QuickBtn onClick={() => onStatus('open')} icon={RotateCcw} label="Mở lại" cls="border-sky-500/30 text-sky-300 hover:bg-sky-500/10" />}
    </div>
  );
}

// ── Card ───────────────────────────────────────────────────────────────────────
function ReqCard({ r, compact, canApprove, showComments, onToggleComments, onView, onChanged, onEdit, onDelete, onStatus, onAccept, onReject, onApprove, onClone }: {
  r: Requisition; compact?: boolean; canApprove: boolean;
  showComments: boolean; onToggleComments: () => void;
  onView: () => void; onChanged: (r: Requisition) => void;
  onEdit: () => void; onDelete: () => void;
  onStatus: (s: ReqStatus) => void; onAccept: () => void; onReject: () => void; onApprove: () => void; onClone: () => void;
}) {
  const st = REQ_STATUS_LABELS[r.status]; const pr = REQ_PRIORITY_LABELS[r.priority];
  const pct = r.target_headcount > 0 ? Math.min(100, Math.round((r.filled_count / r.target_headcount) * 100)) : 0;
  const aging = (r.status === 'open' || r.status === 'on_hold') && (r.days_open ?? 0) > 30;
  const salary = fmtSalary(r.salary_min, r.salary_max, r.salary_type);
  const isOverdue = (calcDaysUntilClose(r.target_close_date) ?? 1) < 0 && ['open', 'on_hold'].includes(r.status);

  return (
    <div className={`rounded-2xl border flex flex-col ${isOverdue ? 'border-rose-500/20' : 'border-line-subtle'}`}
      style={{ background: compact ? 'var(--background)' : 'var(--card)' }}>
      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2 mb-2">
          <button onClick={onView} className="min-w-0 text-left group" title="Xem nhanh yêu cầu">
            <p className="text-sm font-600 text-foreground truncate group-hover:text-indigo-300 transition-colors">{r.title}</p>
            <p className="text-2xs text-muted-foreground truncate">{[r.company_name, r.department_name, r.sub_department_name].filter(Boolean).join(' · ') || '—'}</p>
          </button>
          <div className="flex gap-0.5 shrink-0">
            <button onClick={onView} className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-indigo-400" title="Xem nhanh"><Eye className="h-3.5 w-3.5" /></button>
            <FollowButton req={r} onChanged={onChanged} compact />
            <button onClick={onClone} className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-indigo-400" title="Nhân bản"><Copy className="h-3.5 w-3.5" /></button>
            <button onClick={onEdit} className="btn-ghost rounded-lg p-1.5" title="Sửa"><Pencil className="h-3.5 w-3.5" /></button>
            <button onClick={onDelete} className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-red-400" title="Xóa"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {!compact && <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-600 ${st.color}`}>{st.label}</span>}
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-600 ${pr.color}`}>{pr.label}</span>
          {aging && <span className="inline-flex items-center gap-0.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-2xs font-600 text-rose-400"><AlertTriangle className="h-2.5 w-2.5" /> Tồn {r.days_open}n</span>}
          <SlaBadge targetCloseDate={r.target_close_date} status={r.status} />
        </div>

        {salary && (
          <p className="text-2xs text-emerald-400 mb-2 flex items-center gap-1">
            <DollarSign className="h-3 w-3" /> {salary}
          </p>
        )}

        {r.reject_reason && r.status === 'rejected' && (
          <div className="mb-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-2.5 py-1.5">
            <p className="text-2xs text-rose-300"><b>Lý do từ chối:</b> {r.reject_reason}</p>
          </div>
        )}

        <PipelineMini r={r} />

        <RequisitionPeopleLines r={r} />

        <div className="mt-auto pt-2">
          <div className="flex items-center justify-between text-2xs mb-1">
            <span className="text-muted-foreground">Tiến độ: <b className="text-foreground">{r.filled_count}/{r.target_headcount}</b></span>
            <span className="text-muted-foreground truncate ml-2">Phụ trách: {r.owner_name || 'Chưa giao'}</span>
          </div>
          <div className="h-1.5 rounded-full bg-hover overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500/70 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-line-subtle">
          <StatusButtons status={r.status} canApprove={canApprove} onStatus={onStatus} onAccept={onAccept} onReject={onReject} onApprove={onApprove} />
        </div>
      </div>

      {/* Ứng viên liên kết — luôn hiển thị, khung cao cố định (phân trang bên trong thay vì giãn thẻ) */}
      <div className="px-4 pt-3 pb-3 border-t border-line-subtle">
        <LinkedCandidatesPanel requisitionId={r.id} />
      </div>

      {/* Ghi chú & Tiến độ — mở Pop-up, không làm đổi chiều cao thẻ */}
      <button onClick={onToggleComments}
        className="flex w-full items-center justify-between px-4 py-2.5 border-t border-line-subtle text-2xs text-muted-foreground hover:text-foreground hover:bg-hover transition-colors rounded-b-2xl">
        <span className="flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> Ghi chú & Tiến độ</span>
        <ChevronRight className="h-3.5 w-3.5" />
      </button>

      {showComments && (
        <CommentModal reqId={r.id} title={r.title} onClose={onToggleComments} />
      )}
    </div>
  );
}

// ── Table ──────────────────────────────────────────────────────────────────────
function ReqTable({ items, canApprove, onView, onChanged, onEdit, onDelete, onStatus, onAccept, onReject, onApprove, onClone }: {
  items: Requisition[]; canApprove: boolean;
  onView: (r: Requisition) => void; onChanged: (r: Requisition) => void;
  onEdit: (r: Requisition) => void; onDelete: (r: Requisition) => void;
  onStatus: (r: Requisition, s: ReqStatus) => void; onAccept: (r: Requisition) => void;
  onReject: (r: Requisition) => void; onApprove: (r: Requisition) => void; onClone: (r: Requisition) => void;
}) {
  return (
    <div className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line-subtle text-left text-xs text-muted-foreground uppercase tracking-wider">
              <th className="px-4 py-3 font-600">Vị trí</th>
              <th className="px-4 py-3 font-600 hidden md:table-cell">Công ty · Phòng ban</th>
              <th className="px-4 py-3 font-600">Trạng thái</th>
              <th className="px-4 py-3 font-600 hidden lg:table-cell">Lương</th>
              <th className="px-4 py-3 font-600">Tiến độ</th>
              <th className="px-4 py-3 font-600 hidden xl:table-cell">Hạn tuyển</th>
              <th className="px-4 py-3 font-600 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {items.map(r => {
              const isOverdue = (calcDaysUntilClose(r.target_close_date) ?? 1) < 0 && ['open', 'on_hold'].includes(r.status);
              const salary = fmtSalary(r.salary_min, r.salary_max, r.salary_type);
              return (
                <tr key={r.id} className={`border-b border-line-subtle hover:bg-hover ${isOverdue ? 'bg-rose-500/5' : ''}`}>
                  <td className="px-4 py-3 cursor-pointer" onClick={() => onView(r)} title="Xem nhanh yêu cầu">
                    <p className="font-500 text-foreground hover:text-indigo-300 transition-colors">{r.title}</p>
                    <p className="text-2xs text-muted-foreground">Phụ trách: {r.owner_name || 'Chưa giao'}{r.requester_name ? ` · YC: ${r.requester_name}` : ''}</p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{[r.company_name, r.department_name, r.sub_department_name].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-600 ${REQ_STATUS_LABELS[r.status].color}`}>{REQ_STATUS_LABELS[r.status].label}</span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-2xs text-emerald-400">{salary || '—'}</td>
                  <td className="px-4 py-3 text-2xs text-muted-foreground">{r.filled_count}/{r.target_headcount}</td>
                  <td className="px-4 py-3 hidden xl:table-cell">
                    <SlaBadge targetCloseDate={r.target_close_date} status={r.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <StatusButtons status={r.status} canApprove={canApprove} onStatus={(s) => onStatus(r, s)} onAccept={() => onAccept(r)} onReject={() => onReject(r)} onApprove={() => onApprove(r)} />
                      <button onClick={() => onView(r)} className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-indigo-400" title="Xem nhanh"><Eye className="h-3.5 w-3.5" /></button>
                      <FollowButton req={r} onChanged={onChanged} compact />
                      <button onClick={() => onClone(r)} className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-indigo-400" title="Nhân bản"><Copy className="h-3.5 w-3.5" /></button>
                      <button onClick={() => onEdit(r)} className="btn-ghost rounded-lg p-1.5" title="Sửa"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => onDelete(r)} className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-red-400" title="Xóa"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, color, bg, extra }: { icon: any; label: string; value: number; color: string; bg: string; extra?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line-subtle p-4" style={{ background: 'var(--card)' }}>
      <div className={`mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl ${bg}`}><Icon className={`h-4 w-4 ${color}`} /></div>
      <p className="text-2xl font-700 text-foreground">{value}</p>
      <p className="text-2xs text-muted-foreground mt-0.5">{label}</p>
      {extra}
    </div>
  );
}

// ── Modal tạo/sửa ─────────────────────────────────────────────────────────────
const inputCls = 'w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60';
const labelCls = 'block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5';

const CANDIDATES_PAGE_SIZE = 2;

/**
 * Liệt kê ứng viên đã liên kết với yêu cầu — trạng thái THEO VỊ TRÍ (khớp trang người yêu cầu).
 * Khung LUÔN hiển thị (không thu/mở) với chiều cao cố định (đúng CANDIDATES_PAGE_SIZE dòng) —
 * ít/nhiều ứng viên đều không làm đổi cao thẻ, dùng phân trang bên trong khung thay vì giãn ra.
 */
function LinkedCandidatesPanel({ requisitionId }: { requisitionId: string }) {
  const toast = useToast();
  const [items, setItems] = useState<RequisitionCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [openApp, setOpenApp] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    try { setItems(await listRequisitionCandidates(requisitionId)); }
    catch { /* silent */ }
    finally { setLoading(false); }
  }, [requisitionId]);

  useEffect(() => { reload(); }, [reload]);

  const linkedIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const totalPages = Math.max(1, Math.ceil(items.length / CANDIDATES_PAGE_SIZE));
  useEffect(() => { setPage((p) => Math.min(p, totalPages - 1)); }, [totalPages]);
  const visible = items.slice(page * CANDIDATES_PAGE_SIZE, page * CANDIDATES_PAGE_SIZE + CANDIDATES_PAGE_SIZE);

  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-2xs font-600 text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Users2 className="h-3.5 w-3.5" /> Ứng viên liên kết{items.length > 0 ? ` (${items.length})` : ''}
        </label>
        <button
          onClick={() => setAdding((v) => !v)}
          className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-2xs font-600 transition-colors ${adding ? 'border-indigo-500/40 text-indigo-300 bg-indigo-500/10' : 'border-line text-muted-foreground hover:text-indigo-300 hover:border-indigo-500/40'}`}
          title="Thêm nhanh ứng viên từ Kho Ứng Viên"
        >
          {adding ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />} Thêm
        </button>
      </div>

      {adding && (
        <CandidateQuickAdd
          requisitionId={requisitionId}
          linkedIds={linkedIds}
          onLinked={async () => { await reload(); toast.success('Đã liên kết ứng viên vào yêu cầu'); }}
          onError={(m) => toast.error(m)}
        />
      )}

      <div className="mt-1.5 rounded-xl border border-line bg-white/[0.02] p-2.5 min-h-[104px] flex flex-col justify-center">
        {loading ? (
          <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <p className="text-2xs text-muted-foreground/70 py-1 text-center">
            Chưa có ứng viên nào liên kết. Bấm <span className="text-indigo-300">+ Thêm</span> để tìm và gắn ứng viên từ Kho Ứng Viên.
          </p>
        ) : (
          <div className="space-y-1.5">
            {visible.map((cv) => {
              const st = STAGE_MAP[cv.status];
              return (
                <button key={cv.id} onClick={() => setOpenApp(cv.application_id)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-hover transition-colors">
                  <div className="h-7 w-7 rounded-full flex items-center justify-center text-2xs font-700 text-white shrink-0" style={{ background: avatarFor(cv.candidate_name) }}>
                    {cv.candidate_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-600 text-foreground truncate">{cv.candidate_name}</p>
                    <p className="text-2xs text-muted-foreground truncate">{cv.current_title || cv.position_applied || '—'}{cv.years_experience != null ? ` · ${cv.years_experience} năm KN` : ''}</p>
                    {cv.hired_elsewhere && (
                      <p className="text-2xs text-emerald-300/90 truncate mt-0.5">✅ Đã onboard cho vị trí khác: {cv.hired_elsewhere}</p>
                    )}
                  </div>
                  {cv.rating != null && <span className="text-2xs text-amber-300 font-600 shrink-0">★ {cv.rating}</span>}
                  {st && <span className={`rounded-full border px-2 py-0.5 text-2xs font-600 shrink-0 ${st.color}`}>{st.label}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Vùng phân trang LUÔN chiếm chỗ (invisible khi ≤1 trang) — giữ khung cao cố định. */}
      <div className={`mt-1 flex items-center justify-between ${totalPages > 1 ? '' : 'invisible'}`}>
        <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
          className="rounded-lg p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" title="Trang trước">
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="text-2xs text-muted-foreground">Trang {page + 1}/{totalPages}</span>
        <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
          className="rounded-lg p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" title="Trang sau">
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <Link href="/nguon-nhan-luc/kho-ung-vien" className="mt-1 inline-flex items-center gap-1 text-2xs text-indigo-300 hover:text-indigo-200">
        Mở Kho Ứng Viên →
      </Link>
      {openApp && (
        <RequesterCandidateDrawer reqId={requisitionId} appId={openApp}
          onClose={() => setOpenApp(null)} onChanged={reload} />
      )}
    </div>
  );
}

/** Ô tìm nhanh trong Kho Ứng Viên để liên kết ứng viên vào yêu cầu (không rời trang). */
function CandidateQuickAdd({ requisitionId, linkedIds, onLinked, onError }: {
  requisitionId: string;
  linkedIds: Set<string>;
  onLinked: () => void | Promise<void>;
  onError: (msg: string) => void;
}) {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<CvItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  // Debounce tìm kiếm 300ms; từ khoá rỗng → lấy vài ứng viên mới nhất để chọn nhanh.
  useEffect(() => {
    let alive = true;
    setSearching(true);
    const t = setTimeout(() => {
      searchCvs({ keyword: keyword.trim() || undefined, limit: 20 })
        .then((d) => { if (alive) setResults(d); })
        .catch(() => { if (alive) setResults([]); })
        .finally(() => { if (alive) setSearching(false); });
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [keyword]);

  const visible = results.filter((cv) => !linkedIds.has(cv.id));

  async function link(cv: CvItem) {
    setLinkingId(cv.id);
    try {
      await linkRequisition(cv.id, requisitionId);
      await onLinked();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Không liên kết được ứng viên');
    } finally {
      setLinkingId(null);
    }
  }

  return (
    <div className="mt-1.5 rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04] p-2.5">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          autoFocus
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Tìm ứng viên theo tên, vị trí, kỹ năng..."
          className="w-full rounded-lg border border-line bg-[#162033] pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-indigo-500/50 focus:outline-none"
        />
      </div>
      <div className="mt-1.5 max-h-52 overflow-y-auto space-y-1">
        {searching ? (
          <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : visible.length === 0 ? (
          <p className="text-2xs text-muted-foreground/70 py-2 text-center">
            {keyword.trim() ? 'Không tìm thấy ứng viên phù hợp' : 'Chưa có ứng viên nào để thêm'}
          </p>
        ) : (
          visible.map((cv) => (
            <button
              key={cv.id}
              onClick={() => link(cv)}
              disabled={linkingId != null}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-hover disabled:opacity-50"
            >
              <div className="h-7 w-7 rounded-full flex items-center justify-center text-2xs font-700 text-white shrink-0" style={{ background: avatarFor(cv.candidate_name) }}>
                {cv.candidate_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-600 text-foreground truncate">{cv.candidate_name}</p>
                <p className="text-2xs text-muted-foreground truncate">{cv.current_title || cv.position_applied || '—'}{cv.years_experience != null ? ` · ${cv.years_experience} năm KN` : ''}</p>
              </div>
              {linkingId === cv.id
                ? <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-300 shrink-0" />
                : <UserPlus className="h-3.5 w-3.5 text-indigo-300 shrink-0" />}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Chọn NHIỀU người: chip đã chọn + 1 SearchableSelect để thêm từng người.
 * Dùng lại SearchableSelect (có ô tìm, portal chống cắt trong modal) thay vì dựng combobox mới.
 */
function PeopleMultiSelect({ options, values, onChange, placeholder }: {
  options: { value: string; label: string; sublabel?: string }[];
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const chosen = useMemo(
    () => values.map(id => options.find(o => o.value === id) || { value: id, label: 'Người dùng đã nghỉ/khác' }),
    [values, options]
  );
  const remaining = useMemo(() => options.filter(o => !values.includes(o.value)), [options, values]);

  return (
    <div>
      {chosen.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {chosen.map(c => (
            <span key={c.value} className="inline-flex items-center gap-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-2xs text-indigo-200">
              {c.label}
              <button type="button" onClick={() => onChange(values.filter(v => v !== c.value))}
                className="rounded p-0.5 hover:bg-white/10" title="Bỏ chọn">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <SearchableSelect
        options={remaining}
        value={null}
        onChange={(v) => { if (v) onChange([...values, v]); }}
        placeholder={placeholder}
        emptyText="Không còn người để chọn"
      />
    </div>
  );
}

function RequisitionModal({ req, org, users, onClose, onSaved }: {
  req: Requisition | null; org: Org; users: { id: string; name: string }[];
  onClose: () => void; onSaved: (r: Requisition) => void;
}) {
  const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose);
  useEscapeKey(guardedClose);
  const me = useMemo(() => getCurrentUser() as { id?: string; name?: string; role?: string; module_permissions?: Record<string, string[]> } | null, []);
  // "Người xử lý" (HR) được chọn hộ người yêu cầu; người yêu cầu thường thì mặc định là chính họ.
  const isProcessor = useMemo(() => {
    if (!me) return false;
    if (me.role === 'super_admin') return true;
    const perms = me.module_permissions?.['hr-requisitions'];
    return Array.isArray(perms) && (perms.includes('approve') || perms.includes('edit'));
  }, [me]);
  // Danh sách toàn nhân sự (kèm org) để chọn người yêu cầu / người phỏng vấn / người theo dõi.
  // Luôn tải (không chỉ cho người xử lý) vì panel phỏng vấn & người theo dõi ai cũng chọn được.
  type Person = { id: string; name: string; company_id?: string; department_id?: string; sub_department_id?: string };
  const [people, setPeople] = useState<Person[]>([]);
  useEffect(() => {
    fetch('/api/users?status=active&limit=500', { headers: authH() })
      .then(r => r.json())
      .then(j => {
        const arr = Array.isArray(j) ? j : (j.data || j.users || []);
        setPeople(arr.map((u: any) => ({
          id: String(u.id), name: u.name,
          company_id: u.company_id ? String(u.company_id) : '',
          department_id: u.department_id ? String(u.department_id) : '',
          sub_department_id: u.sub_department_id ? String(u.sub_department_id) : '',
        })).filter((u: Person) => u.name));
      })
      .catch(() => {});
  }, []);
  const [f, setF] = useState({
    title: req?.title ?? '',
    requested_by: req?.requested_by ?? (req ? '' : (me?.id ?? '')),
    company_id: req?.company_id ?? '',
    department_id: req?.department_id ?? '',
    sub_department_id: req?.sub_department_id ?? '',
    position_id: req?.position_id ?? '',
    jd_id: req?.jd_id ?? '',
    target_headcount: req?.target_headcount ?? 1,
    filled_count: req?.filled_count ?? 0,
    status: req?.status ?? 'open',
    priority: req?.priority ?? 'normal',
    owner_id: req?.owner_id ?? '',
    open_date: req?.open_date ? req.open_date.slice(0, 10) : new Date().toISOString().slice(0, 10),
    target_close_date: req?.target_close_date ? req.target_close_date.slice(0, 10) : '',
    note: req?.note ?? '',
    salary_min: req?.salary_min != null ? String(req.salary_min) : '',
    salary_max: req?.salary_max != null ? String(req.salary_max) : '',
    salary_type: req?.salary_type ?? 'negotiable',
    budget_code: req?.budget_code ?? '',
    cnt_sourcing: String(req?.cnt_sourcing ?? 0),
    cnt_screening: String(req?.cnt_screening ?? 0),
    cnt_interview: String(req?.cnt_interview ?? 0),
    cnt_offer: String(req?.cnt_offer ?? 0),
    interviewer_ids: req?.interviewer_ids ?? [],
    follower_ids: req?.follower_ids ?? [],
  });
  const [localFiles, setLocalFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const depts = f.company_id ? org.departments.filter(d => d.company_id === f.company_id) : [];
  const subDepts = f.department_id ? (org.subDepartments || []).filter(s => s.department_id === f.department_id) : [];
  const positions = f.company_id ? org.positions.filter(p => p.company_id === f.company_id) : [];
  const set = (k: string, v: any) => setF(p => ({
    ...p, [k]: v,
    ...(k === 'company_id' ? { department_id: '', sub_department_id: '', position_id: '' } : {}),
    ...(k === 'department_id' ? { sub_department_id: '' } : {}),
  }));
  // Ứng viên "người yêu cầu" = người ĐỨNG RA xin tuyển, KHÔNG phải nhân viên của đơn vị được
  // tuyển vào. Vì vậy chỉ lọc theo Công ty; quản lý của bộ phận/phòng ban đang tuyển (và phòng
  // ban cha) được đẩy lên đầu kèm badge để HR chọn nhanh, nhưng vẫn chọn được người khác.
  const requesterOptions = useMemo(() => {
    const dept = org.departments.find(d => d.id === f.department_id) || null;
    const subDept = (org.subDepartments || []).find(s => s.id === f.sub_department_id) || null;
    const parentDept = dept?.parent_department_id
      ? org.departments.find(d => d.id === dept.parent_department_id) || null : null;
    // Ưu tiên từ đơn vị hẹp nhất ra ngoài: bộ phận → phòng ban → phòng ban cha.
    const managerIds = [subDept?.manager_id, dept?.manager_id, parentDept?.manager_id]
      .filter((x): x is string => !!x);

    const deptName = new Map(org.departments.map(d => [d.id, d.name]));
    const subName = new Map((org.subDepartments || []).map(s => [s.id, s.name]));
    const unitOf = (p: Person) =>
      [p.sub_department_id && subName.get(p.sub_department_id), p.department_id && deptName.get(p.department_id)]
        .filter(Boolean).join(' · ') || undefined;

    const inScope = people.filter(p => !f.company_id || p.company_id === f.company_id);
    const rank = (id: string) => { const i = managerIds.indexOf(id); return i === -1 ? managerIds.length : i; };
    return [...inScope]
      .sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name, 'vi'))
      .map(p => ({
        value: p.id, label: p.name, sublabel: unitOf(p),
        badges: managerIds.includes(p.id)
          ? [{ text: 'Quản lý đơn vị', className: 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30' }]
          : undefined,
      }));
  }, [people, org, f.company_id, f.department_id, f.sub_department_id]);

  // Người phỏng vấn: trong công ty của yêu cầu (hội đồng phỏng vấn thuộc công ty đang tuyển).
  // Người theo dõi: TOÀN BỘ nhân sự, không bó theo công ty — người theo dõi có thể ở công ty
  // khác trong tập đoàn (kế toán, ban điều hành...) nên phải chọn được hết.
  const personOptions = useMemo(() => {
    const deptName = new Map(org.departments.map(d => [d.id, d.name]));
    const companyName = new Map(org.companies.map(c => [c.id, c.name]));
    const toOption = (p: Person, withCompany: boolean) => ({
      value: p.id, label: p.name,
      sublabel: [
        (p.department_id && deptName.get(p.department_id)) || null,
        withCompany ? (p.company_id && companyName.get(p.company_id)) || null : null,
      ].filter(Boolean).join(' · ') || undefined,
    });
    const sorted = [...people].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    return {
      interviewers: sorted
        .filter(p => !f.company_id || p.company_id === f.company_id)
        .map(p => toOption(p, false)),
      // Kèm tên công ty trong sublabel để phân biệt người trùng tên giữa các công ty.
      followers: sorted.map(p => toOption(p, true)),
    };
  }, [people, org, f.company_id]);

  const save = async () => {
    if (!f.title.trim()) { setErr('Nhập tên vị trí cần tuyển'); return; }
    if (!f.company_id) { setErr('Chọn công ty'); return; }
    setSaving(true); setErr('');
    try {
      // Pipeline giờ đếm tự động từ ứng viên liên kết → không gửi cnt_* lên nữa
      // (giữ nguyên giá trị cũ trong DB, chỉ dùng làm dự phòng cho yêu cầu chưa có ứng viên).
      const { cnt_sourcing: _cs, cnt_screening: _cr, cnt_interview: _ci, cnt_offer: _co, ...rest } = f;
      const body = {
        ...rest,
        jd_id: f.jd_id || null,
        target_headcount: Number(f.target_headcount),
        filled_count: Number(f.filled_count),
        salary_min: f.salary_min ? Number(f.salary_min) : null,
        salary_max: f.salary_max ? Number(f.salary_max) : null,
        budget_code: f.budget_code || null,
      };
      const saved = req ? await updateRequisition(req.id, body) : await createRequisition(body);
      if (!req && localFiles.length > 0) {
        for (const file of localFiles) await uploadAttachment(saved.id, file).catch(() => {});
      }
      markClean();
      onSaved(saved);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Lỗi lưu'); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={guardedClose}>
      <div className="w-full max-w-xl max-h-[92vh] flex flex-col rounded-3xl border border-line overflow-hidden" style={{ background: 'var(--card)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4 shrink-0">
          <h2 className="text-base font-700 text-foreground">{req ? 'Sửa yêu cầu tuyển dụng' : 'Tạo yêu cầu tuyển dụng'}</h2>
          <button onClick={guardedClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4" onChange={markDirty}>
          {/* Vị trí */}
          <div>
            <label className={labelCls}>Vị trí cần tuyển *</label>
            <input value={f.title} onChange={e => set('title', e.target.value)} placeholder="VD: Nhân viên Kinh doanh" className={inputCls} />
          </div>

          {/* Tổ chức */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Công ty *</label>
              <select value={f.company_id} onChange={e => set('company_id', e.target.value)} className={inputCls}>
                <option value="">— Chọn —</option>
                {org.companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Phòng ban</label>
              <select value={f.department_id} onChange={e => set('department_id', e.target.value)} disabled={!f.company_id} className={`${inputCls} disabled:opacity-50`}>
                <option value="">{f.company_id ? '— Chọn (tùy chọn) —' : '— Chọn công ty trước —'}</option>
                {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Bộ phận</label>
              <select value={f.sub_department_id} onChange={e => set('sub_department_id', e.target.value)} disabled={!f.department_id} className={`${inputCls} disabled:opacity-50`}>
                <option value="">{f.department_id ? '— Chọn (tùy chọn) —' : '— Chọn phòng ban trước —'}</option>
                {subDepts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Chức vụ</label>
              <select value={f.position_id} onChange={e => set('position_id', e.target.value)} disabled={!f.company_id} className={`${inputCls} disabled:opacity-50`}>
                <option value="">{f.company_id ? '— Chọn —' : '— Chọn công ty trước —'}</option>
                {positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Người phụ trách</label>
              <select value={f.owner_id} onChange={e => set('owner_id', e.target.value)} className={inputCls}>
                <option value="">— Chưa giao —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>

          {/* Người yêu cầu */}
          <div>
            <label className={labelCls}>Người yêu cầu</label>
            {isProcessor ? (
              <>
                <SearchableSelect
                  options={requesterOptions}
                  value={f.requested_by || null}
                  onChange={(v) => set('requested_by', v || '')}
                  placeholder="— Gõ để tìm người yêu cầu —"
                />
                <p className="mt-1 text-2xs text-muted-foreground">Bạn đang xử lý — chọn người thực sự yêu cầu (tạo hộ). Quản lý của bộ phận/phòng ban đang tuyển được xếp lên đầu; vẫn chọn được người khác trong công ty. Để trống = ghi nhận bạn.</p>
              </>
            ) : (
              <>
                <input readOnly value={req?.requester_name || me?.name || 'Bạn'} className={`${inputCls} opacity-70 cursor-not-allowed`} />
                <p className="mt-1 text-2xs text-muted-foreground">Yêu cầu này ghi nhận bạn là người yêu cầu.</p>
              </>
            )}
          </div>

          {/* Người phỏng vấn (hội đồng dự kiến) */}
          <div>
            <label className={labelCls}>Người phỏng vấn</label>
            <PeopleMultiSelect
              options={personOptions.interviewers}
              values={f.interviewer_ids}
              onChange={(v) => { set('interviewer_ids', v); markDirty(); }}
              placeholder="— Gõ để thêm người phỏng vấn —"
            />
            <p className="mt-1 text-2xs text-muted-foreground">Hội đồng phỏng vấn dự kiến cho vị trí này. Lịch từng buổi vẫn chọn người riêng khi đặt lịch.</p>
          </div>

          {/* Người theo dõi */}
          <div>
            <label className={labelCls}>Người theo dõi</label>
            <PeopleMultiSelect
              options={personOptions.followers}
              values={f.follower_ids}
              onChange={(v) => { set('follower_ids', v); markDirty(); }}
              placeholder="— Gõ để thêm người theo dõi —"
            />
            <p className="mt-1 text-2xs text-muted-foreground">Người theo dõi tiến độ yêu cầu — chọn được toàn bộ nhân sự, kể cả công ty khác. Ai cũng có thể tự bấm nút Theo dõi trên thẻ để thêm mình vào đây.</p>
          </div>

          {/* Khoảng lương */}
          <div>
            <label className={labelCls}>Khoảng lương</label>
            <div className="grid grid-cols-3 gap-2">
              <MoneyInput value={f.salary_min} onValueChange={(n) => set('salary_min', n ? String(n) : '')}
                placeholder="Từ (VNĐ)" className={inputCls} />
              <MoneyInput value={f.salary_max} onValueChange={(n) => set('salary_max', n ? String(n) : '')}
                placeholder="Đến (VNĐ)" className={inputCls} />
              <select value={f.salary_type} onChange={e => set('salary_type', e.target.value)} className={inputCls}>
                <option value="gross">Gross</option>
                <option value="net">Net</option>
                <option value="negotiable">Thỏa thuận</option>
              </select>
            </div>
            <p className="text-2xs text-muted-foreground mt-1">Nhập bằng VNĐ — VD: 15000000 = 15tr. Để trống nếu thỏa thuận.</p>
          </div>

          {/* Số lượng & trạng thái */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Số lượng cần</label>
              <input type="number" min={1} value={f.target_headcount} onChange={e => set('target_headcount', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Đã tuyển được</label>
              <input type="number" min={0} value={f.filled_count} onChange={e => set('filled_count', e.target.value)} className={inputCls} />
            </div>
            {req ? (
              <div>
                <label className={labelCls}>Trạng thái</label>
                <select value={f.status} onChange={e => set('status', e.target.value)} className={inputCls}>
                  {MODAL_STATUSES.map(s => <option key={s} value={s}>{REQ_STATUS_LABELS[s].label}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label className={labelCls}>Trạng thái</label>
                <div className="h-10 px-3 flex items-center rounded-xl text-xs text-violet-300 bg-violet-500/10 border border-violet-500/30">
                  Sẽ chờ Admin phê duyệt
                </div>
              </div>
            )}
            <div>
              <label className={labelCls}>Độ ưu tiên</label>
              <select value={f.priority} onChange={e => set('priority', e.target.value)} className={inputCls}>
                {(['urgent', 'high', 'normal', 'low'] as const).map(p => <option key={p} value={p}>{REQ_PRIORITY_LABELS[p].label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Ngày mở</label>
              <DateInputVN value={f.open_date} onChange={e => set('open_date', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Hạn tuyển</label>
              <DateInputVN value={f.target_close_date} onChange={e => set('target_close_date', e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Pipeline ứng viên — ĐẾM TỰ ĐỘNG từ ứng viên đã liên kết, không nhập tay nữa
              (số nhập tay cũ trước đây luôn lệch với thực tế danh sách ứng viên). */}
          <div>
            <label className={labelCls}>Pipeline ứng viên</label>
            <div className="grid grid-cols-4 gap-2">
              {([['cnt_sourcing', 'Tìm nguồn'], ['cnt_screening', 'Sàng lọc CV'], ['cnt_interview', 'Phỏng vấn'], ['cnt_offer', 'Đã offer']] as const).map(([k, lbl]) => (
                <div key={k}>
                  <p className="text-2xs text-muted-foreground mb-1">{lbl}</p>
                  <div className="h-10 px-3 flex items-center rounded-xl text-sm text-foreground bg-surface-2 border border-line opacity-80">
                    {req?.[k] ?? 0}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-1 text-2xs text-muted-foreground">Tự động đếm theo giai đoạn hiện tại của ứng viên đã liên kết — đổi giai đoạn ứng viên là số này đổi theo.</p>
          </div>

          {/* Mã ngân sách & ghi chú */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Mã ngân sách</label>
              <input value={f.budget_code} onChange={e => set('budget_code', e.target.value)} placeholder="VD: HR-2026-Q2" className={inputCls} />
            </div>
            <div className="col-span-1" />
          </div>
          <div>
            <label className={labelCls}>Ghi chú</label>
            <textarea value={f.note} onChange={e => set('note', e.target.value)} rows={2}
              className="w-full px-3 py-2 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 resize-none" />
          </div>

          <JdPicker value={f.jd_id} onChange={(id) => set('jd_id', id)} />
          <AttachmentsPanel requisitionId={req?.id} localFiles={localFiles} onLocalFiles={setLocalFiles} />
          {req?.id && <LinkedCandidatesPanel requisitionId={req.id} />}
          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>
        <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4 shrink-0">
          <button onClick={guardedClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
          <button onClick={save} disabled={saving} className="btn-accent rounded-xl px-4 py-2 text-sm font-600 flex items-center gap-2 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Lưu
          </button>
        </div>
      </div>
    </div>
  );
}
