'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, FileText, Plus, Search, History, Trash2, Paperclip, Pencil, Lock } from 'lucide-react';
import RecordHistoryDrawer from '@/components/ui/RecordHistoryDrawer';
import LockManageModal, { canManageBmhsClient } from './LockManageModal';
import {
  inputCls, fmtDate, ExpiryBadge, Field, Modal, ModalFooter, CompanyFilter, EmptyState,
  type Company, type LegalPerms,
} from './shared';

interface DocType { id: string; name: string; group_key: string; default_validity_months: number | null }

interface Doc {
  id: string; company_id: string; company_name: string | null;
  type_id: string | null; type_name: string | null;
  title: string; doc_number: string | null; issued_by: string | null;
  issued_date: string | null; expiry_date: string | null;
  status: string; holder: string | null; note: string | null;
  days_left: number | null; file_count: number;
  locked: boolean;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  active:   { label: 'Hiệu lực',    cls: 'bg-emerald-500/15 text-emerald-400' },
  expired:  { label: 'Hết hạn',     cls: 'bg-red-500/15 text-red-400' },
  replaced: { label: 'Đã thay thế', cls: 'bg-slate-500/15 text-muted-foreground' },
  revoked:  { label: 'Bị thu hồi',  cls: 'bg-orange-500/15 text-orange-400' },
};

