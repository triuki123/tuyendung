'use client';

import { useEffect, useState } from 'react';
import {
  ClipboardCheck, Plus, Loader2, Search, SlidersHorizontal,
  ChevronUp, ChevronDown, ChevronsUpDown, Eye, Trash2, History, Archive, ArchiveRestore,
} from 'lucide-react';
import RecordHistoryDrawer from '@/components/ui/RecordHistoryDrawer';
import {
  Evaluation, EmploymentType,
  listEvaluations, deleteEvaluationApi, archiveEvaluationApi, listEmploymentTypes,
  daysLeft, fmtBytes,
} from './hrApi';
import { fmtDate } from '../utils/hrHelpers';
import ConfirmModal from './ConfirmModal';
import EvaluationFormModal from './EvaluationFormModal';
import EvaluationDetailModal from './EvaluationDetailModal';
import { useToast } from '@/context/ToastContext';
import ErrorState from '@/components/ui/ErrorState';

interface Props {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

type SortKey = 'employee_name' | 'probation_end_date' | 'status' | 'created_at';

export const EVAL_STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  draft:           { label: 'Nháp',           cls: 'bg-hover-strong text-muted-foreground' },
  pending_signing: { label: 'Chờ đánh giá',   cls: 'bg-amber-500/15 text-amber-400' },
  evaluated:       { label: 'Đã đánh giá',    cls: 'bg-sky-500/15 text-sky-400' },
  passed:          { label: 'Đạt ✓',          cls: 'bg-emerald-500/15 text-emerald-400' },
  failed:          { label: 'Không đạt',       cls: 'bg-red-500/15 text-red-400' },
  extended:        { label: 'Đã gia hạn TV',  cls: 'bg-violet-500/15 text-violet-400' },
};

function DueBadge({ endDate, status }: { endDate: string | null; status: string }) {
  if (!['pending_signing', 'evaluated'].includes(status)) return null;
  const d = daysLeft(endDate);
  if (d === null) return null;
  if (d < 0) return <span className="text-2xs rounded-full px-2 py-0.5 bg-red-500/15 text-red-400">Quá hạn {Math.abs(d)}n</span>;
  if (d <= 3) return <span className="text-2xs rounded-full px-2 py-0.5 bg-red-500/15 text-red-400">Còn {d}n</span>;
  if (d <= 7) return <span className="text-2xs rounded-full px-2 py-0.5 bg-amber-500/15 text-amber-400">Còn {d}n</span>;
  return <span className="text-2xs rounded-full px-2 py-0.5 bg-hover-strong text-muted-foreground">Còn {d}n</span>;
}

