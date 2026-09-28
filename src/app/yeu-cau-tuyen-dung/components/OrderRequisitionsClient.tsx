'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { Loader2, Megaphone, Plus, X, Pencil, Trash2, Lock, Info, Copy, Users2, Star, Settings, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import MoneyInput from '@/components/ui/MoneyInput';
import {
  listRequisitions, createRequisition, updateRequisition, deleteRequisition,
  listRecruiters, cloneRequisition, listRequisitionCandidates,
  Requisition, Recruiter, RequisitionCandidate, ReqStatus, REQ_STATUS_LABELS, REQ_PRIORITY_LABELS,
} from '@/lib/api/requisitionApi';
import { STAGE_MAP, avatarFor } from '@/app/nguon-nhan-luc/kho-ung-vien/components/candidateShared';
import RequesterCandidateDrawer from './RequesterCandidateDrawer';

const ACTIVE_STATUSES: ReqStatus[] = ['pending_approval', 'pending', 'open', 'on_hold'];
const CLOSED_STATUSES: ReqStatus[] = ['filled', 'cancelled', 'rejected'];
import { loadOrgData } from '@/lib/api/onboardingApi';
import { getCurrentUser } from '@/lib/authStore';
import DateInputVN from '@/components/ui/DateInputVN';
import { useToast } from '@/context/ToastContext';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import {
  JdPicker, SlaBadge, SalaryTag, PipelineMini, CommentToggle, CommentModal,
} from '@/components/RequisitionExtras';
import { RequisitionQuickView, FollowButton, RequisitionPeopleLines } from '@/components/RequisitionQuickView';

type Org = Awaited<ReturnType<typeof loadOrgData>>;

/**
 * Cổng ĐẶT yêu cầu tuyển dụng (mục Hoạt Động) — dành cho quản lý các phòng ban order.
 * Khác trang "Nguồn Nhân Lực > Yêu Cầu Tuyển Dụng" (bộ phận Tuyển Dụng quản lý/giao việc).
 * Chỉ super_admin/admin/manager tạo được; manager mặc định Công Ty của mình.
 */
