'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Loader2, FileText, FolderOpen, Download, Upload,
  Paperclip, ChevronDown, Eye, FileImage, FileSpreadsheet, File,
  X, Pencil, Clock, CheckCircle2,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/authStore';
import {
  Contract, HrDocument, LookupItem, AttachmentMeta,
  ReplaceRequest, UserOption,
  listContracts, listHrDocuments,
  listLookup, listContractAttachments, daysLeft, fmtBytes,
  createReplaceRequest, listMyReplaceRequests,
} from '@/app/nhan-su/components/hrApi';
import { ExpiryBadge } from '@/app/nhan-su/components/ContractsTab';
import HrUploadModal from '@/app/nhan-su/components/HrUploadModal';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

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

function previewKind(mime: string | null): 'pdf' | 'image' | null {
  if (!mime) return null;
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  return null;
}

function fmtDate(val: string): string {
  const [y, m, d] = val.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export default function MyHRClient() {
  const [currentUser, setCurrentUser] = useState<UserOption | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [docs, setDocs] = useState<HrDocument[]>([]);
  const [docTypes, setDocTypes] = useState<LookupItem[]>([]);
  const [pendingRequests, setPendingRequests] = useState<ReplaceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [replaceDoc, setReplaceDoc] = useState<HrDocument | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  useEscapeKey(() => setLightbox(null), lightbox !== null);

  async function reloadDocs() {
    try {
      const [d, pr] = await Promise.all([listHrDocuments(), listMyReplaceRequests()]);
      setDocs(d);
      setPendingRequests(pr.filter((r) => r.status === 'pending'));
    } catch { /* noop */ }
  }

  useEffect(() => {
    const u = getCurrentUser() as any;
    if (!u?.id) { setLoading(false); return; }
    const me: UserOption = { id: u.id, name: u.name || u.email || u.id, email: u.email };
    setCurrentUser(me);
    (async () => {
      try {
        const [c, d, dt, pr] = await Promise.all([
          listContracts({ employee_id: u.id }),
          listHrDocuments(),
          listLookup('hr-document-types'),
          listMyReplaceRequests(),
        ]);
        setContracts(c);
        setDocs(d);
        setDocTypes(dt);
        setPendingRequests(pr.filter((r) => r.status === 'pending'));
      } catch { /* noop */ } finally { setLoading(false); }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const pendingByDocId = new Map(pendingRequests.map((r) => [r.original_doc_id, r]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-700 text-foreground">Hợp Đồng &amp; Hồ Sơ</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Theo dõi hợp đồng lao động và quản lý hồ sơ cá nhân của bạn
        </p>
      </div>

      {/* ── Hợp đồng của tôi ── */}
      <section className="space-y-3">
        <h2 className="text-lg font-700 text-foreground flex items-center gap-2">
          <FileText className="h-5 w-5 text-indigo-400" /> Hợp đồng của tôi
        </h2>
        {contracts.length === 0 ? (
          <EmptyBox
            icon={<FileText className="h-10 w-10" />}
            text="Bạn chưa có hợp đồng nào trong hệ thống"
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {contracts.map((c) => <ContractCard key={c.id} contract={c} />)}
          </div>
        )}
      </section>

      {/* ── Hồ sơ của tôi ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-700 text-foreground flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-indigo-400" /> Hồ sơ của tôi
          </h2>
          <button
            onClick={() => setShowUpload(true)}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-600 text-white flex items-center gap-1.5">
            <Upload className="h-4 w-4" /> Tải lên
          </button>
        </div>

        {docs.length === 0 ? (
          <EmptyBox
            icon={<FolderOpen className="h-10 w-10" />}
            text="Chưa có hồ sơ. Nhấn «Tải lên» để thêm giấy tờ."
          />
        ) : (
          <div className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
            <ul>
              {docs.map((d) => {
                const kind = previewKind(d.mime_type);
                const displayName = d.title || d.file_name;
                const pendingReq = pendingByDocId.get(d.id);

                return (
                  <li key={d.id}
                    className="flex items-center gap-3 px-4 py-3 border-b border-line-subtle last:border-0 hover:bg-hover">
                    <span className="shrink-0">{fileIcon(d.mime_type)}</span>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground truncate">{displayName}</p>
                      <p className="text-2xs text-muted-foreground">
                        {d.doc_type_name || 'Khác'} · {fmtBytes(d.size_bytes)} · {fmtDate(d.created_at)}
                      </p>
                    </div>

                    <span className="flex items-center gap-2 shrink-0">
                      {kind && (
                        <button
                          onClick={() =>
                            kind === 'pdf'
                              ? window.open(`/api/hr-documents/${d.id}`, '_blank')
                              : setLightbox(`/api/hr-documents/${d.id}`)
                          }
                          title="Xem trước"
                          className="text-muted-foreground hover:text-indigo-400">
                          <Eye className="h-4 w-4" />
                        </button>
                      )}
                      <a
                        href={`/api/hr-documents/${d.id}?download=1`}
                        title="Tải xuống"
                        className="text-muted-foreground hover:text-foreground">
                        <Download className="h-4 w-4" />
                      </a>

                      {/* Thay xóa bằng nút Yêu cầu đổi */}
                      {pendingReq ? (
                        <span
                          title="Đang chờ C&B duyệt"
                          className="flex items-center gap-1 text-2xs text-amber-400 rounded-full bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 whitespace-nowrap">
                          <Clock className="h-3 w-3" /> Chờ duyệt
                        </span>
                      ) : (
                        <button
                          onClick={() => setReplaceDoc(d)}
                          title="Yêu cầu đổi hồ sơ"
                          className="text-muted-foreground hover:text-amber-400">
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Chú thích nhỏ */}
        {docs.length > 0 && (
          <p className="text-2xs text-muted-foreground px-1">
            Để thay thế hồ sơ, nhấn <Pencil className="inline h-3 w-3" /> — C&amp;B sẽ xem xét và phê duyệt trước khi file được cập nhật.
          </p>
        )}
      </section>

      {/* Upload modal */}
      {showUpload && currentUser && (
        <HrUploadModal
          docTypes={docTypes}
          employeeProp={currentUser}
          onClose={() => setShowUpload(false)}
          onDone={() => { setShowUpload(false); reloadDocs(); }}
        />
      )}

      {/* Replace modal */}
      {replaceDoc && (
        <ReplaceModal
          doc={replaceDoc}
          onClose={() => setReplaceDoc(null)}
          onDone={() => { setReplaceDoc(null); reloadDocs(); }}
        />
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.9)' }}
          onClick={() => setLightbox(null)}>
          <button
            className="absolute top-4 right-4 rounded-full bg-hover-strong p-2 text-white hover:bg-white/20"
            onClick={(e) => { e.stopPropagation(); setLightbox(null); }}>
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="Preview"
            className="max-w-full max-h-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

// ── ReplaceModal ──────────────────────────────────────────────────────────────

interface ReplaceModalProps {
  doc: HrDocument;
  onClose: () => void;
  onDone: () => void;
}

function ReplaceModal({ doc, onClose, onDone }: ReplaceModalProps) {
  const [newFile, setNewFile] = useState<File | null>(null);
  const [newPreviewUrl, setNewPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose);
  useEscapeKey(lightbox !== null ? () => setLightbox(null) : guardedClose);

  const oldName = doc.title || doc.file_name;
  const oldKind = previewKind(doc.mime_type);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setNewFile(f);
    if (f) markDirty();
    // Revoke previous object URL
    if (newPreviewUrl) URL.revokeObjectURL(newPreviewUrl);
    setNewPreviewUrl(f && f.type.startsWith('image/') ? URL.createObjectURL(f) : null);
    if (e.target) e.target.value = '';
  }

  async function handleSubmit() {
    if (!newFile) return setError('Vui lòng chọn tệp mới');
    if (newFile.size > 10 * 1024 * 1024) return setError('Tệp vượt quá 10MB');
    setBusy(true);
    setError('');
    try {
      await createReplaceRequest(doc.id, newFile, null);
      markClean();
      onDone();
    } catch (e: any) {
      setError(e.message || 'Lỗi khi gửi yêu cầu');
    } finally { setBusy(false); }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
        onClick={guardedClose}>
        <div className="w-full max-w-xl rounded-3xl border border-line overflow-hidden"
          style={{ background: 'var(--card)' }}
          onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
            <div>
              <h2 className="text-base font-700 text-foreground">Yêu cầu đổi hồ sơ</h2>
              <p className="text-xs text-muted-foreground mt-0.5">C&amp;B sẽ xem xét trước khi cập nhật</p>
            </div>
            <button onClick={guardedClose}
              className="rounded-lg p-1.5 hover:bg-hover text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-5">

            {/* So sánh file cũ ↔ file mới */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-3">

              {/* Hồ sơ hiện tại */}
              <div className="rounded-xl border border-line p-3.5 space-y-2 overflow-hidden" style={{ background: 'var(--input)' }}>
                <p className="text-2xs font-600 uppercase tracking-wider text-muted-foreground">Hồ sơ hiện tại</p>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0">{fileIcon(doc.mime_type)}</span>
                  <span className="text-sm text-foreground truncate min-w-0 flex-1" title={oldName}>{oldName}</span>
                </div>
                <div className="flex items-center text-2xs text-muted-foreground gap-2">
                  <span>{fmtBytes(doc.size_bytes)}</span>
                  <span className="ml-auto flex gap-1.5">
                    {oldKind && (
                      <button
                        onClick={() =>
                          oldKind === 'pdf'
                            ? window.open(`/api/hr-documents/${doc.id}`, '_blank')
                            : setLightbox(`/api/hr-documents/${doc.id}`)
                        }
                        className="hover:text-indigo-400" title="Xem trước">
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <a href={`/api/hr-documents/${doc.id}?download=1`}
                      className="hover:text-foreground" title="Tải xuống">
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </span>
                </div>
              </div>

              {/* Arrow */}
              <div className="text-amber-400 text-lg font-700 text-center hidden sm:block">→</div>
              <div className="text-amber-400 text-lg font-700 text-center sm:hidden">↓</div>

              {/* Hồ sơ mới */}
              <div
                onClick={() => !newFile && fileRef.current?.click()}
                className={`rounded-xl border p-3.5 space-y-2 overflow-hidden transition-colors ${
                  newFile
                    ? 'border-amber-500/40'
                    : 'border-dashed border-line-strong hover:border-indigo-500/50 cursor-pointer'
                }`}
                style={{ background: 'var(--input)' }}>
                <p className="text-2xs font-600 uppercase tracking-wider text-amber-400">Hồ sơ mới</p>

                {newFile ? (
                  <>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0">{fileIcon(newFile.type)}</span>
                      <span className="text-sm text-foreground truncate min-w-0 flex-1" title={newFile.name}>{newFile.name}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setNewFile(null); setNewPreviewUrl(null); }}
                        className="text-muted-foreground hover:text-red-400 shrink-0">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center text-2xs text-muted-foreground gap-2">
                      <span>{fmtBytes(newFile.size)}</span>
                      {newPreviewUrl && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setLightbox(newPreviewUrl); }}
                          className="ml-auto hover:text-indigo-400" title="Xem trước">
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
                      className="text-2xs text-indigo-400 hover:text-indigo-300">
                      Đổi tệp khác
                    </button>
                  </>
                ) : (
                  <div className="text-center py-3">
                    <Upload className="h-6 w-6 mx-auto mb-1.5 text-muted-foreground opacity-50" />
                    <p className="text-sm text-muted-foreground">Nhấn để chọn tệp</p>
                    <p className="text-2xs text-muted-foreground opacity-60 mt-0.5">PDF, ảnh, Word… tối đa 10MB</p>
                  </div>
                )}
              </div>
            </div>

            <input ref={fileRef} type="file" hidden onChange={onFileChange} />

            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
            <button onClick={guardedClose}
              className="rounded-xl border border-line px-4 py-2 text-sm text-muted-foreground hover:bg-hover">
              Hủy
            </button>
            <button
              onClick={handleSubmit}
              disabled={busy || !newFile}
              className="rounded-xl bg-amber-600 hover:bg-amber-500 px-4 py-2 text-sm font-600 text-white flex items-center gap-2 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Gửi yêu cầu đổi
            </button>
          </div>
        </div>
      </div>

      {/* Lightbox bên trong modal */}
      {lightbox && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.92)' }}
          onClick={() => setLightbox(null)}>
          <button
            className="absolute top-4 right-4 rounded-full bg-hover-strong p-2 text-white hover:bg-white/20"
            onClick={(e) => { e.stopPropagation(); setLightbox(null); }}>
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Preview"
            className="max-w-full max-h-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}

// ── ContractCard ──────────────────────────────────────────────────────────────

function ContractCard({ contract }: { contract: Contract }) {
  const [open, setOpen] = useState(false);
  const [atts, setAtts] = useState<AttachmentMeta[] | null>(null);
  const d = daysLeft(contract.end_date);

  async function toggle() {
    setOpen((o) => !o);
    if (atts === null) {
      try { setAtts(await listContractAttachments(contract.id)); } catch { setAtts([]); }
    }
  }

  return (
    <div className="rounded-2xl border border-line-subtle p-4" style={{ background: 'var(--card)' }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-700 text-foreground">{contract.contract_number}</p>
          <p className="text-2xs text-muted-foreground">{contract.contract_type_name || 'Hợp đồng'}</p>
        </div>
        <ExpiryBadge endDate={contract.end_date} status={contract.status} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-2xs">
        <Info label="Bắt đầu" value={contract.start_date || '—'} />
        <Info label="Hết hạn" value={contract.end_date || 'Vô thời hạn'} />
      </div>
      {d !== null && d >= 0 && d <= 30 && contract.status === 'active' && (
        <p className="mt-2 text-2xs text-amber-400">
          Hợp đồng sắp hết hạn — bộ phận C&amp;B sẽ liên hệ gia hạn.
        </p>
      )}
      <button onClick={toggle}
        className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
        <Paperclip className="h-3.5 w-3.5" /> Tệp đính kèm
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-2">
          {atts === null ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : atts.length === 0 ? (
            <p className="text-2xs text-muted-foreground">Không có tệp đính kèm.</p>
          ) : (
            <ul className="space-y-1">
              {atts.map((a) => (
                <li key={a.id} className="flex items-center justify-between text-xs">
                  <span className="truncate text-foreground">{a.file_name}</span>
                  <a href={`/api/contracts/attachments/${a.id}?download=1`}
                    className="text-muted-foreground hover:text-foreground">
                    <Download className="h-3.5 w-3.5" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="text-foreground">{value}</p>
    </div>
  );
}

function EmptyBox({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center py-14 text-muted-foreground rounded-2xl border border-line-subtle"
      style={{ background: 'var(--card)' }}>
      <div className="opacity-30 mb-3">{icon}</div>
      <p className="text-sm">{text}</p>
    </div>
  );
}

