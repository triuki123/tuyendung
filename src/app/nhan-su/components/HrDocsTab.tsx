'use client';

import { useEffect, useState } from 'react';
import {
  Loader2, Upload, Download, Trash2, FolderOpen, Search,
  Eye, X, FileText, FileImage, FileSpreadsheet, File,
  Users, SlidersHorizontal, UserMinus, ArrowLeft, ChevronRight, History,
} from 'lucide-react';
import RecordHistoryDrawer from '@/components/ui/RecordHistoryDrawer';
import EmployeePicker from './EmployeePicker';
import BmhsManageButton from './BmhsManageButton';
import HrUploadModal from './HrUploadModal';
import BulkUploadModal from './BulkUploadModal';
import ReplaceRequestsPanel from './ReplaceRequestsPanel';
import FilePreviewModal from './FilePreviewModal';
import {
  HrDocument, LookupItem, UserOption, DepartedPerson,
  listHrDocuments, listAllHrDocuments, deleteHrDocument, fmtBytes, openFilePreview,
  listDepartedPersonnel,
} from './hrApi';
import { useConfirm } from '@/context/ConfirmContext';

interface Props {
  docTypes: LookupItem[];
  canEdit: boolean;
}

type ViewMode = 'employee' | 'all' | 'archived';

function fileIcon(mime: string | null) {
  if (!mime) return <File className="h-4 w-4 text-muted-foreground" />;
  if (mime.startsWith('image/')) return <FileImage className="h-4 w-4 text-sky-400" />;
  if (mime === 'application/pdf') return <FileText className="h-4 w-4 text-red-400" />;
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv'))
    return <FileSpreadsheet className="h-4 w-4 text-emerald-400" />;
  if (mime.includes('word') || mime.includes('document'))
    return <FileText className="h-4 w-4 text-indigo-400" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

function canPreview(mime: string | null, name?: string): boolean {
  if (!mime && !name) return false;
  if (mime) {
    if (mime === 'application/pdf') return true;
    if (mime.startsWith('image/')) return true;
    if (mime.includes('wordprocessingml') || mime.includes('msword')) return true;
    if (mime.includes('spreadsheetml') || mime.includes('excel') || mime === 'text/csv') return true;
  }
  if (name) {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (['pdf','jpg','jpeg','png','gif','webp','doc','docx','xls','xlsx','csv'].includes(ext)) return true;
  }
  return false;
}

function fmtDate(val: string): string {
  const s = val.slice(0, 10);
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

export default function HrDocsTab({ docTypes, canEdit }: Props) {
  const confirm = useConfirm();
  const [viewMode, setViewMode] = useState<ViewMode>('employee');
  const [employee, setEmployee] = useState<UserOption | null>(null);
  const [docs, setDocs] = useState<HrDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<HrDocument | null>(null);
  const [historyOf, setHistoryOf] = useState<{ id: string; name: string } | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  // Chọn nhiều — CHỈ ở chế độ "Tất cả" (xóa/tải hàng loạt, không xem hàng loạt)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // Tab "Đã nghỉ" — danh sách nhân sự inactive
  const [departed, setDeparted] = useState<DepartedPerson[]>([]);
  const [departedLoading, setDepartedLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      if (viewMode === 'all') {
        setDocs(await listAllHrDocuments(typeFilter || undefined));
      } else if (employee) {
        setDocs(await listHrDocuments(employee.id));
      } else {
        setDocs([]);
      }
    } catch { setDocs([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [viewMode, employee, typeFilter]);

  // Danh sách nhân sự đã nghỉ (tab "Đã nghỉ", khi chưa chọn ai) — tìm theo tên (debounce nhẹ)
  useEffect(() => {
    if (viewMode !== 'archived' || employee) return;
    setDepartedLoading(true);
    const t = setTimeout(() => {
      listDepartedPersonnel(search).then(setDeparted).catch(() => setDeparted([]))
        .finally(() => setDepartedLoading(false));
    }, search ? 250 : 0);
    return () => clearTimeout(t);
    /* eslint-disable-next-line */
  }, [viewMode, employee, search]);

  const filtered = docs.filter((d) =>
    (!search ||
      (d.title || d.file_name).toLowerCase().includes(search.toLowerCase()) ||
      (d.employee_name || '').toLowerCase().includes(search.toLowerCase())) &&
    (!typeFilter || viewMode === 'all' || d.doc_type_id === typeFilter || (!d.doc_type_id && typeFilter === '__none__'))
  );

  const canUpload = canEdit && (viewMode === 'all' ? true : !!employee);
  const hasFilter = !!(search || typeFilter);
  const selectable = viewMode === 'all';

  // Bỏ chọn khi đổi chế độ/nhân viên/bộ lọc (tránh chọn "ma" còn sót)
  useEffect(() => { setSelected(new Set()); }, [viewMode, employee, typeFilter]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  const allSelected = filtered.length > 0 && filtered.every((d) => selected.has(d.id));
  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(filtered.map((d) => d.id)));
  }

  function handlePreview(d: HrDocument) {
    setPreviewDoc(d);
  }

  function handleDownload(docId: string) {
    openFilePreview(`/api/hr-documents/${docId}`, true).catch(() => {});
  }

  // Tải hàng loạt — tải tuần tự từng tệp (tránh trình duyệt chặn nhiều download cùng lúc)
  async function handleBulkDownload() {
    const ids = filtered.filter((d) => selected.has(d.id)).map((d) => d.id);
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      for (const id of ids) {
        await openFilePreview(`/api/hr-documents/${id}`, true).catch(() => {});
      }
    } finally { setBulkBusy(false); }
  }

  // Xóa hàng loạt
  async function handleBulkDelete() {
    const ids = filtered.filter((d) => selected.has(d.id)).map((d) => d.id);
    if (ids.length === 0) return;
    if (!await confirm({ title: 'Xóa hồ sơ đã chọn?', message: `Xóa ${ids.length} hồ sơ đã chọn?`, confirmLabel: 'Xóa', danger: true })) return;
    setBulkBusy(true);
    try {
      for (const id of ids) {
        await deleteHrDocument(id).catch(() => {});
      }
      setSelected(new Set());
      await load();
    } finally { setBulkBusy(false); }
  }

  return (
    <div className="space-y-4">

      {/* Yêu cầu đổi hồ sơ */}
      {canEdit && <ReplaceRequestsPanel onDocChanged={load} />}

      {/* ── Controls ── */}
      <div className="space-y-2.5">

        {/* Row 1: Mode toggle */}
        <div className="flex rounded-xl border border-line overflow-hidden" style={{ background: 'var(--input)' }}>
          <button
            onClick={() => { setViewMode('employee'); setSearch(''); setTypeFilter(''); }}
            className={`flex-1 py-2 text-sm flex items-center justify-center gap-1.5 transition-colors ${viewMode === 'employee' ? 'bg-indigo-600 text-white font-600' : 'text-muted-foreground hover:text-foreground'}`}>
            <FolderOpen className="h-4 w-4" /> Theo nhân viên
          </button>
          <button
            onClick={() => { setViewMode('all'); setEmployee(null); setSearch(''); }}
            className={`flex-1 py-2 text-sm flex items-center justify-center gap-1.5 transition-colors ${viewMode === 'all' ? 'bg-indigo-600 text-white font-600' : 'text-muted-foreground hover:text-foreground'}`}>
            <Users className="h-4 w-4" /> Tất cả
          </button>
          <button
            onClick={() => { setViewMode('archived'); setEmployee(null); setSearch(''); setTypeFilter(''); }}
            className={`flex-1 py-2 text-sm flex items-center justify-center gap-1.5 transition-colors ${viewMode === 'archived' ? 'bg-indigo-600 text-white font-600' : 'text-muted-foreground hover:text-foreground'}`}>
            <UserMinus className="h-4 w-4" /> Đã nghỉ
          </button>
        </div>

        {/* Row 2: Employee picker */}
        {viewMode === 'employee' && (
          <EmployeePicker
            value={employee}
            onChange={(u) => { setEmployee(u); setSearch(''); setTypeFilter(''); }}
            placeholder="Chọn nhân viên…"
          />
        )}

        {/* Row 3: Search + filter + upload */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={viewMode === 'archived' && !employee ? 'Tìm nhân sự đã nghỉ…' : 'Tìm tệp…'}
              className="w-full rounded-xl border border-line pl-8 pr-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500"
              style={{ background: 'var(--input)' }}
            />
          </div>

          {viewMode === 'employee' && (
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`shrink-0 rounded-xl border px-3 py-2 flex items-center gap-1.5 ${showFilters || typeFilter ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400' : 'border-line text-muted-foreground hover:text-foreground hover:bg-hover'}`}>
              <SlidersHorizontal className="h-4 w-4" />
              {typeFilter && <span className="rounded-full bg-indigo-500 text-white text-2xs px-1.5 py-0.5 leading-none">1</span>}
            </button>
          )}

          {/* Khóa Bảo Mật Hồ Sơ cho nhân viên đang chọn (chỉ super_admin+BMHS thấy) */}
          {viewMode === 'employee' && employee && (
            <BmhsManageButton employeeId={employee.id} employeeName={employee.name} />
          )}

          {canUpload && (
            <button
              onClick={() => setShowUpload(true)}
              className="shrink-0 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-3 py-2 text-sm font-600 text-white flex items-center gap-1.5">
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Tải lên</span>
            </button>
          )}

          {canUpload && (
            <button
              onClick={() => setShowBulkUpload(true)}
              className="hidden sm:flex shrink-0 rounded-xl border border-indigo-500/50 bg-indigo-500/10 hover:bg-indigo-500/20 px-3 py-2 text-sm text-indigo-400 items-center gap-1.5">
              <Upload className="h-4 w-4" /> Đồng loạt
            </button>
          )}
        </div>

        {/* Bulk upload — mobile only */}
        {canUpload && (
          <button
            onClick={() => setShowBulkUpload(true)}
            className="sm:hidden w-full rounded-xl border border-indigo-500/50 bg-indigo-500/10 py-2 text-sm text-indigo-400 flex items-center justify-center gap-1.5">
            <Upload className="h-4 w-4" /> Tải lên đồng loạt
          </button>
        )}
      </div>

      {/* Filter panel */}
      {showFilters && viewMode === 'employee' && (
        <div className="rounded-2xl border border-line-subtle p-4 space-y-2" style={{ background: 'var(--card)' }}>
          <label className="text-2xs font-600 uppercase tracking-wider text-muted-foreground">Loại hồ sơ</label>
          <div className="flex gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="flex-1 rounded-xl border border-line px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500"
              style={{ background: 'var(--input)' }}>
              <option value="">Tất cả loại</option>
              {docTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              <option value="__none__">Chưa phân loại</option>
            </select>
            {typeFilter && (
              <button
                onClick={() => setTypeFilter('')}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground rounded-xl border border-line px-3">
                <X className="h-3.5 w-3.5" /> Xóa
              </button>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      {docs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs text-muted-foreground">
            Tổng: <span className="font-600 text-foreground">{docs.length} tệp</span>
          </span>
          {Object.entries(
            docs.reduce<Record<string, number>>((acc, d) => {
              const key = d.doc_type_name || 'Khác';
              acc[key] = (acc[key] || 0) + 1;
              return acc;
            }, {})
          ).map(([type, count]) => (
            <span key={type} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
              {type} <span className="font-600 text-foreground">{count}</span>
            </span>
          ))}
        </div>
      )}

      {/* Thanh hành động hàng loạt — chỉ ở "Tất cả" và khi đã chọn ≥1 */}
      {selectable && selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-3 py-2">
          <span className="text-sm font-600 text-indigo-300">Đã chọn {selected.size}</span>
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-muted-foreground hover:text-foreground">Bỏ chọn</button>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handleBulkDownload}
              disabled={bulkBusy}
              className="rounded-lg border border-line bg-hover hover:bg-hover-strong px-3 py-1.5 text-xs font-600 text-foreground flex items-center gap-1.5 disabled:opacity-50">
              {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Tải xuống
            </button>
            {canEdit && (
              <button
                onClick={handleBulkDelete}
                disabled={bulkBusy}
                className="rounded-lg border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 text-xs font-600 text-red-400 flex items-center gap-1.5 disabled:opacity-50">
                <Trash2 className="h-3.5 w-3.5" /> Xóa
              </button>
            )}
          </div>
        </div>
      )}

      {/* Nút quay lại danh sách nhân sự đã nghỉ */}
      {viewMode === 'archived' && employee && (
        <button onClick={() => { setEmployee(null); setSearch(''); }}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Danh sách nhân sự đã nghỉ
        </button>
      )}

      {/* Content */}
      {viewMode === 'archived' && !employee ? (
        departedLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : departed.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-muted-foreground">
            <UserMinus className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">{search ? 'Không tìm thấy nhân sự đã nghỉ phù hợp' : 'Chưa có nhân sự nào đã nghỉ'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {departed.map((p) => (
              <button key={p.id}
                onClick={() => { setEmployee({ id: p.id, name: p.name, email: p.email }); setSearch(''); }}
                className="flex items-center gap-3 rounded-xl border border-line-subtle p-3 text-left hover:bg-hover transition-colors"
                style={{ background: 'var(--card)' }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-700 text-white shrink-0 overflow-hidden"
                  style={{ background: 'linear-gradient(135deg, #64748b, #475569)' }}>
                  {p.avatar && p.avatar.startsWith('/')
                    ? <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
                    : (p.name?.charAt(0).toUpperCase() ?? '?')}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-600 text-foreground truncate">{p.name}</p>
                  <p className="text-2xs text-muted-foreground truncate">
                    {[p.department_name, p.company_name].filter(Boolean).join(' · ') || p.email}
                  </p>
                  <p className="text-2xs text-muted-foreground/70 mt-0.5">
                    {p.left_date ? `Nghỉ: ${fmtDate(p.left_date)}` : 'Đã nghỉ'} · {p.doc_count} hồ sơ
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
              </button>
            ))}
          </div>
        )
      ) : loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : viewMode === 'employee' && !employee ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <FolderOpen className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Chọn nhân viên để xem hồ sơ</p>
          <p className="text-xs mt-1 opacity-60">Hoặc chuyển sang "Tất cả" để xem toàn bộ</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground">
          <FolderOpen className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">{hasFilter ? 'Không tìm thấy tệp phù hợp' : 'Chưa có hồ sơ'}</p>
          {hasFilter && (
            <button onClick={() => { setSearch(''); setTypeFilter(''); }}
              className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
              <X className="h-3 w-3" /> Xóa tìm kiếm
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="sm:hidden space-y-2">
            {filtered.map((d) => {
              const previewKind = canPreview(d.mime_type, d.file_name);
              const displayName = d.title || d.file_name;
              return (
                <div key={d.id} className={`rounded-2xl border p-4 ${selected.has(d.id) ? 'border-indigo-500/40 bg-indigo-500/5' : 'border-line-subtle'}`} style={selected.has(d.id) ? undefined : { background: 'var(--card)' }}>
                  <div className="flex items-start gap-3">
                    {selectable && (
                      <input
                        type="checkbox"
                        checked={selected.has(d.id)}
                        onChange={() => toggleSelect(d.id)}
                        className="mt-1 rounded accent-indigo-600 cursor-pointer shrink-0"
                        aria-label={`Chọn ${displayName}`}
                      />
                    )}
                    <div className="shrink-0 mt-0.5">{fileIcon(d.mime_type)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-500 text-foreground truncate">{displayName}</p>
                      {viewMode === 'all' && d.employee_name && (
                        <p className="text-2xs text-muted-foreground">{d.employee_name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={() => setHistoryOf({ id: d.id, name: displayName })}
                        title="Lịch sử xử lý"
                        className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-sky-400">
                        <History className="h-4 w-4" />
                      </button>
                      {previewKind && (
                        <button
                          onClick={() => handlePreview(d)}
                          className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-indigo-400">
                          <Eye className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDownload(d.id)}
                        className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-foreground">
                        <Download className="h-4 w-4" />
                      </button>
                      {canEdit && (
                        <button
                          onClick={async () => {
                            if (!await confirm({ title: 'Xóa hồ sơ?', message: `Xóa hồ sơ "${displayName}"?`, confirmLabel: 'Xóa', danger: true })) return;
                            await deleteHrDocument(d.id);
                            load();
                          }}
                          className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-red-400">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                    <span className="text-2xs rounded-full bg-hover border border-line px-2 py-0.5 text-muted-foreground">
                      {d.doc_type_name || 'Khác'}
                    </span>
                    {d.size_bytes && (
                      <span className="text-2xs text-muted-foreground">{fmtBytes(d.size_bytes)}</span>
                    )}
                    <span className="text-2xs text-muted-foreground ml-auto">{fmtDate(d.created_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop: table */}
          <div className="hidden sm:block rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b border-line-subtle">
                    {selectable && (
                      <th className="w-10 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          className="rounded accent-indigo-600 cursor-pointer"
                          aria-label="Chọn tất cả"
                        />
                      </th>
                    )}
                    <th className="w-8 px-4 py-3" />
                    <th className="text-left px-4 py-3 text-2xs uppercase tracking-wider text-muted-foreground">Tên tệp</th>
                    <th className="text-left px-4 py-3 text-2xs uppercase tracking-wider text-muted-foreground">Loại</th>
                    <th className="text-left px-4 py-3 text-2xs uppercase tracking-wider text-muted-foreground">Kích thước</th>
                    <th className="text-left px-4 py-3 text-2xs uppercase tracking-wider text-muted-foreground">Ngày tải</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => {
                    const previewKind = canPreview(d.mime_type, d.file_name);
                    const displayName = d.title || d.file_name;
                    return (
                      <tr key={d.id} className={`border-b border-line-subtle last:border-0 hover:bg-hover ${selected.has(d.id) ? 'bg-indigo-500/5' : ''}`}>
                        {selectable && (
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selected.has(d.id)}
                              onChange={() => toggleSelect(d.id)}
                              className="rounded accent-indigo-600 cursor-pointer"
                              aria-label={`Chọn ${displayName}`}
                            />
                          </td>
                        )}
                        <td className="px-4 py-3">{fileIcon(d.mime_type)}</td>
                        <td className="px-4 py-3">
                          <p className="text-foreground truncate max-w-[200px]" title={displayName}>{displayName}</p>
                          {viewMode === 'all' && d.employee_name && (
                            <p className="text-2xs text-muted-foreground">{d.employee_name}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-2xs rounded-full bg-hover border border-line px-2 py-0.5 text-muted-foreground whitespace-nowrap">
                            {d.doc_type_name || 'Khác'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {fmtBytes(d.size_bytes) || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {fmtDate(d.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={() => setHistoryOf({ id: d.id, name: displayName })}
                              title="Lịch sử xử lý"
                              className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-sky-400">
                              <History className="h-4 w-4" />
                            </button>
                            {previewKind && (
                              <button
                                onClick={() => handlePreview(d)}
                                className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-indigo-400">
                                <Eye className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDownload(d.id)}
                              className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-foreground">
                              <Download className="h-4 w-4" />
                            </button>
                            {canEdit && (
                              <button
                                onClick={async () => {
                                  if (!await confirm({ title: 'Xóa hồ sơ?', message: `Xóa hồ sơ "${displayName}"?`, confirmLabel: 'Xóa', danger: true })) return;
                                  await deleteHrDocument(d.id);
                                  load();
                                }}
                                className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-red-400">
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

      {showUpload && (
        <HrUploadModal
          docTypes={docTypes}
          employeeProp={viewMode === 'employee' ? employee : null}
          onClose={() => setShowUpload(false)}
          onDone={() => { setShowUpload(false); load(); }}
        />
      )}

      {showBulkUpload && (
        <BulkUploadModal
          docTypes={docTypes}
          employeeProp={viewMode === 'employee' ? employee : null}
          onClose={() => setShowBulkUpload(false)}
          onDone={() => { setShowBulkUpload(false); load(); }}
        />
      )}

      {previewDoc && (
        <FilePreviewModal
          apiUrl={`/api/hr-documents/${previewDoc.id}`}
          mimeType={previewDoc.mime_type}
          fileName={previewDoc.file_name}
          onClose={() => setPreviewDoc(null)}
          onDownload={() => handleDownload(previewDoc.id)}
        />
      )}

      {historyOf && (
        <RecordHistoryDrawer
          entityType="hr_document"
          entityId={historyOf.id}
          title={historyOf.name}
          onClose={() => setHistoryOf(null)}
        />
      )}
    </div>
  );
}
