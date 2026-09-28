'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Building2,
  Download,
  Eye,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  createJd,
  authHeaders,
  deleteJd,
  downloadAuthed,
  fmtDate,
  JdItem,
  listJds,
  updateJd,
} from '@/lib/api/onboardingApi';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { JD_UNITS, JD_LOCATIONS, JD_WORK_TIMES, JD_SECTIONS, parseJdFields, serializeJdFields } from '@/lib/jdForm';
import { displayJdSalary, formatJdSalary } from '@/lib/jdSalary';

const JD_STATUS: Record<string, { label: string; color: string; strip: string }> = {
  draft: { label: 'Nháp', color: 'text-slate-200 bg-slate-500/15 border-slate-500/30', strip: '#64748b' },
  active: { label: 'Đang dùng', color: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30', strip: '#10b981' },
  archived: { label: 'Lưu trữ', color: 'text-amber-300 bg-amber-500/15 border-amber-500/30', strip: '#f59e0b' },
};

type SaveMode = 'create' | 'edit';

export default function JdPoolClient() {
  const toast = useToast();
  const showLoadError = toast.error;
  const confirm = useConfirm();
  const [items, setItems] = useState<JdItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<JdItem | null>(null);
  const [detail, setDetail] = useState<JdItem | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEscapeKey(() => setDetail(null), !!detail);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const loaded = await listJds();
        if (active) setItems(loaded);
      } catch (error) {
        console.error(error);
        if (active) showLoadError(error instanceof Error ? error.message : 'Không tải được kho JD');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [showLoadError]);

  const counts = useMemo(() => {
    const next: Record<string, number> = {};
    for (const item of items) next[item.status] = (next[item.status] || 0) + 1;
    return next;
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false;
      if (!q) return true;
      return [item.title, item.department_name, item.description].some((value) => value?.toLowerCase().includes(q));
    });
  }, [items, search, statusFilter]);

  // Selection never extends to records hidden by a new filter or search.
  useEffect(() => { setSelectedIds(new Set()); }, [search, statusFilter]);
  const selectedVisible = filtered.filter(item => selectedIds.has(item.id));
  const allSelected = filtered.length > 0 && selectedVisible.length === filtered.length;
  function toggleSelection(id: string) {
    setSelectedIds(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  async function handleBulkDelete() {
    const targets = selectedVisible;
    if (!targets.length || bulkDeleting) return;
    setBulkDeleting(true);
    try {
      const ok = await confirm({ title: `Xóa ${targets.length} JD đã chọn?`, message: 'Các bản mô tả công việc đã chọn sẽ bị xóa khỏi Kho JD. Những JD không được chọn sẽ được giữ nguyên.', confirmLabel: `Xóa ${targets.length} JD`, danger: true });
      if (!ok) return;
      const deleted = new Set<string>();
      for (const item of targets) {
        try { await deleteJd(item.id); deleted.add(item.id); } catch { /* Retain failed records for retry. */ }
      }
      setItems(previous => previous.filter(item => !deleted.has(item.id)));
      setSelectedIds(new Set(targets.filter(item => !deleted.has(item.id)).map(item => item.id)));
      setDetail(previous => previous && deleted.has(previous.id) ? null : previous);
      if (deleted.size) toast.success(`Đã xóa ${deleted.size} JD`);
      if (deleted.size < targets.length) toast.error(`${targets.length - deleted.size} JD chưa xóa được. Vui lòng thử lại.`);
      else setSelecting(false);
    } finally { setBulkDeleting(false); }
  }

  async function handleStatusChange(id: string, status: string) {
    try {
      const updated = await updateJd(id, { status });
      setItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không cập nhật được trạng thái');
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirm({
      title: 'Xóa JD?',
      message: 'Bạn chắc chắn muốn xóa bản mô tả công việc này?',
      confirmLabel: 'Xóa',
      danger: true,
    });
    if (!ok) return;

    try {
      await deleteJd(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      if (detail?.id === id) setDetail(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không xóa được JD');
    }
  }

  function handleSaved(jd: JdItem, mode: SaveMode, keepOpen = false) {
    setItems((prev) => {
      if (mode === 'create') return [jd, ...prev];
      return prev.map((item) => (item.id === jd.id ? jd : item));
    });
    setDetail((prev) => (prev?.id === jd.id ? jd : prev));
    if (!keepOpen) setShowCreate(false);
    if (mode === 'create') setStatusFilter('draft');
    setEditing(null);
    toast.success(mode === 'create' ? 'Đã thêm JD' : 'Đã cập nhật JD');
  }

  return (
    <div className="jd-pool space-y-5 sm:space-y-6">
      <Link href="/nguon-nhan-luc" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Tuyển Dụng
      </Link>

      <div className="jd-page-heading flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2.5 text-xl font-700 sm:text-2xl">
            <FileText className="h-6 w-6 text-amber-400" />
            Kho Mô Tả Công Việc
          </h1>
          <p className="mt-2 text-xs text-muted-foreground sm:text-sm">Quản lý JD tại một nơi. Tải lên, rà soát bản nháp và chia sẻ với ứng viên.</p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)} className="jd-create-button inline-flex shrink-0 items-center justify-center gap-2" aria-label="Thêm bản mô tả công việc mới">
          <span className="jd-create-button-icon"><Plus className="h-4 w-4" /></span>
          Thêm JD
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          disabled={bulkDeleting} onClick={() => setStatusFilter('')}
          aria-pressed={!statusFilter}
          className="jd-status-tab rounded-full border px-3 py-1.5 text-xs font-600"
        >
          Tất cả ({items.length})
        </button>
        {Object.entries(JD_STATUS).map(([key, meta]) => (
          <button
            key={key}
            disabled={bulkDeleting} onClick={() => setStatusFilter(statusFilter === key ? '' : key)}
            aria-pressed={statusFilter === key}
            className="jd-status-tab rounded-full border px-3 py-1.5 text-xs font-600"
          >
            <span className="inline-block mr-1.5 h-1.5 w-1.5 rounded-full" style={{ background: meta.strip }} />{meta.label} ({counts[key] || 0})
          </button>
        ))}
      </div>

      <div className="jd-search-toolbar flex flex-wrap items-center gap-3">
      <div className="relative min-w-0 flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          disabled={bulkDeleting}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm JD theo vị trí, phòng ban hoặc nội dung…"
          className="h-10 w-full rounded-xl border border-line bg-surface-2 pl-10 pr-3 text-sm text-foreground focus:border-indigo-500/60 focus:outline-none"
        />
      </div>

      <div className="flex shrink-0 justify-end">
        <button disabled={bulkDeleting || loading} onClick={() => { setSelecting(!selecting); setSelectedIds(new Set()); }} className={`inline-flex items-center gap-2 border px-3 py-2 text-xs disabled:opacity-50 ${selecting ? 'border-red-300 text-red-500 hover:bg-red-50' : 'rounded-lg border-line text-blue-600 hover:bg-blue-50'}`}>
          {selecting && <X className="h-3.5 w-3.5" />}{selecting ? 'Xong' : 'Chọn nhiều'}
        </button>
      </div>
      </div>
      {selecting && <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-blue-200 bg-indigo-500/5 px-3 py-2 text-xs">
        <label className="inline-flex cursor-pointer items-center gap-2 text-blue-600"><input type="checkbox" disabled={bulkDeleting || !filtered.length} checked={allSelected} onChange={() => setSelectedIds(allSelected ? new Set() : new Set(filtered.map(item => item.id)))} className="h-4 w-4 accent-indigo-500" />{allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}</label>
        <span className="text-muted-foreground">Bấm vào thẻ JD để chọn</span>
        <span role="status" className="text-blue-600">Đã chọn {selectedVisible.length} JD</span>
        <button disabled={bulkDeleting || !selectedVisible.length} onClick={handleBulkDelete} className="ml-auto inline-flex items-center gap-1.5 text-red-500 hover:text-red-700 disabled:opacity-40">{bulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}Xóa đã chọn ({selectedVisible.length})</button>
      </div>}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <FileText className="mb-3 h-10 w-10 opacity-30" />
          <p className="text-sm">{search || statusFilter ? 'Không tìm thấy JD phù hợp' : 'Kho JD trống'}</p>
          <p className="mt-1 text-xs opacity-60">Thêm bản mô tả công việc để dùng lại cho các đợt tuyển dụng.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground"><span className="font-600">{statusFilter ? JD_STATUS[statusFilter]?.label : 'Tất cả mô tả công việc'}</span><span>{filtered.length} JD{search ? ' phù hợp' : ''}</span></div>
          {filtered.map((jd) => {
            const meta = JD_STATUS[jd.status] || JD_STATUS.draft;
            const fields = parseJdFields(jd.description);
            return (
              <div
                key={jd.id}
                onClick={event => { if (selecting && !bulkDeleting && !(event.target as HTMLElement).closest('button, input, select, a, label')) toggleSelection(jd.id); }}
                className={`jd-card group relative flex flex-col overflow-hidden rounded-2xl border transition-colors ${selecting && selectedIds.has(jd.id) ? 'border-blue-400 ring-1 ring-blue-200' : 'border-line-subtle hover:border-indigo-500/30'} ${selecting ? 'cursor-pointer' : ''}`}
                style={{ background: 'var(--card)' }}
              >
                <div className="jd-list-row p-5">
                  <div className="jd-row-title flex flex-wrap items-center gap-3">
                    {selecting && <input type="checkbox" aria-label={`Chọn JD ${jd.title}`} disabled={bulkDeleting} checked={selectedIds.has(jd.id)} onChange={() => toggleSelection(jd.id)} className="h-5 w-5 shrink-0 accent-blue-600" />}
                    <h2 className="min-w-0 text-base font-600 leading-snug text-foreground"><button disabled={bulkDeleting} onClick={() => selecting ? toggleSelection(jd.id) : setDetail(jd)} className="text-left hover:text-blue-600">{jd.title}</button></h2>
                    <select
                      aria-label={`Trạng thái JD ${jd.title}`}
                      value={jd.status}
                      disabled={bulkDeleting}
                      onChange={(e) => handleStatusChange(jd.id, e.target.value)}
                      className={`shrink-0 cursor-pointer rounded-full border bg-transparent px-2 py-0.5 text-2xs font-600 focus:outline-none ${meta.color}`}
                    >
                      {Object.entries(JD_STATUS).map(([key, statusMeta]) => (
                        <option key={key} value={key} className="bg-surface-2 text-foreground">
                          {statusMeta.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {(fields.unit || jd.department_name) && (
                    <p className="jd-row-unit flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5 shrink-0" />
                      {[fields.unit, jd.department_name].filter(Boolean).join(' · ')}
                    </p>
                  )}

                  <dl className="jd-row-details grid grid-cols-2 gap-3">
                    <div><dt className="text-2xs text-muted-foreground">Địa điểm</dt><dd className="mt-1 text-sm font-600 text-foreground">{{ HN: 'Hà Nội', HCM: 'TP. Hồ Chí Minh' }[fields.location] || fields.location || 'Chưa cập nhật'}</dd></div>
                    <div><dt className="text-2xs text-muted-foreground">Số lượng tuyển</dt><dd className="mt-1 text-sm font-600 text-foreground">{fields.headcount ? `${fields.headcount} người` : 'Chưa cập nhật'}</dd></div>
                    <div className="col-span-2"><dt className="text-2xs text-muted-foreground">Khung lương</dt><dd className="mt-1 text-sm font-600 text-foreground">{displayJdSalary(fields.salary)}</dd></div>
                  </dl>

                  <div className="jd-row-actions space-y-3">
                    <span className="text-2xs text-muted-foreground">Ngày tạo <span className="ml-1 font-600">{fmtDate(jd.created_at)}</span></span>
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => setDetail(jd)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs font-600 text-blue-700 hover:bg-blue-100" title="Xem chi tiết và xuất PDF">
                        <Eye className="h-3.5 w-3.5" /> Xem JD
                      </button>
                      <button onClick={() => setEditing(jd)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs text-muted-foreground hover:bg-hover" title="Sửa JD">
                        <Pencil className="h-3.5 w-3.5" /> Sửa
                      </button>
                      {jd.file_name && (
                        <button
                          onClick={() => downloadAuthed(`/api/hr/jd/${jd.id}`, jd.file_name!).catch((error) => toast.error(error.message))}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs text-muted-foreground hover:bg-hover"
                          title={jd.file_name}
                        >
                          <Download className="h-3.5 w-3.5" /> File gốc
                        </button>
                      )}
                      <button disabled={bulkDeleting} onClick={() => handleDelete(jd.id)} className="ml-auto rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600" title="Xóa JD" aria-label={`Xóa JD ${jd.title}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && <JdModal mode="create" onClose={() => setShowCreate(false)} onSaved={handleSaved} />}
      {editing && <JdModal mode="edit" initial={editing} onClose={() => setEditing(null)} onSaved={handleSaved} />}
      {detail && (
        <JdDetailModal
          jd={detail}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setEditing(detail);
            setDetail(null);
          }}
        />
      )}
    </div>
  );
}

function JdDetailModal({ jd, onClose, onEdit }: { jd: JdItem; onClose: () => void; onEdit: () => void }) {
  const fields = parseJdFields(jd.description);
  const [exporting, setExporting] = useState(false);
  const toast = useToast();
  const exportPdf = async () => {
    setExporting(true);
    try { await downloadAuthed(`/api/hr/jd/${jd.id}/pdf`, `JD - ${jd.title.replace(/[\\/:*?"<>|]/g, '-')}.pdf`); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Không xuất được PDF'); }
    finally { setExporting(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Chi tiết JD" className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-line" style={{ background: 'var(--card)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
          <div className="min-w-0">
            <p className="mb-1 text-xs text-muted-foreground">BẢN MÔ TẢ CÔNG VIỆC</p>
            <h2 className="text-lg font-700 text-foreground">{jd.title}</h2>
            {jd.department_name && <p className="text-xs text-indigo-400">{jd.department_name}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button disabled={exporting} onClick={exportPdf} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-600 text-white disabled:opacity-50">{exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Xuất PDF</button>
            <button onClick={onEdit} className="btn-ghost rounded-lg p-1.5" title="Sửa JD">
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={onClose} className="btn-ghost rounded-lg p-1.5">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="space-y-4 overflow-y-auto p-6">
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-2xs font-600 ${JD_STATUS[jd.status]?.color || JD_STATUS.draft.color}`}>
              {JD_STATUS[jd.status]?.label || jd.status}
            </span>
            <span className="rounded-full border border-line px-2.5 py-1 text-2xs text-muted-foreground">{fmtDate(jd.created_at)}</span>
          </div>
          <dl className="grid gap-x-6 gap-y-4 rounded-xl bg-slate-50 p-5 sm:grid-cols-2">
            {(['unit','location','salary','headcount','work_time'] as const).filter(key => fields[key]).map(key => <div key={key} className={key === 'work_time' ? 'sm:col-span-2' : ''}><dt className="mb-1 text-xs text-muted-foreground">{JD_SECTIONS[key]}</dt><dd className="text-sm font-600 text-foreground">{key === 'location' ? ({ HN: 'Hà Nội', HCM: 'TP. Hồ Chí Minh' }[fields[key]] || fields[key]) : key === 'salary' ? displayJdSalary(fields.salary) : fields[key]}</dd></div>)}
          </dl>
          {([
            { title: '01 · Mô tả công việc', keys: ['purpose','objectives','duties'] },
            { title: '02 · Yêu cầu ứng viên', keys: ['requirements'] },
            { title: '03 · Quyền lợi ứng viên', keys: ['benefits'] },
          ] as const).map(section => <section key={section.title} className="border-t border-line-subtle pt-5"><h3 className="mb-4 text-base font-700 text-foreground">{section.title}</h3>{section.keys.some(key => fields[key]) ? section.keys.filter(key => fields[key]).map(key => <div key={key} className="mb-4">{section.keys.length > 1 && <h4 className="mb-2 text-sm font-600 text-foreground">{key === 'duties' ? 'Các công việc chính' : JD_SECTIONS[key]}</h4>}<p className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground">{fields[key]}</p></div>) : <p className="text-sm text-muted-foreground">Chưa có nội dung.</p>}</section>)}
        </div>
      </div>
    </div>
  );
}

function JdModal({
  mode,
  initial,
  onClose,
  onSaved,
}: {
  mode: SaveMode;
  initial?: JdItem | null;
  onClose: () => void;
  onSaved: (jd: JdItem, mode: SaveMode, keepOpen?: boolean) => void;
}) {
  const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose);
  const [form, setForm] = useState({
    title: initial?.title ?? '',
    department_name: initial?.department_name ?? '',
    ...parseJdFields(initial?.description),
  });
  const [file, setFile] = useState<File | null>(null);
  type Draft = { file: File; form: typeof form; error: string; message: string };
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activeDraft, setActiveDraft] = useState(0);
  const [scanProgress, setScanProgress] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractionMessage, setExtractionMessage] = useState('');
  const extractionController = useRef<AbortController | null>(null);
  useEffect(() => () => extractionController.current?.abort(), []);
  async function readFiles(selected: File[]) {
    if (selected.length <= 1 && !drafts.length) { await readFile(selected[0] || null); return; }
    if (selected.length > 30) { setError('Vui lòng chọn tối đa 30 file mỗi lần.'); return; }
    extractionController.current?.abort();
    const controller = new AbortController(); extractionController.current = controller;
    setExtracting(true); setError(''); markDirty();
    const next: Draft[] = [];
    for (const [index, selectedFile] of selected.entries()) {
      if (controller.signal.aborted) return;
      setScanProgress(`Đang quét file ${index + 1}/${selected.length}: ${selectedFile.name}`);
      const entry: Draft = { file: selectedFile, form: { title: '', department_name: '', ...parseJdFields(null) }, error: '', message: '' };
      try {
        const body = new FormData(); body.append('file', selectedFile);
        const response = await fetch('/api/hr/jd/extract', { method: 'POST', headers: authHeaders(), body, signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Không đọc được JD');
        for (const key of Object.keys(entry.form) as (keyof typeof form)[]) {
          if (typeof result.data.fields[key] === 'string') entry.form[key] = result.data.fields[key];
        }
        entry.message = ['Đã quét riêng file này. Kiểm tra nội dung trước khi lưu.', ...(result.data.warnings || [])].join(' ');
      } catch (failure) {
        if (controller.signal.aborted) return;
        entry.error = failure instanceof Error ? failure.message : 'Không quét được file';
      }
      next.push(entry);
    }
    if (controller.signal.aborted) return;
    setDrafts(next); setActiveDraft(0); setExtracting(false); setScanProgress('');
    if (next[0]) { setForm(next[0].form); setFile(next[0].file); setError(next[0].error); setExtractionMessage(next[0].message); }
  }
  function selectDraft(index: number) {
    if (index === activeDraft) return;
    setDrafts(previous => previous.map((entry, position) => position === activeDraft ? { ...entry, form } : entry));
    setActiveDraft(index); setForm(drafts[index].form); setFile(drafts[index].file);
    setError(drafts[index].error); setExtractionMessage(drafts[index].message);
  }
  async function readFile(selected: File | null) {
    extractionController.current?.abort();
    setFile(selected); setExtractionMessage(''); setError(''); markDirty();
    if (!selected) { setExtracting(false); return; }
    const controller = new AbortController(); extractionController.current = controller;
    setExtracting(true);
    try {
      const body = new FormData(); body.append('file', selected);
      const response = await fetch('/api/hr/jd/extract', { method: 'POST', headers: authHeaders(), body, signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Không đọc được JD');
      if (controller.signal.aborted) return;
      setForm(previous => {
        const next = { ...previous };
        for (const key of Object.keys(previous) as (keyof typeof previous)[]) {
          const value = result.data.fields[key];
          if (!previous[key].trim() && typeof value === 'string' && value.trim()) next[key] = value;
        }
        return next;
      });
      setExtractionMessage(['Đã quét JD và điền các ô còn trống. Vui lòng kiểm tra nội dung trước khi lưu.', ...result.data.warnings].join(' '));
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(error instanceof Error ? error.message : 'Không quét được JD');
        setForm(previous => ({ ...previous, title: previous.title || selected.name.replace(/\.[^.]+$/, '') }));
      }
    } finally { if (!controller.signal.aborted) setExtracting(false); }
  }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEscapeKey(() => { if (!saving) guardedClose(); });

  const isEdit = mode === 'edit';
  const inputCls = 'w-full h-10 rounded-xl border border-line bg-surface-2 px-3 text-sm text-foreground focus:border-indigo-500/60 focus:outline-none';

  async function handleSave() {
    if (!isEdit && drafts.length) {
      const queue = drafts.map((entry, index) => index === activeDraft ? { ...entry, form } : entry);
      setSaving(true); setError('');
      const failed: Draft[] = [];
      let lastSaved: JdItem | null = null;
      for (const entry of queue) {
        try {
          const fd = new FormData();
          fd.append('title', entry.form.title.trim() || entry.file.name.replace(/\.[^.]+$/, ''));
          fd.append('department_name', entry.form.department_name.trim());
          fd.append('description', serializeJdFields(entry.form));
          fd.append('status', 'draft'); fd.append('file', entry.file);
          const saved = await createJd(fd);
          onSaved(saved, mode, true); lastSaved = saved;
        } catch (failure) { failed.push({ ...entry, error: failure instanceof Error ? failure.message : 'Không lưu được JD' }); }
      }
      setSaving(false);
      if (failed.length) {
        setDrafts(failed); setActiveDraft(0); setForm(failed[0].form); setFile(failed[0].file);
        setError(`${failed.length} JD chưa lưu. ${failed[0].error} Các JD đã lưu không bị lưu lại khi thử lại.`);
      } else { markClean(); if (lastSaved) onClose(); }
      return;
    }
    if (!form.title.trim()) {
      setError('Vui lòng nhập tiêu đề JD');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const description = serializeJdFields(form);
      let saved: JdItem;
      if (isEdit) {
        if (file) {
          const fd = new FormData();
          fd.append('title', form.title.trim());
          fd.append('department_name', form.department_name.trim());
          fd.append('description', description);
          fd.append('file', file);
          saved = await updateJd(initial!.id, fd);
        } else {
          saved = await updateJd(initial!.id, {
            title: form.title.trim(),
            department_name: form.department_name.trim() || null,
            description,
          });
        }
      } else {
        const fd = new FormData();
        fd.append('title', form.title.trim());
        if (form.department_name.trim()) fd.append('department_name', form.department_name.trim());
        fd.append('description', description);
        fd.append('status', 'draft');
        if (file) fd.append('file', file);
        saved = await createJd(fd);
      }

      const remaining = drafts.filter((_, index) => index !== activeDraft);
      if (remaining.length) {
        setDrafts(remaining); setActiveDraft(0); setForm(remaining[0].form); setFile(remaining[0].file);
        setError(remaining[0].error); setExtractionMessage(remaining[0].message);
        onSaved(saved, mode, true);
      } else {
        markClean(); onSaved(saved, mode);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Không lưu được JD');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={() => { if (!saving) guardedClose(); }}>
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden rounded-3xl border border-line" style={{ background: 'var(--card)' }} onClick={(e) => e.stopPropagation()} onChange={markDirty}>
        <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
          <h2 className="text-base font-700 text-foreground">{isEdit ? 'Sửa JD' : 'Thêm JD'}</h2>
          <button disabled={saving} onClick={guardedClose} className="btn-ghost rounded-lg p-1.5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-6 overflow-y-auto min-h-0">
          {drafts.length > 0 && <section className="rounded-2xl border border-line bg-surface-2 p-4"><h3 className="font-700">{drafts.length} JD chưa lưu · Mỗi file là một JD riêng</h3><p className="mb-3 text-sm text-muted-foreground">Bấm Lưu JD để lưu tất cả vào tab Nháp. Bạn có thể rà soát và chỉnh sửa lần cuối tại đó trước khi chuyển trạng thái.</p><div className="flex flex-wrap gap-2">{drafts.map((draft, index) => <button key={index} disabled={saving || extracting} onClick={() => selectDraft(index)} className={`max-w-full truncate rounded-xl border px-3 py-2 text-sm ${index === activeDraft ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-line'}`}>{index + 1}. {draft.file.name}{draft.error ? ' · Quét lỗi' : ''}</button>)}</div></section>}
          <fieldset disabled={extracting || saving} className="space-y-4 disabled:opacity-60">
          <h3 className="font-700 text-foreground">Thông tin tuyển dụng</h3>
          <label className="block text-sm text-foreground">Vị trí tuyển dụng / Tiêu đề JD *</label>
          <input
            className={inputCls}
            placeholder="Tiêu đề JD *"
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
          />
          <label className="block text-sm text-foreground">Phòng ban</label>
          <input
            className={inputCls}
            placeholder="Phòng ban"
            value={form.department_name}
            onChange={(e) => setForm((prev) => ({ ...prev, department_name: e.target.value }))}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {([['unit', JD_UNITS], ['location', JD_LOCATIONS], ['work_time', JD_WORK_TIMES]] as const).map(([key, options]) => <label key={key} className={`block space-y-2 text-sm text-foreground ${key === 'work_time' ? 'sm:col-span-2' : ''}`}><span>{JD_SECTIONS[key]}</span><select className={inputCls} value={form[key]} onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}><option value="">Chọn {JD_SECTIONS[key].toLowerCase()}</option>{options.map(option => <option key={option} value={option}>{option}</option>)}</select></label>)}
            <label className="block space-y-2 text-sm text-foreground"><span>Khung lương</span><div className="relative"><input aria-label="Khung lương" aria-describedby="jd-salary-unit" className={`${inputCls} pr-28`} value={formatJdSalary(form.salary)} placeholder="Ví dụ: 20.000.000" onChange={e => setForm(prev => ({ ...prev, salary: formatJdSalary(e.target.value) }))} /><span id="jd-salary-unit" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">Triệu Đồng</span></div></label>
            <label className="block space-y-2 text-sm text-foreground"><span>Số lượng tuyển</span><input type="number" min="1" step="1" className={inputCls} value={form.headcount} onChange={e => setForm(prev => ({ ...prev, headcount: e.target.value }))} /></label>
          </div>
          {([
            { title: '1. Mô tả công việc', keys: ['purpose', 'objectives', 'duties'] },
            { title: '2. Yêu cầu ứng viên', keys: ['requirements'] },
            { title: '3. Quyền lợi ứng viên', keys: ['benefits'] },
          ] as const).map(section => <section key={section.title} className="space-y-4 rounded-2xl border border-line p-4"><h3 className="font-700 text-foreground">{section.title}</h3>{section.keys.map(key => <label key={key} className="block space-y-2 text-sm text-foreground"><span>{key === 'duties' ? 'Các công việc chính' : JD_SECTIONS[key]}</span><textarea className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500" rows={key === 'purpose' || key === 'objectives' ? 3 : 6} value={form[key]} placeholder={key === 'requirements' ? 'Học vấn, kinh nghiệm, kỹ năng, ngoại ngữ…' : key === 'benefits' ? 'Thu nhập, bảo hiểm, nghỉ phép, đào tạo và phúc lợi…' : 'Nhập nội dung, mỗi ý trên một dòng…'} onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))} /></label>)}</section>)}

          </fieldset>
          <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-dashed border-line px-3.5 py-3 hover:border-indigo-500/40">
            <input type="file" className="hidden" multiple={!isEdit} disabled={saving || extracting || drafts.length > 0} accept=".pdf,.docx,.png,.jpg,.jpeg,.webp" onChange={(e) => { const selected = Array.from(e.target.files || []); if (selected.length) void (isEdit ? readFile(selected[0]) : readFiles(selected)); e.target.value = ''; }} />
            <Upload className="h-4 w-4 shrink-0 text-indigo-400" />
            <span className="truncate text-sm text-muted-foreground">
              {file
                ? file.name
                : isEdit
                  ? (initial?.file_name || 'Chọn file mới để thay thế file JD hiện tại')
                  : 'Tải một hoặc nhiều file JD · Tối đa 30 file, 10MB/file'}
            </span>
          </label>

          {extracting && <p role="status" className="flex items-center gap-2 text-sm text-blue-600"><Loader2 className="h-4 w-4 animate-spin" />{scanProgress || 'Đang đọc JD và nhận diện nội dung…'}</p>}
          {extractionMessage && <p role="status" className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800">{extractionMessage}</p>}

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
          <button disabled={saving} onClick={guardedClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">
            Hủy
          </button>
          <button onClick={handleSave} disabled={saving || extracting || (!drafts.length && !form.title.trim())} className="btn-indigo flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-600 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? 'Cập nhật JD' : drafts.length ? `Lưu JD (${drafts.length})` : 'Lưu JD'}
          </button>
        </div>
      </div>
    </div>
  );
}
