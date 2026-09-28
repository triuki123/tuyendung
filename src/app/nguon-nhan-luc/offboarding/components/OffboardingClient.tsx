'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Loader2, ArrowLeft, UserMinus, Settings2, Search, Filter, X, Plus, Inbox,
  CalendarDays, Trash2, Pencil, Archive, ArchiveRestore,
} from 'lucide-react';
import {
  listObProcesses, listArchivedObProcesses, deleteObProcess, archiveObProcess, restoreObProcess,
  ObProcess, OB_STATUS_LABELS, OB_REASON_LABELS, obFmtDate,
} from '@/lib/api/offboardingApi';
import UserAvatar from '@/components/UserAvatar';
import CreateProcessModal from './CreateProcessModal';
import ProcessDetailModal from './ProcessDetailModal';
import EditProcessModal from './EditProcessModal';
import ChecklistConfigPanel from './ChecklistConfigPanel';
import { normalizeVN } from '@/lib/utils/searchVN';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import ErrorState from '@/components/ui/ErrorState';

type Tab = 'list' | 'archived' | 'config';

const STAT_CARDS = [
  { key: 'in_progress', label: 'Đang xử lý' },
  { key: 'completed', label: 'Hoàn tất' },
  { key: 'cancelled', label: 'Đã hủy' },
];