/** Tab Giấy phép & Văn bản — sổ văn bản pháp lý mọi công ty, kèm scan + nhắc hạn. */
export default function DocumentsTab({ companies, perms }: { companies: Company[]; perms: LegalPerms }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [types, setTypes] = useState<DocType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [editDoc, setEditDoc] = useState<Doc | 'new' | null>(null);
  const [filesFor, setFilesFor] = useState<Doc | null>(null);
  const [historyFor, setHistoryFor] = useState<Doc | null>(null);
  const [deleteFor, setDeleteFor] = useState<Doc | null>(null);
  const [lockFor, setLockFor] = useState<Doc | null>(null);
  const canLock = canManageBmhsClient();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, t] = await Promise.all([
        fetch('/api/legal/documents').then((r) => r.json()),
        fetch('/api/legal/document-types').then((r) => r.json()),
      ]);
      setDocs(d.data || []);
      setTypes(t.data || []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter((d) => {
      if (companyFilter && d.company_id !== companyFilter) return false;
      if (q && !`${d.title} ${d.doc_number ?? ''} ${d.company_name ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [docs, search, companyFilter]);

  const expiringCount = docs.filter((d) => d.status === 'active' && d.days_left != null && d.days_left <= 60).length;

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {docs.length} văn bản
          {expiringCount > 0 && <span className="text-red-400"> · {expiringCount} sắp hết hạn / quá hạn</span>}
        </p>
        {perms.create && (
          <button onClick={() => setEditDoc('new')}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-600 text-white flex items-center gap-2 justify-center">
            <Plus className="h-4 w-4" /> Thêm văn bản
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tiêu đề, số văn bản, công ty..."
            className={`${inputCls} pl-9`} />
        </div>
        <CompanyFilter companies={companies} value={companyFilter} onChange={setCompanyFilter} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<FileText />}
          text={docs.length === 0 ? 'Chưa có văn bản nào' : 'Không tìm thấy văn bản phù hợp'}
          hint={docs.length === 0 ? 'Bấm "Thêm văn bản" để khai báo GPKD, giấy phép con...' : 'Thử đổi từ khóa hoặc bộ lọc'} />
      ) : (
        <div className="rounded-2xl border border-white/5 overflow-hidden divide-y divide-white/5" style={{ background: 'var(--card)' }}>
          {filtered.map((d) => {
            const st = STATUS_META[d.status] ?? STATUS_META.active;
            return (
              <div key={d.id} className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-600 text-foreground">{d.title}</p>
                      <span className={`px-1.5 py-0.5 rounded text-2xs font-600 ${st.cls}`}>{st.label}</span>
                      {d.locked && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-600 bg-amber-500/15 text-amber-400">
                          <Lock className="h-3 w-3" /> BMHS
                        </span>
                      )}
                      {d.status === 'active' && <ExpiryBadge daysLeft={d.days_left} />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      <b className="text-foreground/90">{d.company_name ?? '—'}</b>
                      {d.type_name && <> · {d.type_name}</>}
                      {d.doc_number && <> · Số {d.doc_number}</>}
                    </p>
                    <p className="text-2xs text-muted-foreground/70 mt-0.5">
                      Cấp {fmtDate(d.issued_date)}{d.issued_by ? ` bởi ${d.issued_by}` : ''} ·
                      Hết hạn: {d.expiry_date ? fmtDate(d.expiry_date) : 'Vô thời hạn'}
                      {d.holder && <> · Bản gốc: {d.holder}</>}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button onClick={() => setFilesFor(d)}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-2xs font-600 text-muted-foreground hover:text-foreground hover:bg-white/5">
                    <Paperclip className="h-3.5 w-3.5 text-amber-400" /> Tệp ({d.file_count})
                  </button>
                  {perms.edit && (
                    <button onClick={() => setEditDoc(d)}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-2xs font-600 text-muted-foreground hover:text-foreground hover:bg-white/5">
                      <Pencil className="h-3.5 w-3.5 text-indigo-400" /> Sửa
                    </button>
                  )}
                  <button onClick={() => setHistoryFor(d)}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-2xs font-600 text-muted-foreground hover:text-foreground hover:bg-white/5">
                    <History className="h-3.5 w-3.5" /> Lịch sử
                  </button>
                  {canLock && (
                    <button onClick={() => setLockFor(d)}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-2xs font-600 text-amber-400/80 hover:text-amber-400 hover:bg-amber-500/10">
                      <Lock className="h-3.5 w-3.5" /> {d.locked ? 'Khóa' : 'Đặt khóa'}
                    </button>
                  )}
                  {perms.remove && (
                    <button onClick={() => setDeleteFor(d)}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-2xs font-600 text-red-400/70 hover:text-red-400 hover:bg-red-500/10 ml-auto">
                      <Trash2 className="h-3.5 w-3.5" /> Xóa
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editDoc && (
        <DocFormModal doc={editDoc === 'new' ? null : editDoc} companies={companies} types={types}
          onClose={() => setEditDoc(null)} onDone={() => { setEditDoc(null); load(); }} />
      )}
      {filesFor && (
        <DocFilesModal doc={filesFor} canEdit={perms.edit} canDelete={perms.remove}
          onClose={() => { setFilesFor(null); load(); }} />
      )}
      {historyFor && (
        <RecordHistoryDrawer entityType="document" entityId={historyFor.id}
          title={historyFor.title} apiBase="/api/legal/audit" onClose={() => setHistoryFor(null)} />
      )}
      {lockFor && (
        <LockManageModal entityType="document" entityId={lockFor.id} title={lockFor.title}
          locked={lockFor.locked} onClose={() => setLockFor(null)}
          onDone={() => { setLockFor(null); load(); }} />
      )}
      {deleteFor && (
        <Modal title="Xóa văn bản" onClose={() => setDeleteFor(null)}>
          <p className="text-sm text-foreground">
            Xóa <b>{deleteFor.title}</b> và toàn bộ tệp đính kèm? Không khôi phục được.
          </p>
          <DeleteFooter url={`/api/legal/documents?id=${deleteFor.id}`}
            onClose={() => setDeleteFor(null)} onDone={() => { setDeleteFor(null); load(); }} />
        </Modal>
      )}
    </div>
  );
}

/** Footer xóa dùng chung trong tab (gọi DELETE rồi báo lỗi nếu có). */
export function DeleteFooter({ url, onClose, onDone }: { url: string; onClose: () => void; onDone: () => void }) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    setSaving(true); setErr('');
    try {
      const res = await fetch(url, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) { setErr(json.error || 'Lỗi xóa'); return; }
      onDone();
    } finally { setSaving(false); }
  };
  return (
    <>
      {err && <p className="text-xs text-red-400 mt-2">{err}</p>}
      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} label="Xóa" danger />
    </>
  );
}

// ===== Modal thêm/sửa văn bản =====

function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const total = (m - 1) + months;
  const year = y + Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

function DocFormModal({ doc, companies, types, onClose, onDone }: {
  doc: Doc | null; companies: Company[]; types: DocType[]; onClose: () => void; onDone: () => void;
}) {
  const [form, setForm] = useState({
    companyId: doc?.company_id ?? '',
    typeId: doc?.type_id ?? '',
    title: doc?.title ?? '',
    docNumber: doc?.doc_number ?? '',
    issuedBy: doc?.issued_by ?? '',
    issuedDate: doc?.issued_date?.slice(0, 10) ?? '',
    expiryDate: doc?.expiry_date?.slice(0, 10) ?? '',
    status: doc?.status ?? 'active',
    holder: doc?.holder ?? '',
    note: doc?.note ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  /** Chọn loại → tự điền tiêu đề (nếu trống) + gợi ý hết hạn theo default_validity_months. */
  const onType = (typeId: string) => {
    const t = types.find((x) => x.id === typeId);
    setForm((f) => ({
      ...f, typeId,
      title: f.title || t?.name || '',
      expiryDate: !f.expiryDate && f.issuedDate && t?.default_validity_months
        ? addMonths(f.issuedDate, t.default_validity_months) : f.expiryDate,
    }));
  };

  const onIssuedDate = (issuedDate: string) => {
    const t = types.find((x) => x.id === form.typeId);
    setForm((f) => ({
      ...f, issuedDate,
      expiryDate: !f.expiryDate && issuedDate && t?.default_validity_months
        ? addMonths(issuedDate, t.default_validity_months) : f.expiryDate,
    }));
  };

  const submit = async () => {
    if (!form.companyId) { setErr('Chọn công ty'); return; }
    if (!form.title.trim()) { setErr('Nhập tiêu đề'); return; }
    setSaving(true); setErr('');
    try {
      const isNew = !doc;
      const res = await fetch('/api/legal/documents', {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isNew ? form : {
          id: doc!.id, company_id: form.companyId, type_id: form.typeId || null,
          title: form.title, doc_number: form.docNumber, issued_by: form.issuedBy,
          issued_date: form.issuedDate, expiry_date: form.expiryDate,
          status: form.status, holder: form.holder, note: form.note,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error || 'Lỗi lưu'); return; }
      onDone();
    } finally { setSaving(false); }
  };

  return (
    <Modal title={doc ? 'Sửa văn bản' : 'Thêm văn bản'} onClose={onClose} wide>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Công ty *">
          <select value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} className={inputCls}>
            <option value="">— Chọn công ty —</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Loại văn bản">
          <select value={form.typeId} onChange={(e) => onType(e.target.value)} className={inputCls}>
            <option value="">— Chọn loại —</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Tiêu đề *">
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="VD: Giấy chứng nhận PCCC kho Bình Dương" className={inputCls} />
          </Field>
        </div>
        <Field label="Số văn bản">
          <input value={form.docNumber} onChange={(e) => setForm({ ...form, docNumber: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Cơ quan cấp">
          <input value={form.issuedBy} onChange={(e) => setForm({ ...form, issuedBy: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Ngày cấp">
          <input type="date" value={form.issuedDate} onChange={(e) => onIssuedDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Ngày hết hạn" hint="Để trống = vô thời hạn. Chọn loại + ngày cấp sẽ tự gợi ý.">
          <input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} className={inputCls} />
        </Field>
        {doc && (
          <Field label="Trạng thái">
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputCls}>
              <option value="active">Hiệu lực</option>
              <option value="expired">Hết hạn</option>
              <option value="replaced">Đã thay thế</option>
              <option value="revoked">Bị thu hồi</option>
            </select>
          </Field>
        )}
        <Field label="Nơi giữ bản gốc">
          <input value={form.holder} onChange={(e) => setForm({ ...form, holder: e.target.value })}
            placeholder="VD: Két văn phòng HCM" className={inputCls} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Ghi chú">
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputCls} />
          </Field>
        </div>
      </div>
      {err && <p className="text-xs text-red-400 mt-3">{err}</p>}
      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} label={doc ? 'Lưu' : 'Thêm'} />
    </Modal>
  );
}

// ===== Modal file đính kèm =====

interface FileMeta { id: string; file_name: string; mime_type: string; size_bytes: number; uploaded_by_name: string | null; created_at: string }

export function FilesModal({ title, listUrl, uploadUrl, fileUrlOf, deleteUrlOf, canEdit, canDelete, onClose }: {
  title: string;
  listUrl: string;
  uploadUrl: string;
  fileUrlOf: (id: string) => string;
  deleteUrlOf: (id: string) => string;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await fetch(listUrl).then((r) => r.json());
      setFiles(j.data || []);
    } finally { setLoading(false); }
  }, [listUrl]);
  useEffect(() => { load(); }, [load]);

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true); setErr('');
    try {
      const fd = new FormData();
      for (const f of Array.from(list)) fd.append('files', f);
      const res = await fetch(uploadUrl, { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) { setErr(json.error || 'Lỗi tải lên'); return; }
      load();
    } finally { setUploading(false); }
  };

  const remove = async (id: string) => {
    const res = await fetch(deleteUrlOf(id), { method: 'DELETE' });
    if (res.ok) load();
  };

  const fmtSize = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3">
        {canEdit && (
          <label className={`flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 px-4 py-4 text-sm text-muted-foreground cursor-pointer hover:border-indigo-500/50 hover:text-foreground ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Tải lên scan (PDF/ảnh/Word/Excel, tối đa 10MB)
            <input type="file" multiple className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx"
              onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
          </label>
        )}
        {err && <p className="text-xs text-red-400">{err}</p>}

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : files.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">Chưa có tệp nào</p>
        ) : (
          <div className="rounded-xl border border-white/5 divide-y divide-white/5" style={{ background: 'var(--background)' }}>
            {files.map((f) => (
              <div key={f.id} className="flex items-center gap-2 px-3 py-2.5">
                <Paperclip className="h-4 w-4 text-amber-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <a href={fileUrlOf(f.id)} target="_blank" rel="noreferrer"
                    className="text-xs font-600 text-foreground hover:text-indigo-400 truncate block">
                    {f.file_name}
                  </a>
                  <p className="text-2xs text-muted-foreground/60">
                    {fmtSize(f.size_bytes)} · {new Date(f.created_at).toLocaleDateString('vi-VN')}
                    {f.uploaded_by_name && ` · ${f.uploaded_by_name}`}
                  </p>
                </div>
                {canDelete && (
                  <button onClick={() => remove(f.id)} className="p-1.5 text-red-400/60 hover:text-red-400 shrink-0">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex justify-end border-t border-white/5 px-6 py-4 -mx-6 -mb-6 mt-6">
        <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Đóng</button>
      </div>
    </Modal>
  );
}

function DocFilesModal({ doc, canEdit, canDelete, onClose }: {
  doc: Doc; canEdit: boolean; canDelete: boolean; onClose: () => void;
}) {
  return (
    <FilesModal
      title={`Tệp đính kèm — ${doc.title}`}
      listUrl={`/api/legal/documents/${doc.id}/files`}
      uploadUrl={`/api/legal/documents/${doc.id}/files`}
      fileUrlOf={(id) => `/api/legal/files/${id}?scope=document`}
      deleteUrlOf={(id) => `/api/legal/files/${id}?scope=document`}
      canEdit={canEdit} canDelete={canDelete} onClose={onClose}
    />
  );
}