export default function OrderRequisitionsClient() {
  const toast = useToast();
  // undefined = chưa resolve (server + render đầu ở client) → tránh hydration mismatch.
  const [user, setUser] = useState<any>(undefined);
  const role: string = user?.role || '';
  const myCompanyId: string = user?.company_id ? String(user.company_id) : '';
  const isManager = role === 'manager';
  const isAdmin = role === 'admin' || role === 'super_admin';
  const canCreate = isManager || isAdmin;

  const [items, setItems] = useState<Requisition[]>([]);
  const [org, setOrg] = useState<Org | null>(null);
  const [recruiters, setRecruiters] = useState<Recruiter[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Requisition | null>(null);
  const [viewing, setViewing] = useState<Requisition | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Requisition | null>(null);
  // ESC đóng hộp xác nhận hủy (chỉ khi đang mở).
  useEscapeKey(() => setConfirmDel(null), !!confirmDel);
  const [openComments, setOpenComments] = useState<Set<string>>(new Set());
  const [showClosed, setShowClosed] = useState(false);
  const toggleComments = (id: string) => setOpenComments(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  const closedCount = useMemo(() => items.filter(i => CLOSED_STATUSES.includes(i.status)).length, [items]);
  const visibleItems = useMemo(
    () => showClosed ? items : items.filter(i => ACTIVE_STATUSES.includes(i.status)),
    [items, showClosed]
  );

  const load = async () => {
    setLoading(true);
    try {
      // Manager chỉ thấy yêu cầu của công ty mình; admin/super xem tất cả.
      const params = isManager && myCompanyId ? { company_id: myCompanyId } : {};
      setItems(await listRequisitions(params));
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };
  // Đọc user sau khi mount (localStorage chỉ có ở client).
  useEffect(() => { setUser(getCurrentUser()); }, []);
  useEffect(() => { if (user !== undefined) load(); /* eslint-disable-next-line */ }, [user]);
  useEffect(() => { loadOrgData().then(setOrg).catch(() => {}); }, []);
  useEffect(() => { listRecruiters().then(setRecruiters).catch(() => {}); }, []);

  const companyMap = useMemo(() => {
    const m: Record<string, string> = {};
    (org?.companies || []).forEach(c => { m[c.id] = c.name; });
    return m;
  }, [org]);

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

  const doClone = async (r: Requisition) => {
    try { onSaved(await cloneRequisition(r)); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Lỗi nhân bản'); }
  };

  const doDelete = async () => {
    if (!confirmDel) return;
    try { await deleteRequisition(confirmDel.id); setItems(prev => prev.filter(x => x.id !== confirmDel.id)); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Lỗi'); }
    finally { setConfirmDel(null); }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-700 flex items-center gap-2.5">
            <Megaphone className="h-6 w-6 text-orange-400" /> Yêu Cầu Tuyển Dụng
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Đặt yêu cầu tuyển dụng cho phòng ban — bộ phận Tuyển Dụng sẽ tiếp nhận &amp; xử lý</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isAdmin && (
            <Link href="/yeu-cau-tuyen-dung/admin/config" className="btn-ghost rounded-xl px-4 py-2 text-sm font-500 flex items-center gap-2">
              <Settings className="h-4 w-4" /> Cấu hình
            </Link>
          )}
          {canCreate && (
            <button onClick={() => setCreating(true)} className="btn-accent rounded-xl px-4 py-2 text-sm font-600 flex items-center gap-2">
              <Plus className="h-4 w-4" /> Tạo yêu cầu
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-4 py-2.5">
        <Info className="h-4 w-4 text-indigo-400 shrink-0" />
        <p className="text-xs text-muted-foreground">
          {isManager
            ? 'Bạn đang đặt yêu cầu cho công ty của mình. Bộ phận Tuyển Dụng sẽ phân công người phụ trách và cập nhật tiến độ.'
            : isAdmin
              ? 'Bạn có thể đặt yêu cầu cho bất kỳ công ty nào.'
              : 'Chỉ Quản lý / Admin mới có quyền tạo yêu cầu tuyển dụng.'}
        </p>
      </div>

      {/* Bộ lọc: ẩn/hiện việc đã đóng (hoàn thành/lưu trữ/từ chối) */}
      {!loading && items.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{visibleItems.length} yêu cầu {showClosed ? '' : 'đang hoạt động'}</span>
          {closedCount > 0 && (
            <button onClick={() => setShowClosed(v => !v)}
              className="rounded-xl border border-line px-3 py-1.5 text-xs font-600 text-muted-foreground hover:text-foreground hover:bg-hover transition-colors">
              {showClosed ? 'Ẩn việc đã đóng' : `Hiện việc đã đóng (${closedCount})`}
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : visibleItems.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <Megaphone className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">{items.length === 0 ? 'Chưa có yêu cầu tuyển dụng nào' : 'Không có yêu cầu nào đang hoạt động'}</p>
          {items.length === 0 && canCreate && <p className="text-xs mt-1 opacity-60">Bấm &quot;Tạo yêu cầu&quot; để gửi nhu cầu tuyển tới bộ phận Tuyển Dụng</p>}
          {items.length > 0 && closedCount > 0 && <p className="text-xs mt-1 opacity-60">Bấm &quot;Hiện việc đã đóng&quot; để xem {closedCount} yêu cầu đã hoàn thành/lưu trữ</p>}
        </div>
      ) : (
        // Masonry (columns) thay vì grid — thẻ có khung Ứng viên liên kết cao thấp khác nhau
        // theo số ứng viên; grid-cols cứng để lại khoảng trắng lớn dưới thẻ ngắn cùng hàng.
        <div className="columns-1 sm:columns-2 xl:columns-3 gap-4">
          {visibleItems.map(r => {
            const st = REQ_STATUS_LABELS[r.status]; const pr = REQ_PRIORITY_LABELS[r.priority];
            const pct = r.target_headcount > 0 ? Math.min(100, Math.round((r.filled_count / r.target_headcount) * 100)) : 0;
            return (
              <div key={r.id} className="mb-4 break-inside-avoid rounded-2xl border border-line-subtle flex flex-col" style={{ background: 'var(--card)' }}>
                <div className="p-4 flex flex-col flex-1">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <button onClick={() => setViewing(r)} className="min-w-0 text-left group" title="Xem nhanh yêu cầu">
                      <p className="text-sm font-600 text-foreground truncate group-hover:text-indigo-300 transition-colors">{r.title}</p>
                      <p className="text-2xs text-muted-foreground truncate">{[r.company_name, r.department_name].filter(Boolean).join(' · ') || '—'}</p>
                    </button>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => setViewing(r)} className="btn-ghost rounded-lg p-2 -m-0.5 text-muted-foreground hover:text-indigo-400" title="Xem nhanh"><Eye className="h-3.5 w-3.5" /></button>
                      <FollowButton req={r} onChanged={onSaved} compact />
                    </div>
                    {canCreate && (
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => doClone(r)} className="btn-ghost rounded-lg p-2 -m-0.5 text-muted-foreground hover:text-indigo-400" title="Nhân bản (tuyển lại)"><Copy className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setEditing(r)} className="btn-ghost rounded-lg p-2 -m-0.5" title="Sửa"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setConfirmDel(r)} className="btn-ghost rounded-lg p-2 -m-0.5 text-muted-foreground hover:text-red-400" title="Hủy"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-600 ${st.color}`}>{st.label}</span>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-600 ${pr.color}`}>{pr.label}</span>
                    <SlaBadge targetCloseDate={r.target_close_date} status={r.status} />
                  </div>
                  <SalaryTag r={r} />
                  {r.status === 'rejected' && r.reject_reason && (
                    <div className="mb-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-2.5 py-1.5">
                      <p className="text-2xs text-rose-300"><b>Lý do từ chối:</b> {r.reject_reason}</p>
                    </div>
                  )}
                  <PipelineMini r={r} />
                  <RequisitionPeopleLines r={r} />
                  <div className="mt-auto pt-2">
                    <div className="flex items-center justify-between text-2xs mb-1">
                      <span className="text-muted-foreground">Tiến độ: <b className="text-foreground">{r.filled_count}/{r.target_headcount}</b></span>
                      <span className="text-muted-foreground">{r.owner_name ? `PT: ${r.owner_name}` : 'Chờ tiếp nhận'}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-hover overflow-hidden">
                      <div className="h-full rounded-full bg-orange-500/70" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>

                {/* Ứng viên liên kết — luôn hiển thị, khung cao cố định (phân trang bên trong) */}
                <div className="px-4 pt-3 pb-3 border-t border-line-subtle">
                  <LinkedCandidatesMini reqId={r.id} />
                </div>

                {/* Ghi chú & Tiến độ — mở Pop-up, không làm đổi chiều cao thẻ */}
                <CommentToggle onClick={() => toggleComments(r.id)} />
                {openComments.has(r.id) && (
                  <CommentModal reqId={r.id} title={r.title} onClose={() => toggleComments(r.id)} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {(creating || editing) && org && (
        <OrderModal
          req={editing} org={org} isManager={isManager} myCompanyId={myCompanyId} companyMap={companyMap}
          recruiters={recruiters}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={onSaved}
        />
      )}

      {viewing && (
        <RequisitionQuickView
          req={viewing}
          onClose={() => setViewing(null)}
          onEdit={canCreate ? () => setEditing(viewing) : undefined}
          onChanged={onSaved}
          candidatesSlot={<LinkedCandidatesMini reqId={viewing.id} />}
        />
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setConfirmDel(null)}>
          <div className="w-full max-w-sm rounded-3xl border border-line p-6" style={{ background: 'var(--card)' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-700 text-foreground mb-2">Hủy yêu cầu tuyển dụng?</h3>
            <p className="text-xs text-muted-foreground mb-5">&quot;{confirmDel.title}&quot; sẽ bị gỡ khỏi danh sách.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDel(null)} className="btn-ghost rounded-xl px-4 py-2 text-sm">Đóng</button>
              <button onClick={doDelete} className="rounded-xl px-4 py-2 text-sm font-600 text-white bg-red-600 hover:bg-red-700">Hủy yêu cầu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const CANDIDATES_MINI_PAGE_SIZE = 2;

/**
 * Danh sách ứng viên bộ phận Tuyển Dụng đã gắn vào yêu cầu — người yêu cầu bấm để xem & quyết định.
 * Khung LUÔN hiển thị (không thu/mở) với chiều cao cố định — ít/nhiều ứng viên đều không làm
 * đổi cao thẻ, dùng phân trang bên trong khung thay vì giãn ra.
 */
function LinkedCandidatesMini({ reqId }: { reqId: string }) {
  const [items, setItems] = useState<RequisitionCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [openApp, setOpenApp] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    listRequisitionCandidates(reqId)
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [reqId]);
  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(items.length / CANDIDATES_MINI_PAGE_SIZE));
  useEffect(() => { setPage((p) => Math.min(p, totalPages - 1)); }, [totalPages]);
  const visible = items.slice(page * CANDIDATES_MINI_PAGE_SIZE, page * CANDIDATES_MINI_PAGE_SIZE + CANDIDATES_MINI_PAGE_SIZE);

  return (
    <div>
      <label className="text-2xs font-600 text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <Users2 className="h-3.5 w-3.5" /> Ứng viên liên kết{items.length > 0 ? ` (${items.length})` : ''}
      </label>

      <div className="mt-1.5 rounded-xl border border-line bg-white/[0.02] p-2.5 min-h-[112px] flex flex-col justify-center">
        {loading ? (
          <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <p className="text-2xs text-muted-foreground/70 py-1 text-center">Bộ phận Tuyển Dụng chưa gắn ứng viên nào vào yêu cầu này.</p>
        ) : (
          <div className="space-y-1.5">
            {visible.map((cv) => {
              const st = STAGE_MAP[cv.status];
              return (
                <button key={cv.id} onClick={() => setOpenApp(cv.application_id)}
                  className="flex w-full items-center gap-2.5 rounded-lg bg-white/[0.02] px-2.5 py-1.5 text-left hover:bg-hover transition-colors">
                  <div className="h-7 w-7 rounded-full flex items-center justify-center text-2xs font-700 text-white shrink-0" style={{ background: avatarFor(cv.candidate_name) }}>
                    {cv.candidate_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-600 text-foreground truncate">{cv.candidate_name}</p>
                    <p className="text-2xs text-muted-foreground truncate">
                      {cv.current_title || cv.position_applied || '—'}{cv.years_experience != null ? ` · ${cv.years_experience} năm KN` : ''}
                      {cv.skills.length > 0 ? ` · ${cv.skills.slice(0, 3).join(', ')}` : ''}
                    </p>
                    {cv.hired_elsewhere && (
                      <p className="text-2xs text-emerald-300/90 truncate mt-0.5">✅ Đã onboard cho vị trí khác: {cv.hired_elsewhere}</p>
                    )}
                  </div>
                  {cv.rating != null && <span className="inline-flex items-center gap-0.5 text-2xs text-amber-300 font-600 shrink-0"><Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {cv.rating}</span>}
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

      {openApp && (
        <RequesterCandidateDrawer reqId={reqId} appId={openApp} onClose={() => setOpenApp(null)} onChanged={load} />
      )}
    </div>
  );
}

const inputCls = 'w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60';
const labelCls = 'block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5';

function OrderModal({ req, org, isManager, myCompanyId, companyMap, recruiters, onClose, onSaved }: {
  req: Requisition | null; org: Org; isManager: boolean; myCompanyId: string; companyMap: Record<string, string>;
  recruiters: Recruiter[];
  onClose: () => void; onSaved: (r: Requisition) => void;
}) {
  const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose);
  useEscapeKey(guardedClose);
  // Manager: mặc định & khóa Công Ty = công ty của mình.
  const defaultCompany = req?.company_id ?? (isManager ? myCompanyId : '');
  const [f, setF] = useState({
    title: req?.title ?? '',
    company_id: defaultCompany || '',
    department_id: req?.department_id ?? '',
    sub_department_id: req?.sub_department_id ?? '',
    position_id: req?.position_id ?? '',
    owner_id: req?.owner_id ?? '',
    jd_id: req?.jd_id ?? '',
    target_headcount: req?.target_headcount ?? 1,
    priority: req?.priority ?? 'normal',
    target_close_date: req?.target_close_date ? req.target_close_date.slice(0, 10) : '',
    salary_min: req?.salary_min ?? '',
    salary_max: req?.salary_max ?? '',
    salary_type: req?.salary_type ?? 'negotiable',
    note: req?.note ?? '',
  });
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

  const save = async () => {
    if (!f.title.trim()) { setErr('Nhập vị trí cần tuyển'); return; }
    if (!f.company_id) { setErr('Chọn công ty'); return; }
    setSaving(true); setErr('');
    try {
      const body = {
        ...f,
        target_headcount: Number(f.target_headcount),
        salary_min: f.salary_min !== '' ? Number(f.salary_min) : null,
        salary_max: f.salary_max !== '' ? Number(f.salary_max) : null,
        jd_id: f.jd_id || null,
      };
      // Yêu cầu mới từ cổng đặt -> 'pending' (chờ bộ phận Tuyển Dụng tiếp nhận).
      const saved = req ? await updateRequisition(req.id, body) : await createRequisition({ ...body, status: 'pending' });
      markClean();
      onSaved(saved);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Lỗi lưu'); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={guardedClose}>
      <div className="w-full max-w-lg max-h-[92vh] flex flex-col rounded-3xl border border-line overflow-hidden" style={{ background: 'var(--card)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4 shrink-0">
          <h2 className="text-base font-700 text-foreground">{req ? 'Sửa yêu cầu tuyển dụng' : 'Đặt yêu cầu tuyển dụng'}</h2>
          <button onClick={guardedClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4" onChange={markDirty}>
          <div>
            <label className={labelCls}>Vị trí cần tuyển *</label>
            <input value={f.title} onChange={e => set('title', e.target.value)} placeholder="VD: Nhân viên Kinh doanh" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Công ty {isManager && <Lock className="inline h-3 w-3 text-muted-foreground" />}</label>
              {isManager ? (
                <div className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-[#0f1626] border border-line flex items-center opacity-80">
                  {companyMap[myCompanyId] || 'Công ty của bạn'}
                </div>
              ) : (
                <select value={f.company_id} onChange={e => set('company_id', e.target.value)} className={inputCls}>
                  <option value="">— Chọn —</option>
                  {org.companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
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
              <label className={labelCls}>Số lượng cần</label>
              <input type="number" min={1} value={f.target_headcount} onChange={e => set('target_headcount', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Độ ưu tiên</label>
              <select value={f.priority} onChange={e => set('priority', e.target.value)} className={inputCls}>
                {(['urgent', 'high', 'normal', 'low'] as const).map(p => <option key={p} value={p}>{REQ_PRIORITY_LABELS[p].label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Cần trước ngày</label>
              <DateInputVN value={f.target_close_date} onChange={e => set('target_close_date', e.target.value)} className={inputCls} />
            </div>
          </div>
          {recruiters.length > 0 && (
            <div>
              <label className={labelCls}>Người phụ trách tuyển dụng</label>
              <select value={f.owner_id} onChange={e => set('owner_id', e.target.value)} className={inputCls}>
                <option value="">— Chưa chỉ định —</option>
                {recruiters.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              {f.owner_id && (
                <p className="mt-1 text-2xs text-muted-foreground">
                  Người này sẽ nhận thông báo ngay khi yêu cầu được gửi.
                </p>
              )}
            </div>
          )}
          <JdPicker value={f.jd_id} onChange={(id) => set('jd_id', id)} />
          <div>
            <label className={labelCls}>Mức lương</label>
            <div className="grid grid-cols-3 gap-2">
              <MoneyInput value={f.salary_min} onValueChange={(n) => set('salary_min', n ? String(n) : '')}
                placeholder="Tối thiểu" className={inputCls} />
              <MoneyInput value={f.salary_max} onValueChange={(n) => set('salary_max', n ? String(n) : '')}
                placeholder="Tối đa" className={inputCls} />
              <select value={f.salary_type} onChange={e => set('salary_type', e.target.value)} className={inputCls}>
                <option value="negotiable">Thỏa thuận</option>
                <option value="gross">Gross</option>
                <option value="net">Net</option>
              </select>
            </div>
            <p className="mt-1 text-2xs text-muted-foreground">Để trống nếu chưa xác định mức lương.</p>
          </div>
          <div>
            <label className={labelCls}>Mô tả / yêu cầu thêm</label>
            <textarea value={f.note} onChange={e => set('note', e.target.value)} rows={3} placeholder="Yêu cầu về kinh nghiệm, kỹ năng, lý do tuyển..."
              className="w-full px-3 py-2 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 resize-none" />
          </div>
          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>
        <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4 shrink-0">
          <button onClick={guardedClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
          <button onClick={save} disabled={saving} className="btn-accent rounded-xl px-4 py-2 text-sm font-600 flex items-center gap-2 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} {req ? 'Lưu' : 'Gửi yêu cầu'}
          </button>
        </div>
      </div>
    </div>
  );
}
