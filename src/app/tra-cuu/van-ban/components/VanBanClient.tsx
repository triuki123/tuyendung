'use client';

import DateInputVN from '@/components/ui/DateInputVN';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  FileText, Search, Plus, Download, Trash2, Pencil, Eye, Link2, Check, Globe,
  ChevronRight, Paperclip, Calendar, Building2, Tag, X, ArrowLeft, Loader2,
} from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import ErrorState from '@/components/ui/ErrorState';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import FilePreviewModal from '@/app/nhan-su/components/FilePreviewModal';

interface Document {
  id: string;
  title: string;
  doc_number: string | null;
  doc_type: string;
  issued_by: string | null;
  issued_date: string | null;
  description: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  is_public: boolean;
  public_token: string | null;
  attachment_count: number;
  company_ids?: string[];
  company_names?: string[];
}

interface CompanyOption { id: string; name: string; }

interface Attachment {
  id: string;
  file_name: string;
  mime_type: string | null;
  file_size: number;
  created_at: string;
}

const DOC_TYPES: Record<string, string> = {
  document: 'Văn bản',
  decision: 'Quyết định',
  circular: 'Thông tư',
  notice: 'Thông báo',
  other: 'Khác',
};

const DOC_TYPE_COLORS: Record<string, string> = {
  document: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  decision: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  circular: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  notice: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  other: 'bg-slate-500/15 text-ink-muted border-slate-500/30',
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function VanBanClient() {
  const toast = useToast();
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [selected, setSelected] = useState<Document | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [userId, setUserId] = useState('');
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companyFilter, setCompanyFilter] = useState('');
  const [formCompanyIds, setFormCompanyIds] = useState<string[]>([]);
  const [form, setForm] = useState({
    title: '', doc_number: '', doc_type: 'document',
    issued_by: '', issued_date: '', description: '',
  });
  const [uploadFiles, setUploadFiles] = useState<FileList | null>(null);
  const [saving, setSaving] = useState(false);
  // Sửa văn bản đã ban hành (ngay trong drawer chi tiết)
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '', doc_number: '', doc_type: 'document',
    issued_by: '', issued_date: '', description: '',
  });
  const [editCompanyIds, setEditCompanyIds] = useState<string[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  // Xem trước file đính kèm + copy link công khai
  const [preview, setPreview] = useState<Attachment | null>(null);
  const [copied, setCopied] = useState(false);
  const [togglingPublic, setTogglingPublic] = useState(false);
  // window.location.origin chỉ có ở client — giữ trong state để không vỡ SSR.
  const [origin, setOrigin] = useState('');

  const isAdmin = userRole === 'super_admin' || userRole === 'admin';
  /** Sửa được: admin/super_admin hoặc chính người đã tạo văn bản (khớp gate ở API). */
  const canEdit = (doc: Document | null) => !!doc && (isAdmin || (!!userId && doc.created_by === userId));

  // UX modal Thêm văn bản (form): ESC + cảnh báo thay đổi chưa lưu
  const closeForm = useCallback(() => { setShowForm(false); setUploadFiles(null); }, []);
  const { markDirty, markClean, guardedClose } = useUnsavedGuard(closeForm);
  useEscapeKey(guardedClose, showForm);
  // Drawer chi tiết văn bản: ESC đóng (nếu đang xem trước file thì để modal đó tự xử lý)
  const closeDetail = useCallback(() => { setSelected(null); setEditing(false); setCopied(false); }, []);
  useEscapeKey(closeDetail, !!selected && !preview);

  useEffect(() => {
    setOrigin(window.location.origin);
    const stored = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (stored) {
      try {
        const u = JSON.parse(stored);
        setUserRole(u.role ?? '');
        setUserId(u.id ?? '');
      } catch { /* empty */ }
    }
  }, []);

  // Tải danh sách công ty (cho tickbox + bộ lọc)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/organizations/companies');
        if (!res.ok) return;
        const data = await res.json();
        const list: any[] = Array.isArray(data) ? data : (data.companies ?? data.data ?? []);
        setCompanies(list.map((c) => ({ id: c.id, name: c.name || c.companyName || '' })));
      } catch { /* bỏ qua */ }
    })();
  }, []);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterType) params.set('doc_type', filterType);
      if (companyFilter) params.set('company_id', companyFilter);
      const res = await fetch(`/api/documents?${params}`, {
        headers: { 'x-current-user-id': userId, 'x-current-user-role': userRole },
      });
      const json = await res.json();
      if (json.success) setDocs(json.data);
      else setLoadError(true);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [search, filterType, companyFilter, userId, userRole]);

  useEffect(() => { if (userId) fetchDocs(); }, [fetchDocs, userId]);

  async function openDetail(doc: Document) {
    setSelected(doc);
    setEditing(false);
    setCopied(false);
    const res = await fetch(`/api/documents/${doc.id}/attachments`);
    const json = await res.json();
    if (json.success) setAttachments(json.data);
  }

  /** Nạp dữ liệu văn bản đang xem vào form sửa. */
  function startEdit(doc: Document) {
    setEditForm({
      title: doc.title,
      doc_number: doc.doc_number ?? '',
      doc_type: doc.doc_type,
      issued_by: doc.issued_by ?? '',
      issued_date: (doc.issued_date ?? '').slice(0, 10),
      description: doc.description ?? '',
    });
    setEditCompanyIds(doc.company_ids ?? []);
    setEditing(true);
  }

  /** Gọi PUT lưu chỉnh sửa; trả về bản ghi mới để đồng bộ cả drawer lẫn bảng. */
  async function patchDocument(id: string, payload: Record<string, unknown>): Promise<Document | null> {
    const res = await fetch(`/api/documents/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-current-user-role': userRole,
        'x-current-user-id': userId,
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      toast.error(json.error ?? 'Lưu thất bại');
      return null;
    }
    const updated: Document = json.data;
    setSelected(updated);
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, ...updated } : d)));
    return updated;
  }

  async function handleUpdate() {
    if (!selected || !editForm.title) return;
    setSavingEdit(true);
    try {
      const ok = await patchDocument(selected.id, { ...editForm, company_ids: editCompanyIds });
      if (ok) {
        setEditing(false);
        toast.success('Đã cập nhật văn bản');
      }
    } finally {
      setSavingEdit(false);
    }
  }

  /** Bật/tắt công khai. Bật lần đầu server sinh public_token, các lần sau giữ nguyên link cũ. */
  async function handleTogglePublic(next: boolean) {
    if (!selected) return;
    setTogglingPublic(true);
    try {
      const updated = await patchDocument(selected.id, { is_public: next });
      if (updated) toast.success(next ? 'Đã công khai văn bản' : 'Đã ngừng công khai');
    } finally {
      setTogglingPublic(false);
    }
  }

  async function copyPublicLink(token: string) {
    await navigator.clipboard.writeText(`${window.location.origin}/cong-bo/${token}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSave() {
    if (!form.title || !form.doc_type) return;
    setSaving(true);
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-current-user-role': userRole,
          'x-current-user-id': userId,
        },
        body: JSON.stringify({ ...form, company_ids: formCompanyIds }),
      });
      const json = await res.json();
      if (!json.success) { toast.error(json.error); return; }

      if (uploadFiles && uploadFiles.length > 0) {
        const fd = new FormData();
        for (let i = 0; i < uploadFiles.length; i++) fd.append('files', uploadFiles[i]);
        await fetch(`/api/documents/${json.data.id}/attachments`, {
          method: 'POST',
          headers: { 'x-current-user-role': userRole, 'x-current-user-id': userId },
          body: fd,
        });
      }

      markClean();
      setShowForm(false);
      setForm({ title: '', doc_number: '', doc_type: 'document', issued_by: '', issued_date: '', description: '' });
      setFormCompanyIds([]);
      setUploadFiles(null);
      fetchDocs();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Xác nhận xóa văn bản này?')) return;
    await fetch(`/api/documents/${id}`, {
      method: 'DELETE',
      headers: { 'x-current-user-role': userRole },
    });
    fetchDocs();
    if (selected?.id === id) setSelected(null);
  }

  async function handleDeleteAttachment(attachmentId: string) {
    if (!confirm('Xóa file đính kèm này?')) return;
    await fetch(`/api/documents/${selected!.id}/attachments/${attachmentId}`, {
      method: 'DELETE',
      headers: { 'x-current-user-role': userRole },
    });
    setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
  }

  return (
    <div className="animate-fadeIn">
      {/* Back */}
      <Link href="/tra-cuu" className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" />
        Tra Cứu
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Văn Bản - Quyết Định</h1>
          <p className="mt-1 text-sm text-muted-foreground">Văn bản và quyết định công ty đã công khai</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => { setFormCompanyIds([]); setShowForm(true); }}
            className="btn-indigo inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-600"
          >
            <Plus className="h-4 w-4" />
            Thêm văn bản
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-9 w-full rounded-xl border border-line bg-surface-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo/60 focus:outline-none"
            placeholder="Tìm kiếm văn bản..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="h-9 rounded-xl border border-line bg-surface-2 px-3 text-sm text-foreground focus:border-indigo/60 focus:outline-none"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="">Tất cả loại</option>
          {Object.entries(DOC_TYPES).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        {isAdmin && companies.length > 0 && (
          <select
            className="h-9 rounded-xl border border-line bg-surface-2 px-3 text-sm text-foreground focus:border-indigo/60 focus:outline-none"
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
          >
            <option value="">Tất cả công ty</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : loadError ? (
        <ErrorState onRetry={fetchDocs} />
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <FileText className="mb-3 h-10 w-10 opacity-30" />
          <p className="text-sm">Chưa có văn bản nào</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-line-subtle overflow-x-auto" style={{ background: 'var(--card)' }}>
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-line-subtle">
                <th className="px-4 py-3 text-left text-xs font-600 uppercase tracking-wider text-muted-foreground">Tiêu đề</th>
                <th className="hidden px-4 py-3 text-left text-xs font-600 uppercase tracking-wider text-muted-foreground sm:table-cell">Số hiệu</th>
                <th className="hidden px-4 py-3 text-left text-xs font-600 uppercase tracking-wider text-muted-foreground md:table-cell">Loại</th>
                <th className="hidden px-4 py-3 text-left text-xs font-600 uppercase tracking-wider text-muted-foreground lg:table-cell">Ngày ban hành</th>
                <th className="px-4 py-3 text-right text-xs font-600 uppercase tracking-wider text-muted-foreground">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <tr key={doc.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <button onClick={() => openDetail(doc)} className="flex items-start gap-2.5 text-left group">
                      <FileText className="mt-0.5 h-4 w-4 flex-shrink-0 text-indigo-400" />
                      <div>
                        <p className="text-sm font-500 text-foreground group-hover:text-indigo-300 transition-colors">{doc.title}</p>
                        {doc.issued_by && <p className="text-xs text-muted-foreground">{doc.issued_by}</p>}
                        <div className="mt-1 flex flex-wrap gap-1">
                          {doc.is_public && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-2xs text-emerald-400">
                              <Globe className="h-2.5 w-2.5" /> Công khai
                            </span>
                          )}
                          {doc.company_names && doc.company_names.length > 0 ? (
                            doc.company_names.map((cn) => (
                              <span key={cn} className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-2xs text-amber-400">
                                <Building2 className="h-2.5 w-2.5" /> {cn}
                              </span>
                            ))
                          ) : (
                            <span className="rounded-full border border-line bg-hover px-1.5 py-0.5 text-2xs text-muted-foreground">Toàn bộ công ty</span>
                          )}
                        </div>
                      </div>
                    </button>
                  </td>
                  <td className="hidden px-4 py-3 text-sm text-muted-foreground sm:table-cell">
                    {doc.doc_number ?? '—'}
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-500 ${DOC_TYPE_COLORS[doc.doc_type] ?? DOC_TYPE_COLORS.other}`}>
                      {DOC_TYPES[doc.doc_type] ?? doc.doc_type}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-sm text-muted-foreground lg:table-cell">
                    {formatDate(doc.issued_date)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      {doc.attachment_count > 0 && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Paperclip className="h-3 w-3" /> {doc.attachment_count}
                        </span>
                      )}
                      <button onClick={() => openDetail(doc)} className="btn-ghost rounded-lg p-1.5">
                        <ChevronRight className="h-4 w-4" />
                      </button>
                      {isAdmin && (
                        <button onClick={() => handleDelete(doc.id)} className="rounded-lg p-1.5 text-muted-foreground hover:text-red-400 transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Drawer */}
      {selected && (
        <div className="fixed inset-0 z-40 flex justify-end" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) closeDetail(); }}>
          <div className="flex h-full w-full max-w-lg flex-col border-l border-line shadow-2xl" style={{ background: 'var(--card)', animation: 'slideUp 0.2s ease' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 border-b border-line-subtle px-5 py-4">
              <button onClick={closeDetail} className="btn-ghost rounded-lg p-1.5">
                <X className="h-4 w-4" />
              </button>
              <h2 className="flex-1 truncate text-sm font-600 text-foreground">{selected.title}</h2>
              {canEdit(selected) && !editing && (
                <button
                  onClick={() => startEdit(selected)}
                  title="Sửa văn bản"
                  className="btn-ghost inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-600"
                >
                  <Pencil className="h-3.5 w-3.5" /> Sửa
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {editing ? (
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Tiêu đề *</label>
                    <input
                      className="h-9 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-foreground focus:border-indigo/60 focus:outline-none"
                      value={editForm.title}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Số hiệu</label>
                      <input
                        className="h-9 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-foreground focus:border-indigo/60 focus:outline-none"
                        value={editForm.doc_number}
                        onChange={(e) => setEditForm({ ...editForm, doc_number: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Loại *</label>
                      <select
                        className="h-9 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-foreground focus:border-indigo/60 focus:outline-none"
                        value={editForm.doc_type}
                        onChange={(e) => setEditForm({ ...editForm, doc_type: e.target.value })}
                      >
                        {Object.entries(DOC_TYPES).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Đơn vị ban hành</label>
                      <input
                        className="h-9 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-foreground focus:border-indigo/60 focus:outline-none"
                        value={editForm.issued_by}
                        onChange={(e) => setEditForm({ ...editForm, issued_by: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Ngày ban hành</label>
                      <DateInputVN
                        className="h-9 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-foreground focus:border-indigo/60 focus:outline-none"
                        value={editForm.issued_date}
                        onChange={(e) => setEditForm({ ...editForm, issued_date: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Mô tả</label>
                    <textarea
                      rows={4}
                      className="w-full resize-none rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground focus:border-indigo/60 focus:outline-none"
                      value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    />
                  </div>
                  {companies.length > 0 && (
                    <div>
                      <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Áp dụng cho công ty</label>
                      <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-line bg-surface-2 p-3">
                        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground">
                          <input
                            type="checkbox"
                            checked={editCompanyIds.length === 0}
                            onChange={() => setEditCompanyIds([])}
                            className="h-4 w-4 rounded accent-indigo-500"
                          />
                          <span className="font-600">Toàn bộ công ty</span>
                        </label>
                        <div className="border-t border-line-subtle" />
                        {companies.map((c) => (
                          <label key={c.id} className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground">
                            <input
                              type="checkbox"
                              checked={editCompanyIds.includes(c.id)}
                              onChange={(e) =>
                                setEditCompanyIds((prev) =>
                                  e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id),
                                )
                              }
                              className="h-4 w-4 rounded accent-amber-500"
                            />
                            <Building2 className="h-3.5 w-3.5 text-amber-400/70" />
                            {c.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex justify-end gap-3 pt-1">
                    <button onClick={() => setEditing(false)} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
                    <button
                      onClick={handleUpdate}
                      disabled={savingEdit || !editForm.title}
                      className="btn-indigo rounded-xl px-4 py-2 text-sm font-600 disabled:opacity-40"
                    >
                      {savingEdit ? 'Đang lưu...' : 'Lưu thay đổi'}
                    </button>
                  </div>
                </div>
              ) : (
              <div className="space-y-3">
                {selected.doc_number && (
                  <div className="flex items-center gap-2.5 text-sm">
                    <Tag className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <span className="text-muted-foreground">Số hiệu:</span>
                    <span className="font-500 text-foreground">{selected.doc_number}</span>
                  </div>
                )}
                <div className="flex items-center gap-2.5 text-sm">
                  <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground">Loại:</span>
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-500 ${DOC_TYPE_COLORS[selected.doc_type] ?? DOC_TYPE_COLORS.other}`}>
                    {DOC_TYPES[selected.doc_type] ?? selected.doc_type}
                  </span>
                </div>
                {selected.issued_by && (
                  <div className="flex items-center gap-2.5 text-sm">
                    <Building2 className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <span className="text-muted-foreground">Đơn vị ban hành:</span>
                    <span className="text-foreground">{selected.issued_by}</span>
                  </div>
                )}
                {selected.issued_date && (
                  <div className="flex items-center gap-2.5 text-sm">
                    <Calendar className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <span className="text-muted-foreground">Ngày ban hành:</span>
                    <span className="text-foreground">{formatDate(selected.issued_date)}</span>
                  </div>
                )}
                {selected.description && (
                  <div className="mt-4 rounded-xl border border-line-subtle p-4" style={{ background: 'var(--secondary)' }}>
                    <p className="mb-1.5 text-xs font-600 uppercase tracking-wider text-muted-foreground">Mô tả</p>
                    <p className="whitespace-pre-wrap text-sm text-foreground">{selected.description}</p>
                  </div>
                )}
              </div>
              )}

              {/* Công khai qua link — giống cơ chế biểu mẫu /forms/<token> */}
              {canEdit(selected) && !editing && (
                <div className="mt-6 rounded-xl border border-line-subtle p-4" style={{ background: 'var(--secondary)' }}>
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={!!selected.is_public}
                      disabled={togglingPublic}
                      onChange={(e) => handleTogglePublic(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded accent-emerald-500"
                    />
                    <span>
                      <span className="flex items-center gap-1.5 text-sm font-600 text-foreground">
                        <Globe className="h-3.5 w-3.5 text-emerald-400" /> Công khai qua link
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Bật để bất kỳ ai có link đều xem được văn bản này mà không cần đăng nhập.
                      </span>
                    </span>
                  </label>

                  {selected.is_public && selected.public_token && (
                    <div className="mt-3">
                      <p className="mb-1.5 text-xs font-600 uppercase tracking-wider text-muted-foreground">Link công khai</p>
                      <div className="flex items-center gap-2">
                        <input
                          readOnly
                          value={`${origin}/cong-bo/${selected.public_token}`}
                          onFocus={(e) => e.currentTarget.select()}
                          className="h-9 flex-1 rounded-xl border border-line bg-surface-2 px-3 text-xs text-foreground focus:outline-none"
                        />
                        <button
                          onClick={() => copyPublicLink(selected.public_token!)}
                          title="Copy link công khai"
                          className="btn-ghost rounded-lg p-2"
                        >
                          {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Link2 className="h-4 w-4" />}
                        </button>
                        <a
                          href={`/cong-bo/${selected.public_token}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Mở trang công khai"
                          className="btn-ghost rounded-lg p-2"
                        >
                          <Eye className="h-4 w-4" />
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Attachments */}
              <div className="mt-6">
                <p className="mb-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">
                  File đính kèm ({attachments.length})
                </p>
                {attachments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Không có file đính kèm</p>
                ) : (
                  <ul className="space-y-2">
                    {attachments.map((a) => (
                      <li key={a.id} className="flex items-center justify-between rounded-xl border border-line-subtle px-3 py-2.5" style={{ background: 'var(--secondary)' }}>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Paperclip className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="truncate text-sm text-foreground">{a.file_name}</p>
                            <p className="text-xs text-muted-foreground">{formatFileSize(a.file_size)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setPreview(a)}
                            title="Xem trước"
                            className="btn-ghost rounded-lg p-1.5"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <a
                            href={`/api/documents/${selected.id}/attachments/${a.id}`}
                            download={a.file_name}
                            title="Tải về"
                            className="btn-ghost rounded-lg p-1.5"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                          {isAdmin && (
                            <button onClick={() => handleDeleteAttachment(a.id)} className="rounded-lg p-1.5 text-muted-foreground hover:text-red-400 transition-colors">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {isAdmin && (
                  <div className="mt-3">
                    <label className="mb-1 block text-xs text-muted-foreground">Thêm file đính kèm</label>
                    <input
                      type="file"
                      multiple
                      className="text-sm text-muted-foreground"
                      onChange={async (e) => {
                        const files = e.target.files;
                        if (!files?.length) return;
                        const fd = new FormData();
                        for (let i = 0; i < files.length; i++) fd.append('files', files[i]);
                        const res = await fetch(`/api/documents/${selected.id}/attachments`, {
                          method: 'POST',
                          headers: { 'x-current-user-role': userRole, 'x-current-user-id': userId },
                          body: fd,
                        });
                        const json = await res.json();
                        if (json.success) setAttachments((prev) => [...prev, ...json.data]);
                        e.target.value = '';
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Xem trước file đính kèm (PDF/ảnh/Word/Excel) — dùng chung với hồ sơ & CV */}
      {preview && selected && (
        <FilePreviewModal
          apiUrl={`/api/documents/${selected.id}/attachments/${preview.id}`}
          mimeType={preview.mime_type}
          fileName={preview.file_name}
          onClose={() => setPreview(null)}
        />
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) guardedClose(); }}>
          <div className="w-full max-w-lg rounded-3xl border border-line overflow-hidden" style={{ background: 'var(--card)', animation: 'modalEntrance 0.2s ease' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
              <h2 className="text-base font-700 text-foreground">Thêm văn bản mới</h2>
              <button onClick={guardedClose} className="btn-ghost rounded-lg p-1.5">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 p-6" onChange={markDirty}>
              <div>
                <label className="mb-1.5 block text-xs font-600 text-muted-foreground">TIÊU ĐỀ *</label>
                <input
                  className="h-9 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo/60 focus:outline-none"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-600 text-muted-foreground">SỐ HIỆU</label>
                  <input
                    className="h-9 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-foreground focus:border-indigo/60 focus:outline-none"
                    value={form.doc_number}
                    onChange={(e) => setForm({ ...form, doc_number: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-600 text-muted-foreground">LOẠI *</label>
                  <select
                    className="h-9 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-foreground focus:border-indigo/60 focus:outline-none"
                    value={form.doc_type}
                    onChange={(e) => setForm({ ...form, doc_type: e.target.value })}
                  >
                    {Object.entries(DOC_TYPES).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-600 text-muted-foreground">ĐƠN VỊ BAN HÀNH</label>
                  <input
                    className="h-9 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-foreground focus:border-indigo/60 focus:outline-none"
                    value={form.issued_by}
                    onChange={(e) => setForm({ ...form, issued_by: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-600 text-muted-foreground">NGÀY BAN HÀNH</label>
                  <DateInputVN
                    className="h-9 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-foreground focus:border-indigo/60 focus:outline-none"
                    value={form.issued_date}
                    onChange={(e) => setForm({ ...form, issued_date: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-600 text-muted-foreground">MÔ TẢ</label>
                <textarea
                  rows={3}
                  className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo/60 focus:outline-none resize-none"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-600 text-muted-foreground">ÁP DỤNG CHO CÔNG TY</label>
                <div className="rounded-xl border border-line bg-surface-2 p-3 space-y-2 max-h-44 overflow-y-auto">
                  <label className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formCompanyIds.length === 0}
                      onChange={() => setFormCompanyIds([])}
                      className="h-4 w-4 rounded accent-indigo-500"
                    />
                    <span className="font-600">Toàn bộ công ty (mọi nhân viên đều thấy)</span>
                  </label>
                  <div className="border-t border-line-subtle" />
                  {companies.map((c) => {
                    const checked = formCompanyIds.includes(c.id);
                    return (
                      <label key={c.id} className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setFormCompanyIds((prev) =>
                              e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id),
                            )
                          }
                          className="h-4 w-4 rounded accent-amber-500"
                        />
                        <Building2 className="h-3.5 w-3.5 text-amber-400/70" />
                        {c.name}
                      </label>
                    );
                  })}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Tích các công ty có văn bản riêng. Không tích = toàn bộ công ty đều thấy.</p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-600 text-muted-foreground">FILE ĐÍNH KÈM</label>
                <input type="file" multiple className="text-sm text-muted-foreground" onChange={(e) => setUploadFiles(e.target.files)} />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
              <button onClick={guardedClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">
                Hủy
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.title}
                className="btn-indigo rounded-xl px-4 py-2 text-sm font-600 disabled:opacity-40"
              >
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
