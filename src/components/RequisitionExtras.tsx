'use client';

/**
 * RequisitionExtras — Kho JD (dropdown tìm kiếm) + Đính kèm tài liệu.
 * Dùng chung cho cả modal tạo/sửa ở trang quản lý (Tuyển Dụng) và cổng đặt (Manager).
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Search, Paperclip, Trash2, Download, Upload, Loader2, X,
  AlertTriangle, Clock, DollarSign, MessageSquare, Send, ChevronRight,
} from 'lucide-react';
import {
  listJdsForReq, listAttachments, uploadAttachment, deleteAttachment,
  attachmentDownloadUrl, listComments, addComment, calcDaysUntilClose,
  JdItem, ReqAttachment, RequisitionComment, Requisition, ReqStatus,
} from '@/lib/api/requisitionApi';
import { useEscapeKey } from '@/hooks/useEscapeKey';

const inputCls = 'w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60';
const labelCls = 'block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5';

function fmtBytes(n: number | null): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ── JD Dropdown (searchable) ──────────────────────────────────────────────────

interface JdPickerProps { value: string; onChange: (id: string, title: string) => void }

export function JdPicker({ value, onChange }: JdPickerProps) {
  const [jds, setJds] = useState<JdItem[]>([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listJdsForReq().then(setJds).catch(() => setJds([])).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () => jds.filter(j => !q || j.title.toLowerCase().includes(q.toLowerCase()) || (j.department_name || '').toLowerCase().includes(q.toLowerCase())),
    [jds, q]
  );

  const selected = jds.find(j => j.id === value);

  return (
    <div className="relative">
      <label className={labelCls}>Kho Mô Tả Công Việc (JD)</label>
      <button type="button" onClick={() => setOpen(v => !v)}
        className={`${inputCls} flex items-center justify-between gap-2 text-left`}>
        <span className={selected ? 'text-foreground' : 'text-muted-foreground/60'}>
          {selected ? selected.title : '— Chọn từ kho JD (tùy chọn) —'}
        </span>
        {value && <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); onChange('', ''); setQ(''); }} />}
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-xl border border-line shadow-xl overflow-hidden" style={{ background: 'var(--card)' }}>
          <div className="p-2 border-b border-line-subtle">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm theo tên vị trí, phòng ban..."
                className="w-full h-8 pl-8 pr-3 rounded-lg text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" />
            </div>
          </div>
          <ul className="max-h-52 overflow-y-auto">
            {loading ? (
              <li className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></li>
            ) : filtered.length === 0 ? (
              <li className="py-4 text-center text-xs text-muted-foreground">Không tìm thấy JD phù hợp</li>
            ) : filtered.map(j => (
              <li key={j.id}>
                <button type="button" onClick={() => { onChange(j.id, j.title); setOpen(false); setQ(''); }}
                  className={`w-full text-left px-3 py-2.5 hover:bg-hover transition-colors ${j.id === value ? 'text-indigo-300' : 'text-foreground'}`}>
                  <p className="text-sm font-500">{j.title}</p>
                  {j.department_name && <p className="text-2xs text-muted-foreground">{j.department_name}</p>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── File Attachments ──────────────────────────────────────────────────────────

interface AttachmentsPanelProps {
  /** id requisition đã được tạo (edit mode). undefined = create mode (lưu tạm local). */
  requisitionId?: string;
  /** Danh sách file đã chọn ở create mode (chưa upload). */
  localFiles?: File[];
  onLocalFiles?: (files: File[]) => void;
}