export default function EvaluationsTab({ canCreate, canEdit, canDelete }: Props) {
  const toast = useToast();
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [empTypes, setEmpTypes] = useState<EmploymentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('probation_end_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Evaluation | null>(null);
  const [historyOf, setHistoryOf] = useState<Evaluation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.employment_type_id = typeFilter;
      if (showArchived) params.archive = 'archived';
      const [evs, types] = await Promise.all([listEvaluations(params), listEmploymentTypes()]);
      setEvaluations(evs);
      setEmpTypes(types);
    } catch (e) { console.error(e); setError(true); } finally { setLoading(false); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusFilter, typeFilter, showArchived]);

  const CONCLUDED = ['passed', 'failed', 'extended'];
  async function handleArchive(ev: Evaluation, archived: boolean) {
    setArchivingId(ev.id);
    try {
      await archiveEvaluationApi(ev.id, archived);
      toast.success(archived ? 'Đã lưu trữ thẻ đánh giá' : 'Đã bỏ lưu trữ');
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Thao tác thất bại'); } finally { setArchivingId(null); }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }

  function SortTh({ label, sk }: { label: string; sk: SortKey }) {
    const active = sortKey === sk;
    const Icon = active ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
    return (
      <button onClick={() => toggleSort(sk)}
        className={`flex items-center gap-1 text-2xs uppercase tracking-wider whitespace-nowrap hover:text-foreground ${active ? 'text-indigo-400' : 'text-muted-foreground'}`}>
        {label} <Icon className="h-3 w-3" />
      </button>
    );
  }

  const filtered = evaluations
    .filter((e) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (e.employee_name ?? '').toLowerCase().includes(q)
        || (e.employment_type_name ?? '').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'employee_name') return dir * (a.employee_name ?? '').localeCompare(b.employee_name ?? '');
      if (sortKey === 'probation_end_date') return dir * ((a.probation_end_date ?? '') < (b.probation_end_date ?? '') ? -1 : 1);
      if (sortKey === 'status') return dir * a.status.localeCompare(b.status);
      return dir * (a.created_at < b.created_at ? -1 : 1);
    });

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteEvaluationApi(deleteTarget.id);
      toast.success('Đã xóa thẻ đánh giá');
      setDeleteTarget(null);
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Không xóa được thẻ đánh giá'); } finally { setDeleting(false); }
  }

  const hasFilter = !!(statusFilter || typeFilter);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-2">
        {/* Row 1: search + filter icon + nút tạo */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm nhân viên…"
              className="w-full rounded-xl border border-line pl-8 pr-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500"
              style={{ background: 'var(--input)' }} />
          </div>
          <button onClick={() => setShowFilters((v) => !v)}
            className={`shrink-0 rounded-xl border px-3 py-2 flex items-center gap-1.5 ${showFilters || hasFilter ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400' : 'border-line text-muted-foreground hover:text-foreground hover:bg-hover'}`}>
            <SlidersHorizontal className="h-4 w-4" />
            {hasFilter && <span className="rounded-full bg-indigo-500 text-white text-2xs px-1.5 py-0.5 leading-none">{[statusFilter, typeFilter].filter(Boolean).length}</span>}
          </button>
          <button onClick={() => setShowArchived((v) => !v)}
            title={showArchived ? 'Đang xem thẻ đã lưu trữ' : 'Xem thẻ đã lưu trữ'}
            className={`shrink-0 rounded-xl border px-3 py-2 flex items-center gap-1.5 text-sm ${showArchived ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400' : 'border-line text-muted-foreground hover:text-foreground hover:bg-hover'}`}>
            <Archive className="h-4 w-4" />
            <span className="hidden md:inline">Đã lưu trữ</span>
          </button>
          {canCreate && (
            <button onClick={() => setShowForm(true)}
              className="shrink-0 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-3 py-2 text-sm font-600 text-white flex items-center gap-1.5">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Tạo đánh giá</span>
              <span className="sm:hidden">Tạo</span>
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 p-4 rounded-2xl border border-line-subtle" style={{ background: 'var(--card)' }}>
          <div className="flex flex-col gap-1">
            <label className="text-2xs font-600 text-muted-foreground uppercase tracking-wider">Trạng thái</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-line px-3 py-1.5 text-sm text-foreground outline-none focus:border-indigo-500"
              style={{ background: 'var(--input)' }}>
              <option value="">Tất cả</option>
              {Object.entries(EVAL_STATUS_LABELS).map(([v, { label }]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-2xs font-600 text-muted-foreground uppercase tracking-wider">Hình thức</label>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-xl border border-line px-3 py-1.5 text-sm text-foreground outline-none focus:border-indigo-500"
              style={{ background: 'var(--input)' }}>
              <option value="">Tất cả</option>
              {empTypes.filter(t => t.requires_evaluation).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          {hasFilter && (
            <button onClick={() => { setStatusFilter(''); setTypeFilter(''); }}
              className="self-end text-xs text-muted-foreground hover:text-foreground">
              Xóa bộ lọc
            </button>
          )}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <ErrorState message="Không tải được danh sách đánh giá. Vui lòng thử lại." onRetry={load} />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <ClipboardCheck className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Chưa có thẻ đánh giá</p>
          <p className="text-xs mt-1 opacity-60">Hệ thống sẽ tự động tạo khi còn 7 ngày hết thử việc</p>
        </div>
      ) : (
        <>
          {/* ── Mobile cards (< sm) ── */}
          <div className="sm:hidden space-y-2">
            {filtered.map((ev) => {
              const st = EVAL_STATUS_LABELS[ev.status] ?? EVAL_STATUS_LABELS.draft;
              return (
                <div key={ev.id} onClick={() => setSelectedId(ev.id)}
                  className="rounded-2xl border border-line-subtle p-4 cursor-pointer active:bg-hover"
                  style={{ background: 'var(--card)' }}>
                  {/* Row 1: tên + actions */}
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="min-w-0">
                      <p className="text-sm font-600 text-foreground leading-tight">{ev.employee_name ?? '—'}</p>
                      <p className="text-2xs text-muted-foreground truncate mt-0.5">{ev.employee_email}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 -mr-1"
                      onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setHistoryOf(ev)} title="Lịch sử xử lý"
                        className="btn-ghost rounded-lg p-1.5 hover:text-sky-400">
                        <History className="h-3.5 w-3.5" />
                      </button>
                      {canEdit && CONCLUDED.includes(ev.status) && (
                        <button onClick={() => handleArchive(ev, !ev.archived_at)} disabled={archivingId === ev.id}
                          title={ev.archived_at ? 'Bỏ lưu trữ' : 'Lưu trữ'}
                          className="btn-ghost rounded-lg p-1.5 hover:text-amber-400 disabled:opacity-50">
                          {ev.archived_at ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => setDeleteTarget(ev)}
                          className="btn-ghost rounded-lg p-1.5 text-red-400 hover:text-red-300">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button onClick={() => setSelectedId(ev.id)} className="btn-ghost rounded-lg p-1.5">
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Row 2: hình thức · phòng ban */}
                  <p className="text-2xs text-muted-foreground mb-2">
                    {ev.employment_type_name ?? '—'} · {ev.employee_department_name ?? '—'}
                  </p>

                  {/* Row 3: badge trạng thái + hạn */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`rounded-full px-2.5 py-0.5 text-2xs font-500 ${st.cls}`}>{st.label}</span>
                    {ev.auto_generated && (
                      <span className="rounded-full px-2 py-0.5 text-2xs bg-sky-500/10 text-sky-400">Auto</span>
                    )}
                    <span className="text-2xs text-muted-foreground ml-auto">
                      Hạn: {fmtDate(ev.probation_end_date)}
                    </span>
                    <DueBadge endDate={ev.probation_end_date} status={ev.status} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Desktop table (sm+) ── */}
          <div className="hidden sm:block rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-line-subtle">
                  <th className="text-left px-4 py-3"><SortTh label="Nhân viên" sk="employee_name" /></th>
                  <th className="text-left px-4 py-3"><span className="text-2xs uppercase tracking-wider text-muted-foreground">Hình thức</span></th>
                  <th className="text-left px-4 py-3"><SortTh label="Hạn đánh giá" sk="probation_end_date" /></th>
                  <th className="text-left px-4 py-3"><SortTh label="Trạng thái" sk="status" /></th>
                  <th className="text-left px-4 py-3"><span className="text-2xs uppercase tracking-wider text-muted-foreground">Phòng ban</span></th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((ev) => {
                  const st = EVAL_STATUS_LABELS[ev.status] ?? EVAL_STATUS_LABELS.draft;
                  return (
                    <tr key={ev.id} className="border-b border-line-subtle hover:bg-hover cursor-pointer"
                      onClick={() => setSelectedId(ev.id)}>
                      <td className="px-4 py-3">
                        <p className="font-600 text-foreground">{ev.employee_name ?? '—'}</p>
                        <p className="text-2xs text-muted-foreground">{ev.employee_email}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{ev.employment_type_name ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-foreground">{fmtDate(ev.probation_end_date)}</span>
                          <DueBadge endDate={ev.probation_end_date} status={ev.status} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-2xs ${st.cls}`}>{st.label}</span>
                        {ev.auto_generated && (
                          <span className="ml-1 rounded-full px-2 py-0.5 text-2xs bg-sky-500/10 text-sky-400">Auto</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{ev.employee_department_name ?? '—'}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => setHistoryOf(ev)} title="Lịch sử xử lý"
                            className="btn-ghost rounded-lg p-1.5 hover:text-sky-400">
                            <History className="h-4 w-4" />
                          </button>
                          <button onClick={() => setSelectedId(ev.id)} className="btn-ghost rounded-lg p-1.5">
                            <Eye className="h-4 w-4" />
                          </button>
                          {canEdit && CONCLUDED.includes(ev.status) && (
                            <button onClick={() => handleArchive(ev, !ev.archived_at)} disabled={archivingId === ev.id}
                              title={ev.archived_at ? 'Bỏ lưu trữ' : 'Lưu trữ'}
                              className="btn-ghost rounded-lg p-1.5 hover:text-amber-400 disabled:opacity-50">
                              {ev.archived_at ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={() => setDeleteTarget(ev)} className="btn-ghost rounded-lg p-1.5 text-red-400 hover:text-red-300">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}

      {showForm && (
        <EvaluationFormModal
          empTypes={empTypes}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}

      {selectedId && (
        <EvaluationDetailModal
          evaluationId={selectedId}
          canEdit={canEdit}
          empTypes={empTypes}
          onClose={() => setSelectedId(null)}
          onChanged={load}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Xóa thẻ đánh giá"
          message={`Xóa thẻ đánh giá của ${deleteTarget.employee_name ?? 'nhân viên'}? Hành động này không thể hoàn tác.`}
          confirmLabel="Xóa"
          isDangerous
          isLoading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {historyOf && (
        <RecordHistoryDrawer
          entityType="evaluation"
          entityId={historyOf.id}
          title={historyOf.employee_name ?? 'Thẻ đánh giá'}
          onClose={() => setHistoryOf(null)}
        />
      )}
    </div>
  );
}
