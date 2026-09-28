'use client';

import { useEffect, useState } from 'react';
import {
  Loader2, ChevronDown, Eye, Download, CheckCircle2, XCircle,
  FileText, FileImage, File, Clock,
} from 'lucide-react';
import {
  ReplaceRequest,
  listPendingReplaceRequests,
  approveReplaceRequest,
  rejectReplaceRequest,
  fmtBytes,
} from './hrApi';

function fileIcon(mime: string | null) {
  if (!mime) return <File className="h-4 w-4 text-muted-foreground" />;
  if (mime.startsWith('image/')) return <FileImage className="h-4 w-4 text-sky-400" />;
  if (mime === 'application/pdf') return <FileText className="h-4 w-4 text-red-400" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

function previewKind(mime: string | null): 'pdf' | 'image' | null {
  if (!mime) return null;
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  return null;
}

function fmtDate(val: string) {
  const [y, m, d] = val.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

interface Props {
  onDocChanged: () => void;
}

export default function ReplaceRequestsPanel({ onDocChanged }: Props) {
  const [requests, setRequests] = useState<ReplaceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try { setRequests(await listPendingReplaceRequests()); } catch { setRequests([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  if (!loading && requests.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-500/30 overflow-hidden" style={{ background: 'var(--card)' }}>
      {/* Header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-hover transition-colors">
        <div className="flex items-center gap-2.5">
          <Clock className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-600 text-amber-400">
            Yêu cầu đổi hồ sơ đang chờ duyệt
          </span>
          {!loading && (
            <span className="rounded-full bg-amber-500 text-white text-2xs font-700 px-2 py-0.5 leading-none">
              {requests.length}
            </span>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-amber-500/20">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ul className="divide-y divide-line-subtle">
              {requests.map((req) => (
                <RequestRow
                  key={req.id}
                  req={req}
                  onLightbox={setLightbox}
                  onDone={() => { load(); onDocChanged(); }}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.92)' }}
          onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 rounded-full bg-hover-strong p-2 text-white hover:bg-white/20"
            onClick={(e) => { e.stopPropagation(); setLightbox(null); }}>
            <XCircle className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Preview"
            className="max-w-full max-h-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

function RequestRow({
  req,
  onLightbox,
  onDone,
}: {
  req: ReplaceRequest;
  onLightbox: (url: string) => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const oldName = req.original_title || req.original_file_name || '—';
  const newName = req.new_title || req.new_file_name;

  async function handleApprove() {
    setBusy(true);
    setError('');
    try {
      await approveReplaceRequest(req.id);
      onDone();
    } catch (e: any) {
      setError(e.message || 'Lỗi khi duyệt');
    } finally { setBusy(false); }
  }

  async function handleReject() {
    setBusy(true);
    setError('');
    try {
      await rejectReplaceRequest(req.id, note || undefined);
      onDone();
    } catch (e: any) {
      setError(e.message || 'Lỗi khi từ chối');
    } finally { setBusy(false); }
  }

  function openFile(url: string, mime: string | null) {
    const kind = previewKind(mime);
    if (kind === 'pdf') window.open(url, '_blank');
    else if (kind === 'image') onLightbox(url);
    else window.open(url + '?download=1', '_blank');
  }

  return (
    <li className="px-5 py-4 space-y-3">
      {/* Meta */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-600 text-foreground">{req.employee_name || req.requested_by}</span>
        {req.doc_type_name && (
          <span className="rounded-full bg-hover border border-line px-2 py-0.5">{req.doc_type_name}</span>
        )}
        <span>Gửi lúc {fmtDate(req.created_at)}</span>
      </div>

      {/* File comparison */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-3">
        {/* Old file */}
        <div className="rounded-xl border border-line p-3 space-y-2" style={{ background: 'var(--input)' }}>
          <p className="text-2xs font-600 uppercase tracking-wider text-muted-foreground">Hồ sơ hiện tại</p>
          <div className="flex items-center gap-2">
            {fileIcon(req.original_mime_type ?? null)}
            <span className="text-sm text-foreground truncate flex-1" title={oldName}>{oldName}</span>
          </div>
          <div className="flex items-center gap-2 text-2xs text-muted-foreground">
            <span>{fmtBytes(req.original_size_bytes)}</span>
            <span className="flex gap-1.5 ml-auto">
              {previewKind(req.original_mime_type ?? null) && (
                <button
                  onClick={() => openFile(`/api/hr-documents/${req.original_doc_id}`, req.original_mime_type ?? null)}
                  className="hover:text-indigo-400" title="Xem">
                  <Eye className="h-3.5 w-3.5" />
                </button>
              )}
              <a href={`/api/hr-documents/${req.original_doc_id}?download=1`}
                className="hover:text-foreground" title="Tải xuống">
                <Download className="h-3.5 w-3.5" />
              </a>
            </span>
          </div>
        </div>

        {/* Arrow */}
        <div className="text-amber-400 text-center text-lg font-700 hidden sm:block">→</div>
        <div className="text-amber-400 text-center text-lg font-700 sm:hidden">↓</div>

        {/* New file */}
        <div className="rounded-xl border border-amber-500/40 p-3 space-y-2" style={{ background: 'var(--input)' }}>
          <p className="text-2xs font-600 uppercase tracking-wider text-amber-400">Hồ sơ mới đề nghị</p>
          <div className="flex items-center gap-2">
            {fileIcon(req.new_mime_type ?? null)}
            <span className="text-sm text-foreground truncate flex-1" title={newName}>{newName}</span>
          </div>
          <div className="flex items-center gap-2 text-2xs text-muted-foreground">
            <span>{fmtBytes(req.new_size_bytes)}</span>
            <span className="flex gap-1.5 ml-auto">
              {previewKind(req.new_mime_type ?? null) && (
                <button
                  onClick={() => openFile(`/api/hr-documents/replace-requests/${req.id}/file`, req.new_mime_type ?? null)}
                  className="hover:text-indigo-400" title="Xem">
                  <Eye className="h-3.5 w-3.5" />
                </button>
              )}
              <a href={`/api/hr-documents/replace-requests/${req.id}/file?download=1`}
                className="hover:text-foreground" title="Tải xuống">
                <Download className="h-3.5 w-3.5" />
              </a>
            </span>
          </div>
        </div>
      </div>

      {/* Reject note input */}
      {rejectMode && (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Lý do từ chối (tuỳ chọn)…"
          rows={2}
          className="w-full rounded-xl border border-line px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500 resize-none"
          style={{ background: 'var(--input)' }}
        />
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {!rejectMode ? (
          <>
            <button
              onClick={handleApprove}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-600 text-white disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Chấp nhận
            </button>
            <button
              onClick={() => setRejectMode(true)}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-xl border border-red-500/40 text-red-400 hover:bg-red-500/10 px-4 py-2 text-sm font-600 disabled:opacity-50">
              <XCircle className="h-4 w-4" /> Từ chối
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleReject}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-xl bg-red-600 hover:bg-red-500 px-4 py-2 text-sm font-600 text-white disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Xác nhận từ chối
            </button>
            <button
              onClick={() => { setRejectMode(false); setNote(''); }}
              disabled={busy}
              className="rounded-xl border border-line px-4 py-2 text-sm text-muted-foreground hover:bg-hover">
              Quay lại
            </button>
          </>
        )}
      </div>
    </li>
  );
}