export function AttachmentsPanel({ requisitionId, localFiles, onLocalFiles }: AttachmentsPanelProps) {
  const [saved, setSaved] = useState<ReqAttachment[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (requisitionId) {
      listAttachments(requisitionId).then(setSaved).catch(() => {});
    }
  }, [requisitionId]);

  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    if (requisitionId) {
      // Edit mode: upload ngay.
      setUploading(true);
      try {
        for (const f of files) {
          if (f.size > 15 * 1024 * 1024) { alert(`"${f.name}" vượt 15MB, bỏ qua.`); continue; }
          const att = await uploadAttachment(requisitionId, f);
          setSaved(prev => [att, ...prev]);
        }
      } finally { setUploading(false); }
    } else {
      // Create mode: lưu local, upload sau khi tạo xong.
      onLocalFiles?.([...(localFiles || []), ...files]);
    }
  };

  const removeSaved = async (a: ReqAttachment) => {
    if (!requisitionId) return;
    await deleteAttachment(requisitionId, a.id).catch(() => {});
    setSaved(prev => prev.filter(x => x.id !== a.id));
  };
  const removeLocal = (idx: number) => {
    onLocalFiles?.((localFiles || []).filter((_, i) => i !== idx));
  };

  return (
    <div>
      <label className={labelCls}>Đính Kèm Tài Liệu</label>
      <label className="flex items-center gap-2 h-10 px-3 rounded-xl border border-dashed border-line-strong hover:border-indigo-500/50 cursor-pointer transition-colors">
        <input type="file" multiple className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.txt"
          onChange={handlePick} disabled={uploading} />
        {uploading ? <Loader2 className="h-4 w-4 animate-spin text-indigo-400" /> : <Upload className="h-4 w-4 text-muted-foreground" />}
        <span className="text-xs text-muted-foreground">{uploading ? 'Đang tải lên...' : 'Chọn tài liệu đính kèm (tối đa 15MB/tệp)'}</span>
      </label>

      {(saved.length > 0 || (localFiles && localFiles.length > 0)) && (
        <ul className="mt-2 space-y-1.5">
          {saved.map(a => (
            <li key={a.id} className="flex items-center gap-2 rounded-lg border border-line-subtle bg-hover px-3 py-2">
              <Paperclip className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
              <span className="flex-1 text-xs text-foreground truncate">{a.file_name}</span>
              <span className="text-2xs text-muted-foreground shrink-0">{fmtBytes(a.size_bytes)}</span>
              <a href={attachmentDownloadUrl(requisitionId!, a.id)} download={a.file_name}
                className="btn-ghost rounded p-1 text-muted-foreground hover:text-indigo-300" title="Tải xuống">
                <Download className="h-3.5 w-3.5" />
              </a>
              <button onClick={() => removeSaved(a)} className="btn-ghost rounded p-1 text-muted-foreground hover:text-red-400" title="Xóa">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {(localFiles || []).map((f, i) => (
            <li key={i} className="flex items-center gap-2 rounded-lg border border-line-subtle bg-hover px-3 py-2">
              <Paperclip className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span className="flex-1 text-xs text-foreground truncate">{f.name}</span>
              <span className="text-2xs text-amber-400 shrink-0">Chưa lưu</span>
              <button onClick={() => removeLocal(i)} className="btn-ghost rounded p-1 text-muted-foreground hover:text-red-400" title="Xóa"><Trash2 className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── SLA badge (số ngày còn lại / quá hạn) ─────────────────────────────────────
const SALARY_TYPE_LABELS: Record<string, string> = { gross: 'Gross', net: 'Net', negotiable: 'Thỏa thuận' };

/** Định dạng khoảng lương gọn: "15tr – 25tr Gross". Trả null nếu trống. */
export function fmtSalary(min?: number | null, max?: number | null, type?: string | null): string | null {
  if (!min && !max) return null;
  const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}tr` : `${(n / 1_000).toFixed(0)}k`;
  const range = min && max ? `${fmt(min)} – ${fmt(max)}` : min ? `≥ ${fmt(min)}` : `≤ ${fmt(max!)}`;
  return `${range} ${SALARY_TYPE_LABELS[type || 'negotiable'] || ''}`.trim();
}

export function SalaryTag({ r }: { r: Requisition }) {
  const s = fmtSalary(r.salary_min, r.salary_max, r.salary_type);
  if (!s) return null;
  return <p className="text-2xs text-emerald-400 mb-2 flex items-center gap-1"><DollarSign className="h-3 w-3" /> {s}</p>;
}

export function SlaBadge({ targetCloseDate, status }: { targetCloseDate: string | null; status: ReqStatus }) {
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

// ── Pipeline ứng viên (mini funnel, read-only) ────────────────────────────────
export function PipelineMini({ r }: { r: Requisition }) {
  const stages = [
    { label: 'Tìm', value: r.cnt_sourcing ?? 0, color: 'bg-indigo-500' },
    { label: 'CV', value: r.cnt_screening ?? 0, color: 'bg-sky-500' },
    { label: 'PV', value: r.cnt_interview ?? 0, color: 'bg-amber-500' },
    { label: 'Offer', value: r.cnt_offer ?? 0, color: 'bg-emerald-500' },
  ];
  if (!stages.some(s => s.value > 0)) return null;
  return (
    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
      {stages.map(s => (
        <div key={s.label} className="flex items-center gap-1">
          <div className={`h-1.5 w-1.5 rounded-full ${s.color} opacity-80`} />
          <span className="text-2xs text-muted-foreground">{s.label}: <b className="text-foreground">{s.value}</b></span>
        </div>
      ))}
    </div>
  );
}

// ── Panel ghi chú & tiến độ (trao đổi giữa người yêu cầu và tuyển dụng) ────────
export function CommentPanel({ reqId }: { reqId: string }) {
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
          rows={2} placeholder="Trao đổi, hỏi tiến độ..."
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

/** Nút mở Pop-up ghi chú trên thẻ — mở/đóng không ảnh hưởng chiều cao thẻ. */
export function CommentToggle({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex w-full items-center justify-between px-4 py-2.5 border-t border-line-subtle text-2xs text-muted-foreground hover:text-foreground hover:bg-hover transition-colors rounded-b-2xl">
      <span className="flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> Ghi chú &amp; Tiến độ</span>
      <ChevronRight className="h-3.5 w-3.5" />
    </button>
  );
}

/** Pop-up "Ghi chú & Tiến độ" — mở/đóng không ảnh hưởng chiều cao thẻ (thay vì giãn thẻ ra như trước). */
export function CommentModal({ reqId, title, onClose }: { reqId: string; title: string; onClose: () => void }) {
  useEscapeKey(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full max-w-md max-h-[85vh] flex flex-col rounded-3xl border border-line" style={{ background: 'var(--card)' }} onClick={(e) => e.stopPropagation()}>
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