export default function OffboardingClient() {
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>('list');
  const [processes, setProcesses] = useState<ObProcess[]>([]);
  const [archived, setArchived] = useState<ObProcess[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [archivedError, setArchivedError] = useState(false);
  const [filter, setFilter] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState('');
  const [editProcess, setEditProcess] = useState<ObProcess | null>(null);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await listObProcesses();
      setProcesses(res.data);
      setCounts(res.counts);
    } catch (e) { console.error(e); setError(true); } finally { setLoading(false); }
  };

  const loadArchived = async () => {
    setArchivedError(false);
    try { setArchived(await listArchivedObProcesses()); } catch (e) { console.error(e); setArchivedError(true); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (tab === 'archived') loadArchived(); }, [tab]);

  // Tùy chọn lọc tự suy ra từ dữ liệu đang có
  const companyOptions = useMemo(
    () => Array.from(new Set(processes.map((p) => p.company_name).filter(Boolean))) as string[],
    [processes]
  );
  const deptOptions = useMemo(
    () => Array.from(new Set(processes.map((p) => p.department_name).filter(Boolean))) as string[],
    [processes]
  );
  const reasonOptions = useMemo(
    () => Array.from(new Set(processes.map((p) => p.reason).filter(Boolean))) as string[],
    [processes]
  );

  const hasActiveFilter = !!(filter || reasonFilter || companyFilter || deptFilter || search.trim());
  const clearFilters = () => { setFilter(''); setReasonFilter(''); setCompanyFilter(''); setDeptFilter(''); setSearch(''); };

  const filtered = useMemo(() => {
    let list = filter ? processes.filter((p) => p.status === filter) : processes;
    if (reasonFilter) list = list.filter((p) => p.reason === reasonFilter);
    if (companyFilter) list = list.filter((p) => p.company_name === companyFilter);
    if (deptFilter) list = list.filter((p) => p.department_name === deptFilter);
    const q = normalizeVN(search).trim();
    if (q) list = list.filter((p) =>
      normalizeVN([p.user_name, p.user_email, p.department_name, p.company_name].filter(Boolean).join(' ')).includes(q)
    );
    return list;
  }, [processes, filter, reasonFilter, companyFilter, deptFilter, search]);

  const handleDelete = async (e: React.MouseEvent, p: ObProcess) => {
    e.stopPropagation();
    if (!await confirm({ title: 'Xóa quy trình?', message: `Xóa vĩnh viễn quy trình nghỉ việc của "${p.user_name}"? Hành động này không thể hoàn tác.`, confirmLabel: 'Xóa', danger: true })) return;
    try { await deleteObProcess(p.id); load(); } catch (err: any) { toast.error(err.message || 'Lỗi server'); }
  };

  const handleArchive = async (e: React.MouseEvent, p: ObProcess) => {
    e.stopPropagation();
    try { await archiveObProcess(p.id); load(); } catch (err: any) { toast.error(err.message || 'Lỗi server'); }
  };

  const handleRestore = async (p: ObProcess) => {
    try { await restoreObProcess(p.id); loadArchived(); load(); } catch (err: any) { toast.error(err.message || 'Lỗi server'); }
  };

  const handleEdit = (e: React.MouseEvent, p: ObProcess) => {
    e.stopPropagation();
    setEditProcess(p);
  };

  const renderCard = (p: ObProcess, isArchived = false) => {
    const st = OB_STATUS_LABELS[p.status] || OB_STATUS_LABELS.in_progress;
    const total = p.total_items || 0;
    const done = p.done_items || 0;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return (
      <div key={p.id} className="rounded-2xl border border-line-subtle p-4 transition-colors hover:border-indigo-500/30"
        style={{ background: 'var(--card)' }}>
        {/* Top: avatar + tên + badge */}
        <button className="flex w-full items-start gap-3 text-left" onClick={() => !isArchived && setDetailId(p.id)}>
          <UserAvatar name={p.user_name || '?'} avatarUrl={p.user_avatar} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-600 text-foreground truncate">{p.user_name}</p>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-2xs font-600 ${st.color}`}>{st.label}</span>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {[p.job_title_name, p.sub_department_name, p.department_name, p.company_name].filter(Boolean).join(' · ') || p.user_email}
            </p>
          </div>
        </button>

        {/* Middle: lý do + ngày + action buttons */}
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
            <span className="rounded-md bg-hover px-1.5 py-0.5 shrink-0">{OB_REASON_LABELS[p.reason] || p.reason}</span>
            {p.last_working_date && (
              <span className="inline-flex items-center gap-1 truncate"><CalendarDays className="h-3 w-3 shrink-0" /> {obFmtDate(p.last_working_date)}</span>
            )}
          </div>
          {/* Action buttons */}
          {isArchived ? (
            <button onClick={() => handleRestore(p)} title="Khôi phục"
              className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors">
              <ArchiveRestore className="h-3.5 w-3.5" />
            </button>
          ) : (
            <div className="flex shrink-0 items-center gap-0.5">
              <button onClick={(e) => handleEdit(e, p)} title="Sửa thông tin"
                className="rounded-lg p-1.5 text-muted-foreground hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button onClick={(e) => handleArchive(e, p)} title="Lưu trữ"
                className="rounded-lg p-1.5 text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10 transition-colors">
                <Archive className="h-3.5 w-3.5" />
              </button>
              <button onClick={(e) => handleDelete(e, p)} title="Xóa vĩnh viễn"
                className="rounded-lg p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Bottom: checklist progress */}
        <div className="mt-2.5">
          <div className="flex items-center justify-between text-2xs text-muted-foreground mb-1">
            <span>Checklist</span><span>{done}/{total} · {pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-hover overflow-hidden">
            <div className={`h-full rounded-full transition-all ${p.status === 'completed' ? 'bg-emerald-500' : pct === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
              style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <Link href="/nguon-nhan-luc" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Nguồn Nhân Lực
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-700 flex items-center gap-2.5">
            <UserMinus className="h-6 w-6 text-rose-400" /> Offboarding
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Quy trình nghỉ việc: checklist bàn giao, thu hồi tài sản, vô hiệu hóa tài khoản</p>
        </div>
        {tab === 'list' && (
          <button onClick={() => setShowCreate(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 text-sm font-600 text-white transition-colors">
            <Plus className="h-4 w-4" /> Tạo Quy Trình
          </button>
        )}
      </div>

      <div className="flex gap-2 border-b border-line overflow-x-auto">
        <button onClick={() => setTab('list')} className={`px-3 py-2.5 text-sm font-500 border-b-2 flex items-center gap-1.5 whitespace-nowrap ${tab === 'list' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-muted-foreground'}`}>
          <Inbox className="h-4 w-4" /> Quy Trình ({processes.length})
        </button>
        <button onClick={() => setTab('archived')} className={`px-3 py-2.5 text-sm font-500 border-b-2 flex items-center gap-1.5 whitespace-nowrap ${tab === 'archived' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-muted-foreground'}`}>
          <Archive className="h-4 w-4" /> Lưu Trữ ({archived.length})
        </button>
        <button onClick={() => setTab('config')} className={`px-3 py-2.5 text-sm font-500 border-b-2 flex items-center gap-1.5 whitespace-nowrap ${tab === 'config' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-muted-foreground'}`}>
          <Settings2 className="h-4 w-4" /> Cấu Hình Checklist
        </button>
      </div>

      {tab === 'config' ? <ChecklistConfigPanel /> : tab === 'archived' ? (
        <>
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-muted-foreground leading-relaxed">
            Hồ sơ lưu trữ được <span className="text-foreground font-600">ẩn khỏi danh sách chính</span> nhưng vẫn giữ nguyên dữ liệu.
            Bấm <ArchiveRestore className="inline h-3 w-3 text-emerald-400" /> để khôi phục lại danh sách hoạt động.
          </div>
          {archivedError ? (
            <ErrorState message="Không tải được hồ sơ lưu trữ. Vui lòng thử lại." onRetry={loadArchived} />
          ) : archived.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-muted-foreground">
              <Archive className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">Chưa có hồ sơ nào được lưu trữ</p>
              <p className="text-xs mt-1 opacity-60">Bấm nút lưu trữ trên card quy trình để chuyển vào đây</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {archived.map((p) => renderCard(p, true))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            {STAT_CARDS.map((c) => {
              const st = OB_STATUS_LABELS[c.key];
              const active = filter === c.key;
              return (
                <button key={c.key} onClick={() => setFilter(active ? '' : c.key)}
                  className={`rounded-2xl border p-4 text-left transition-colors ${active ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-line-subtle hover:bg-hover'}`}
                  style={!active ? { background: 'var(--card)' } : undefined}>
                  <p className="text-2xl font-700 text-foreground">{counts[c.key] || 0}</p>
                  <p className={`text-2xs font-600 mt-0.5 ${st.color.split(' ')[0]}`}>{c.label}</p>
                </button>
              );
            })}
          </div>

          <div className="space-y-2.5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm theo tên, email, phòng ban..."
                className="w-full h-10 pl-9 pr-9 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <select value={reasonFilter} onChange={(e) => setReasonFilter(e.target.value)}
                className={`h-9 rounded-xl px-3 text-xs bg-surface-2 border focus:outline-none focus:border-indigo-500/60 ${reasonFilter ? 'border-indigo-500/50 text-foreground' : 'border-line text-muted-foreground'}`}>
                <option value="">Tất cả lý do</option>
                {reasonOptions.map((r) => <option key={r} value={r}>{OB_REASON_LABELS[r] || r}</option>)}
              </select>
              {companyOptions.length > 0 && (
                <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}
                  className={`h-9 rounded-xl px-3 text-xs bg-surface-2 border focus:outline-none focus:border-indigo-500/60 ${companyFilter ? 'border-indigo-500/50 text-foreground' : 'border-line text-muted-foreground'}`}>
                  <option value="">Tất cả công ty</option>
                  {companyOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              {deptOptions.length > 0 && (
                <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}
                  className={`h-9 rounded-xl px-3 text-xs bg-surface-2 border focus:outline-none focus:border-indigo-500/60 ${deptFilter ? 'border-indigo-500/50 text-foreground' : 'border-line text-muted-foreground'}`}>
                  <option value="">Tất cả phòng ban</option>
                  {deptOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              )}
              {hasActiveFilter && (
                <button onClick={clearFilters}
                  className="inline-flex items-center gap-1 h-9 rounded-xl px-3 text-xs text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors">
                  <X className="h-3.5 w-3.5" /> Xóa lọc
                </button>
              )}
              <span className="ml-auto text-xs text-muted-foreground">{filtered.length} kết quả</span>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : error ? (
            <ErrorState message="Không tải được danh sách quy trình nghỉ việc. Vui lòng thử lại." onRetry={load} />
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-muted-foreground">
              <UserMinus className="h-10 w-10 mb-3 opacity-30" />
              {hasActiveFilter ? (
                <>
                  <p className="text-sm">Không có quy trình nào khớp bộ lọc</p>
                  <button onClick={clearFilters} className="text-xs mt-2 text-indigo-400 hover:text-indigo-300">Xóa bộ lọc</button>
                </>
              ) : (
                <>
                  <p className="text-sm">Chưa có quy trình nghỉ việc nào</p>
                  <p className="text-xs mt-1 opacity-60">Bấm &quot;Tạo Quy Trình&quot; khi nhận được yêu cầu nghỉ việc từ nhân sự</p>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((p) => renderCard(p, false))}
            </div>
          )}
        </>
      )}

      {showCreate && (
        <CreateProcessModal
          onClose={() => setShowCreate(false)}
          onCreated={(p) => { setShowCreate(false); load(); setDetailId(p.id); }}
        />
      )}
      {detailId && (
        <ProcessDetailModal
          processId={detailId}
          onClose={() => setDetailId('')}
          onChanged={() => load()}
        />
      )}
      {editProcess && (
        <EditProcessModal
          process={editProcess}
          onClose={() => setEditProcess(null)}
          onSaved={(updated) => {
            setEditProcess(null);
            setProcesses(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
          }}
        />
      )}
    </div>
  );
}
