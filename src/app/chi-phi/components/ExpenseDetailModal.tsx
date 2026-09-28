'use client';

/**
 * Chi tiết phiếu chi: thông tin + timeline duyệt (2 tầng) + thread trao đổi + hành động
 * theo trạng thái/vai trò (gửi duyệt · thu hồi · duyệt/từ chối · hủy · nhận hàng).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  X, Loader2, Send, Undo2, CheckCircle2, XCircle, Ban, PackageCheck, Pencil,
  AlertTriangle, MessageSquare, Link2, Paperclip, FileText, Download, Trash2, ImageIcon, Package, Receipt, ChevronDown, ChevronUp,
} from 'lucide-react';
import Link from 'next/link';
import { formatVND, formatMoney } from '@/lib/format';
import { useToast } from '@/context/ToastContext';
import { STATUS_CFG } from './ChiPhiClient';

interface Approval {
  id: string; step_order: number; approver_user_id: string; approver_name?: string | null;
  limit_amount: number | null; status: string; approved_at: string | null; note: string | null;
}
interface Message { id: string; author_name: string; body: string; source: string; created_at: string; attachments?: Array<{ id: string; file_name: string; mime_type: string }> }
interface Attachment { id: string; file_name: string; mime_type: string; size_bytes: number; uploader_name?: string | null; created_at: string }
interface SpawnedAsset { id: string; code: string; name: string; status: string }
type AttachmentFilter = 'all' | 'images' | 'files';

const isImage = (mime: string) => mime.startsWith('image/');
const ASSET_STATUS_LABEL: Record<string, string> = {
  cho_mua: 'Chờ mua', dang_mua: 'Đang mua', available: 'Sẵn sàng', assigned: 'Đang dùng',
  maintenance: 'Bảo trì', broken: 'Hỏng', retired: 'Thanh lý', active: 'Đang dùng',
};

interface Props {
  expenseId: string;
  currentUserId: string;
  canDeleteExpense?: boolean;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (id: string) => void;
  /** Mở phiếu khác trong cùng modal (đi dọc dòng chảy tạm ứng ⇄ quyết toán). */
  onOpenExpense?: (id: string) => void;
  /** Bấm "Quyết toán" trên phiếu tạm ứng → mở form tạo phiếu quyết toán prefill. */
  onSettle?: (advance: { id: string; code: string | null; title: string; amount: number; company_id: string; currency?: string }) => void;
}

interface SettlementInfo {
  advance?: { id: string; code: string | null; title: string; amount: number; status: string; currency?: string } | null;
  settlements?: Array<{ id: string; code: string | null; title: string; amount: number; status: string; currency?: string }>;
}

const SETTLE_BADGE: Record<string, { l: string; cls: string }> = {
  none:    { l: 'Chưa quyết toán', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  pending: { l: 'Đang quyết toán', cls: 'text-sky-400 bg-sky-500/10 border-sky-500/30' },
  settled: { l: 'Đã quyết toán',   cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
};

const fmtDT = (s?: string | null) => s ? new Date(s).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

export default function ExpenseDetailModal({ expenseId, currentUserId, canDeleteExpense = false, onClose, onChanged, onEdit, onOpenExpense, onSettle }: Props) {
  const toast = useToast();
  const [e, setE] = useState<any>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [dupWarn, setDupWarn] = useState<{ code: string | null; title: string } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [assets, setAssets] = useState<SpawnedAsset[]>([]);
  const [settlement, setSettlement] = useState<SettlementInfo>({});
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [showAllAttachments, setShowAllAttachments] = useState(false);
  const [attachmentFilter, setAttachmentFilter] = useState<AttachmentFilter>('all');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msgText, setMsgText] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      const [r1, r2] = await Promise.all([
        fetch(`/api/expenses/${expenseId}`),
        fetch(`/api/expenses/${expenseId}/messages`),
      ]);
      const j1 = await r1.json();
      if (!r1.ok) { toast.error(j1?.error || 'Không tải được phiếu'); onClose(); return; }
      setE(j1.data); setLines(j1.lines || []); setApprovals(j1.approvals || []); setDupWarn(j1.duplicateWarning);
      setAttachments(j1.attachments || []); setAssets(j1.assets || []); setSettlement(j1.settlement || {});
      const j2 = await r2.json().catch(() => ({}));
      if (Array.isArray(j2?.data)) setMessages(j2.data);
    } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseId]);

  useEffect(() => { setLoading(true); void load(); }, [load]);

  const action = async (path: string, body?: Record<string, unknown>, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(path);
    try {
      const r = await fetch(`/api/expenses/${expenseId}/${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(j?.error || 'Thao tác thất bại'); return; }
      toast.success('Thành công');
      setRejectOpen(false); setCancelOpen(false); setReason('');
      await load(); onChanged();
    } catch { toast.error('Lỗi kết nối'); } finally { setBusy(null); }
  };

  /** Upload files → kho chứng từ chung (chat + gallery cùng 1 nguồn). Trả metas. */
  const uploadFiles = async (files: File[]): Promise<Attachment[]> => {
    if (!files.length) return [];
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    const r = await fetch(`/api/expenses/${expenseId}/attachments`, { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(j?.error || 'Tải chứng từ thất bại'); return []; }
    return Array.isArray(j?.data) ? j.data : [];
  };

  /** Refresh gallery chứng từ. */
  const refreshAttachments = async () => {
    const r = await fetch(`/api/expenses/${expenseId}/attachments`);
    const j = await r.json().catch(() => ({}));
    if (Array.isArray(j?.data)) setAttachments(j.data);
  };

  /** Upload trực tiếp vào khu Chứng từ. */
  const uploadToGallery = async (files: File[]) => {
    if (!files.length) return;
    setBusy('upload');
    try {
      const saved = await uploadFiles(files);
      if (saved.length) { toast.success(`Đã thêm ${saved.length} chứng từ`); await refreshAttachments(); }
    } finally { setBusy(null); }
  };

  const deleteAtt = async (id: string) => {
    if (!window.confirm('Xóa chứng từ này?')) return;
    const r = await fetch(`/api/expenses/attachments/${id}`, { method: 'DELETE' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(j?.error || 'Xóa thất bại'); return; }
    await refreshAttachments();
  };

  /** Gửi chat: file đính trong chat TỰ ĐỘNG thành chứng từ (chung kho). */
  const sendMsg = async () => {
    const text = msgText.trim();
    if (!text && !pendingFiles.length) return;
    setBusy('msg');
    try {
      const saved = pendingFiles.length ? await uploadFiles(pendingFiles) : [];
      if (pendingFiles.length && !saved.length) return; // upload lỗi — giữ nguyên để thử lại
      const r = await fetch(`/api/expenses/${expenseId}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text, attachments: saved.map((a) => ({ id: a.id, file_name: a.file_name, mime_type: a.mime_type })) }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); toast.error(j?.error || 'Gửi thất bại'); return; }
      setMsgText(''); setPendingFiles([]);
      const [r2] = await Promise.all([fetch(`/api/expenses/${expenseId}/messages`), refreshAttachments()]);
      const j2 = await r2.json().catch(() => ({}));
      if (Array.isArray(j2?.data)) setMessages(j2.data);
    } finally { setBusy(null); }
  };

  /** Xem liền: ảnh → lightbox; PDF/khác → mở tab mới (inline). */
  const preview = (a: { id: string; mime_type: string }) => {
    const url = `/api/expenses/attachments/${a.id}`;
    if (isImage(a.mime_type)) setLightbox(url);
    else window.open(url, '_blank');
  };

  if (loading || !e) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const st = STATUS_CFG[e.status] || STATUS_CFG.draft;
  const isCreator = String(e.requested_by).toLowerCase() === currentUserId.toLowerCase();
  const canDeleteCurrentExpense = canDeleteExpense && (e.status === 'draft' || e.status === 'rejected');
  const myTurn = e.status === 'pending_approval' && approvals.some((a) =>
    a.status === 'pending' &&
    a.step_order === Math.min(...approvals.filter((x) => x.status === 'pending').map((x) => x.step_order)) &&
    String(a.approver_user_id).toLowerCase() === currentUserId.toLowerCase());
  const isAssetFlow = e.category_flow_type === 'asset_purchase';

  const STEP_DOT: Record<string, string> = {
    approved: 'bg-emerald-400', pending: 'bg-amber-400', rejected: 'bg-red-400', skipped: 'bg-slate-500',
  };
  const imageAttachments = attachments.filter((a) => isImage(a.mime_type));
  const fileAttachments = attachments.filter((a) => !isImage(a.mime_type));
  const filteredAttachments = attachmentFilter === 'images'
    ? imageAttachments
    : attachmentFilter === 'files'
    ? fileAttachments
    : attachments;
  const previewAttachments = showAllAttachments ? filteredAttachments : filteredAttachments.slice(0, 8);
  const hiddenAttachmentCount = Math.max(filteredAttachments.length - previewAttachments.length, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl border border-white/10" style={{ background: 'var(--card)' }}
        onClick={(ev) => ev.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/5 px-6 py-4" style={{ background: 'var(--card)' }}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {e.code && <span className="font-mono text-xs text-indigo-300">{e.code}</span>}
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-600 ${st.cls}`}>{st.label}</span>
            </div>
            <h2 className="mt-0.5 text-base font-700 text-foreground truncate">{e.title}</h2>
          </div>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5 shrink-0"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-6 space-y-5">
          {dupWarn && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> Nghi trùng với phiếu {dupWarn.code || ''} "{dupWarn.title}" (cùng NCC + số hóa đơn).
            </div>
          )}

          {/* Thông tin */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div><p className="text-2xs text-muted-foreground uppercase">Số tiền</p><p className="font-800 text-amber-400 tabular-nums">{formatMoney(Number(e.amount), e.currency)}</p>
              {(e.currency || 'VND') !== 'VND' && <p className="text-2xs text-muted-foreground tabular-nums">≈ {formatVND(Number(e.amount_base) || Math.round(Number(e.amount) * Number(e.exchange_rate || 1)))}</p>}</div>
            <div><p className="text-2xs text-muted-foreground uppercase">Loại</p><p className="text-foreground">{e.category_name || '—'}</p></div>
            <div><p className="text-2xs text-muted-foreground uppercase">Công ty chịu chi</p><p className="text-foreground">{e.company_name || '—'}</p></div>
            <div><p className="text-2xs text-muted-foreground uppercase">Người tạo</p><p className="text-foreground">{e.requester_name || '—'}</p></div>
            <div><p className="text-2xs text-muted-foreground uppercase">Ngày phát sinh</p><p className="text-foreground">{e.expense_date ? String(e.expense_date).slice(0, 10) : '—'}</p></div>
            <div><p className="text-2xs text-muted-foreground uppercase">Tạo lúc</p><p className="text-foreground">{fmtDT(e.created_at)}</p></div>
            {e.vat_enabled && <div><p className="text-2xs text-muted-foreground uppercase">VAT {Number(e.vat_rate)}%</p><p className="text-foreground tabular-nums">{formatMoney(Number(e.vat_amount) || 0, e.currency)}</p></div>}
            {e.supplier_name && <div><p className="text-2xs text-muted-foreground uppercase">NCC</p><p className="text-foreground">{e.supplier_name}{e.supplier_tax_code ? ` · ${e.supplier_tax_code}` : ''}</p></div>}
            {e.payee_name && <div><p className="text-2xs text-muted-foreground uppercase">Thụ hưởng</p><p className="text-foreground">{e.payee_name}</p></div>}
          </div>

          {e.related_type && (
            <div className="flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-300">
              <Link2 className="h-3.5 w-3.5" /> Dòng chảy: gắn với {e.related_type === 'ticket' ? 'Ticket' : e.related_type} <span className="font-mono">{e.related_id}</span>
              {isAssetFlow && <span className="ml-auto">→ tài sản {e.status === 'approved' || e.status === 'paid' || e.status === 'posted' ? 'Đang mua' : 'Chờ mua'}</span>}
            </div>
          )}

          {/* Lines */}
          {lines.length > 0 && (
            <div className="rounded-2xl border border-white/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-white/10 text-2xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 text-left">Nội dung</th><th className="px-3 py-2 text-right">SL</th>
                  <th className="px-3 py-2 text-right">Đơn giá</th><th className="px-3 py-2 text-right">Thành tiền</th>
                </tr></thead>
                <tbody>
                  {lines.map((l: any, i: number) => (
                    <tr key={i} className="border-b border-white/5">
                      <td className="px-3 py-2 text-foreground">
                        <div className="space-y-1">
                          <div>{l.noi_dung}{l.dvt ? ` (${l.dvt})` : ''}</div>
                          {l.mo_ta && <div className="whitespace-pre-wrap text-xs text-muted-foreground">{l.mo_ta}</div>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{Number(l.sl)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatMoney(Number(l.don_gia), e.currency)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-600 text-foreground">{formatMoney(Number(l.thanh_tien), e.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TẠM ỨNG: trạng thái quyết toán + danh sách phiếu quyết toán gắn vào */}
          {e.category_flow_type === 'advance' && (
            <div className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-700 text-violet-300">Phiếu tạm ứng</span>
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-600 ${(SETTLE_BADGE[e.settlement_status] || SETTLE_BADGE.none).cls}`}>
                  {(SETTLE_BADGE[e.settlement_status] || SETTLE_BADGE.none).l}
                </span>
              </div>
              {(settlement.settlements || []).length > 0 ? (
                <div className="space-y-1.5">
                  {settlement.settlements!.map((s) => (
                    <button key={s.id} type="button" onClick={() => onOpenExpense?.(s.id)}
                      className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-left hover:bg-black/30 transition-colors">
                      {s.code && <span className="font-mono text-2xs text-indigo-300">{s.code}</span>}
                      <span className="text-sm text-foreground truncate">{s.title}</span>
                      <span className={`ml-auto shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-600 ${(STATUS_CFG[s.status] || STATUS_CFG.draft).cls}`}>{(STATUS_CFG[s.status] || STATUS_CFG.draft).label}</span>
                      <span className="shrink-0 text-xs font-600 text-foreground tabular-nums">{formatMoney(Number(s.amount), s.currency)}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-violet-200/70">Chưa có phiếu quyết toán. Sau khi chi tiêu thực tế, bấm "Quyết toán" để kê thực chi.</p>
              )}
            </div>
          )}

          {/* QUYẾT TOÁN: phiếu tạm ứng gốc + chênh lệch tự tính */}
          {settlement.advance && (
            <div className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-3 space-y-2">
              <p className="text-sm font-700 text-violet-300">Quyết toán cho phiếu tạm ứng</p>
              <button type="button" onClick={() => onOpenExpense?.(settlement.advance!.id)}
                className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-left hover:bg-black/30 transition-colors">
                {settlement.advance.code && <span className="font-mono text-2xs text-indigo-300">{settlement.advance.code}</span>}
                <span className="text-sm text-foreground truncate">{settlement.advance.title}</span>
                <span className="ml-auto shrink-0 text-xs font-600 text-foreground tabular-nums">{formatMoney(Number(settlement.advance.amount), settlement.advance.currency)}</span>
              </button>
              {(() => {
                const adv = Number(settlement.advance!.amount);
                const actual = Number(e.amount);
                const diff = adv - actual;
                return (
                  <div className="rounded-xl bg-black/20 px-3 py-2 text-sm">
                    <div className="flex justify-between text-muted-foreground"><span>Đã tạm ứng</span><span className="tabular-nums">{formatMoney(adv, settlement.advance!.currency)}</span></div>
                    <div className="flex justify-between text-muted-foreground"><span>Thực chi</span><span className="tabular-nums">{formatMoney(actual, settlement.advance!.currency)}</span></div>
                    <div className="mt-1 flex justify-between border-t border-white/10 pt-1 font-700">
                      <span className="text-foreground">{diff > 0 ? 'Hoàn lại công ty' : diff < 0 ? 'Công ty chi thêm' : 'Khớp tạm ứng'}</span>
                      <span className={`tabular-nums ${diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-amber-400' : 'text-foreground'}`}>{diff === 0 ? '—' : formatMoney(Math.abs(diff), settlement.advance!.currency)}</span>
                    </div>
                  </div>
                );
              })()}
              {/* Hoàn ứng: thực chi < tạm ứng & phiếu đã duyệt xong → chờ công ty xác nhận đã nhận tiền */}
              {Number(settlement.advance.amount) > Number(e.amount)
                && ['approved', 'sent_to_accounting', 'posted', 'paid'].includes(e.status) && (
                e.refund_confirmed_at ? (
                  <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                    ✓ Công ty đã nhận hoàn ứng · {fmtDT(e.refund_confirmed_at)}
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                    <p className="text-xs text-amber-300">Chờ nhân viên hoàn tiền về công ty (không cần lệnh số âm, hệ thống tự hiểu chiều tiền).</p>
                    <button onClick={() => void action('confirm-refund', {}, 'Xác nhận công ty đã NHẬN tiền hoàn ứng?')} disabled={!!busy}
                      className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-2.5 py-1.5 text-2xs font-600 text-white disabled:opacity-50">
                      {busy === 'confirm-refund' ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Đã nhận hoàn ứng
                    </button>
                  </div>
                )
              )}
            </div>
          )}

          {/* Tài sản sinh ra từ dòng chảy */}
          {assets.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-600 text-muted-foreground uppercase tracking-wider">Tài sản từ phiếu này</p>
              <div className="space-y-1.5">
                {assets.map((a) => (
                  <Link key={a.id} href={`/asset-management?status=${a.status}`}
                    className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 hover:bg-emerald-500/20 transition-colors">
                    <Package size={14} className="text-emerald-400 shrink-0" />
                    <span className="font-mono text-xs text-emerald-300">{a.code}</span>
                    <span className="text-sm text-foreground truncate">{a.name}</span>
                    <span className="ml-auto shrink-0 rounded-full bg-black/20 px-2 py-0.5 text-2xs text-emerald-300">{ASSET_STATUS_LABEL[a.status] || a.status}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Attachments gallery (chat + khu nay chung 1 kho) */}
          <div>
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-600 text-muted-foreground uppercase tracking-wider">
                  <ImageIcon size={13} /> Chứng từ ({attachments.length})
                </p>
                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 text-2xs">
                    <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-muted-foreground">Tổng {attachments.length}</span>
                    <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-muted-foreground">Ảnh {imageAttachments.length}</span>
                    <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-muted-foreground">Tệp {fileAttachments.length}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {attachments.length > 8 && (
                  <button
                    type="button"
                    onClick={() => setShowAllAttachments((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-hover px-2.5 py-1 text-2xs font-600 text-foreground hover:bg-hover-strong"
                  >
                    {showAllAttachments ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    {showAllAttachments ? 'Thu gọn' : `Xem tất cả (${attachments.length})`}
                  </button>
                )}
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-hover px-2.5 py-1 text-2xs font-600 text-foreground hover:bg-hover-strong">
                  {busy === 'upload' ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} className="text-indigo-400" />} Thêm chứng từ
                  <input type="file" multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" className="hidden"
                    onChange={(ev) => { const fs = Array.from(ev.target.files || []); ev.target.value = ''; void uploadToGallery(fs); }} />
                </label>
              </div>
            </div>
            {attachments.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-xs text-muted-foreground">
                Chưa có chứng từ. Đính ở đây hoặc gửi thẳng ảnh vào khung trao đổi bên dưới, tất cả đều vào cùng một kho chứng từ.
              </p>
            ) : (
              <>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {([
                    ['all', `Tất cả (${attachments.length})`],
                    ['images', `Ảnh (${imageAttachments.length})`],
                    ['files', `Tệp (${fileAttachments.length})`],
                  ] as Array<[AttachmentFilter, string]>).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => { setAttachmentFilter(key); if (key !== 'all') setShowAllAttachments(true); }}
                      className={`rounded-full border px-2.5 py-1 text-2xs font-600 transition-colors ${
                        attachmentFilter === key
                          ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-300'
                          : 'border-white/10 bg-black/20 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className={showAllAttachments ? 'max-h-72 overflow-y-auto pr-1' : ''}>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {previewAttachments.map((a) => (
                      <div key={a.id} className="group relative overflow-hidden rounded-xl border border-white/10 bg-black/20">
                        <button type="button" onClick={() => preview(a)} className="block w-full">
                          {isImage(a.mime_type) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={`/api/expenses/attachments/${a.id}`} alt={a.file_name} className="h-20 w-full object-cover" loading="lazy" />
                          ) : (
                            <div className="flex h-20 w-full flex-col items-center justify-center gap-1 text-muted-foreground">
                              <FileText size={20} />
                              <span className="px-1 text-[9px] truncate max-w-full">{a.file_name}</span>
                            </div>
                          )}
                        </button>
                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-0.5 bg-black/60 px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <a href={`/api/expenses/attachments/${a.id}?download=1`} className="rounded p-1 text-white/80 hover:text-white" title="Tải về"><Download size={11} /></a>
                          <button type="button" onClick={() => void deleteAtt(a.id)} className="rounded p-1 text-red-300 hover:text-red-200" title="Xóa"><Trash2 size={11} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {!showAllAttachments && hiddenAttachmentCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAllAttachments(true)}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-600 text-indigo-300 hover:text-indigo-200"
                  >
                    <ChevronDown size={14} /> Xem thêm {hiddenAttachmentCount} chứng từ
                  </button>
                )}
              </>
            )}
          </div>

          {/* Timeline duyệt */}
          {approvals.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-600 text-muted-foreground uppercase tracking-wider">Chuỗi duyệt</p>
              <div className="space-y-3">
                {approvals.map((a) => (
                  <div key={a.id} className="flex gap-3">
                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${STEP_DOT[a.status] || 'bg-slate-500'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground">
                        <span className="font-600">Bước {a.step_order}: {a.approver_name || '—'}</span>
                        {a.limit_amount != null && <span className="ml-1.5 text-2xs text-muted-foreground">(hạn mức {formatVND(Number(a.limit_amount))})</span>}
                        <span className={`ml-2 text-2xs ${a.status === 'approved' ? 'text-emerald-400' : a.status === 'rejected' ? 'text-red-400' : a.status === 'skipped' ? 'text-muted-foreground' : 'text-amber-400'}`}>
                          {a.status === 'approved' ? 'Đã duyệt' : a.status === 'rejected' ? 'Từ chối' : a.status === 'skipped' ? 'Bỏ qua' : 'Chờ duyệt'}
                        </span>
                      </p>
                      {a.approved_at && <p className="text-2xs text-muted-foreground">{fmtDT(a.approved_at)}</p>}
                      {a.note && <p className="text-xs text-foreground mt-0.5">{a.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {e.reject_reason && (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {'L\u00fd do t\u1EEB ch\u1ED1i: '}{e.reject_reason}
            </p>
          )}
          {e.cancel_reason && (
            <p className="rounded-xl border border-white/10 bg-hover px-3 py-2 text-xs text-muted-foreground">
              {'\u0110\u00e3 h\u1EE7y: '}{e.cancel_reason}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {isCreator && (e.status === 'draft' || e.status === 'rejected') && (
              <>
                <button
                  onClick={() => onEdit(expenseId)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-600 text-foreground hover:bg-hover"
                >
                  <Pencil size={14} /> {'S\u1EEDa'}
                </button>
                <button
                  onClick={() => void action('submit')}
                  disabled={!!busy}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-600 text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {busy === 'submit' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  {'G\u1EEDi duy\u1EC7t'}
                </button>
              </>
            )}

            {canDeleteCurrentExpense && (
              <button
                onClick={async () => {
                  if (!window.confirm('X\u00f3a phi\u1ebfu chi n\u00e0y? H\u00e0nh \u0111\u1ed9ng n\u00e0y kh\u00f4ng th\u1ec3 ho\u00e0n t\u00e1c.')) return;
                  setBusy('delete');
                  try {
                    const r = await fetch(`/api/expenses/${expenseId}`, { method: 'DELETE' });
                    const j = await r.json().catch(() => ({}));
                    if (!r.ok) {
                      toast.error(j?.error || 'X\u00f3a th\u1ea5t b\u1ea1i');
                      return;
                    }
                    toast.success('\u0110\u00e3 x\u00f3a phi\u1ebfu chi');
                    onClose();
                    onChanged();
                  } catch {
                    toast.error('L\u1ed7i k\u1ebft n\u1ed1i');
                  } finally {
                    setBusy(null);
                  }
                }}
                disabled={!!busy}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-600 text-red-400 hover:bg-red-500/20 disabled:opacity-50"
              >
                {busy === 'delete' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {'X\u00f3a phi\u1ebfu'}
              </button>
            )}

            {isCreator && e.status === 'pending_approval' && (
              <button
                onClick={() => void action('recall', {}, 'Thu h\u1ed3i phi\u1ebfu v\u1ec1 nh\u00e1p?')}
                disabled={!!busy}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-600 text-foreground hover:bg-hover disabled:opacity-50"
              >
                <Undo2 size={14} /> {'Thu h\u1ed3i'}
              </button>
            )}

            {myTurn && (
              <>
                <button
                  onClick={() => void action('approve')}
                  disabled={!!busy}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-600 text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {busy === 'approve' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  {'Duy\u1ec7t'}
                </button>
                <button
                  onClick={() => { setReason(''); setRejectOpen(true); }}
                  disabled={!!busy}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-600 text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                >
                  <XCircle size={14} /> {'T\u1EEB ch\u1ED1i'}
                </button>
              </>
            )}

            {isCreator && e.category_flow_type === 'advance' && e.settlement_status !== 'settled' &&
              ['approved', 'sent_to_accounting', 'posted', 'paid'].includes(e.status) && (
                <button
                  onClick={() => onSettle?.({
                    id: e.id,
                    code: e.code,
                    title: e.title,
                    amount: Number(e.amount),
                    company_id: e.company_id,
                    currency: e.currency,
                  })}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-600 text-amber-300 hover:bg-amber-500/20"
                >
                  <Receipt size={14} /> {'Quy\u1ebft to\u00e1n'}
                </button>
              )}

            {e.status === 'approved' && (
              <>
                {isAssetFlow && (
                  <button
                    onClick={() => void action('receive', {}, 'X\u00e1c nh\u1eadn \u0111\u00e3 nh\u1eadn h\u00e0ng? T\u00e0i s\u1ea3n s\u1ebd chuy\u1ec3n sang tr\u1ea1ng th\u00e1i \u0110ang d\u00f9ng.')}
                    disabled={!!busy}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs font-600 text-sky-300 hover:bg-sky-500/20 disabled:opacity-50"
                  >
                    <PackageCheck size={14} /> {'Nh\u1eadn h\u00e0ng'}
                  </button>
                )}
                <button
                  onClick={() => { setReason(''); setCancelOpen(true); }}
                  disabled={!!busy}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-600 text-foreground hover:bg-hover disabled:opacity-50"
                >
                  <Ban size={14} /> {'H\u1EE7y phi\u1ebfu'}
                </button>
              </>
            )}
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-600 text-muted-foreground uppercase tracking-wider">
              <MessageSquare size={13} /> {'Trao \u0111\u1ed5i'} ({messages.length})
            </p>
            <div className="space-y-2">
              {messages.length === 0 && (
                <p className="py-2 text-xs text-muted-foreground">{'Ch\u01b0a c\u00f3 trao \u0111\u1ed5i n\u00e0o.'}</p>
              )}
              {messages.map((m) => (
                <div key={m.id} className="rounded-xl border border-white/5 bg-black/10 px-3 py-2">
                  <p className="text-2xs text-muted-foreground">
                    <span className="font-600 text-foreground">{m.author_name}</span>
                    {m.source === 'accounting' && (
                      <span className="ml-1.5 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-sky-400">{'K\u1EBF to\u00e1n'}</span>
                    )}
                    <span className="ml-2">{fmtDT(m.created_at)}</span>
                  </p>
                  {m.body && <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">{m.body}</p>}
                  {Array.isArray(m.attachments) && m.attachments.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {m.attachments.map((a) => isImage(a.mime_type) ? (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setLightbox(`/api/expenses/attachments/${a.id}`)}
                          className="overflow-hidden rounded-lg border border-white/10"
                        >
                          <img src={`/api/expenses/attachments/${a.id}`} alt={a.file_name} className="h-16 w-16 object-cover" loading="lazy" />
                        </button>
                      ) : (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => preview(a)}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-hover px-2 py-1 text-2xs text-foreground hover:bg-hover-strong"
                        >
                          <FileText size={11} /> {a.file_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {pendingFiles.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {pendingFiles.map((f, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-2 py-1 text-2xs text-indigo-300">
                    <Paperclip size={11} /> {f.name}
                    <button type="button" onClick={() => setPendingFiles((cur) => cur.filter((_, j) => j !== i))} className="hover:text-red-300">
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="mt-2 flex items-center gap-2">
              <label
                className="flex shrink-0 cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-[#162033] px-3 text-muted-foreground hover:text-indigo-400"
                title={'\u0110\u00ednh ch\u1ee9ng t\u1eeb (ho\u1eb7c d\u00e1n \u1ea3nh v\u00e0o \u00f4 nh\u1eafn)'}
              >
                <Paperclip size={16} />
                <input
                  type="file"
                  multiple
                  accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                  className="hidden"
                  onChange={(ev) => {
                    const fs = Array.from(ev.target.files || []);
                    ev.target.value = '';
                    setPendingFiles((cur) => [...cur, ...fs]);
                  }}
                />
              </label>
              <input
                value={msgText}
                onChange={(ev) => setMsgText(ev.target.value)}
                onKeyDown={(ev) => { if (ev.key === 'Enter') void sendMsg(); }}
                onPaste={(ev) => {
                  const fs = Array.from(ev.clipboardData?.files || []);
                  if (fs.length) {
                    ev.preventDefault();
                    setPendingFiles((cur) => [...cur, ...fs]);
                  }
                }}
                placeholder={'Nh\u1eafn ho\u1eb7c d\u00e1n \u1ea3nh ch\u1ee9ng t\u1eeb (Ctrl+V)\u2026'}
                className="flex-1 rounded-xl border border-white/10 bg-[#162033] px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500"
              />
              <button
                onClick={() => void sendMsg()}
                disabled={busy === 'msg' || (!msgText.trim() && !pendingFiles.length)}
                className="rounded-xl bg-indigo-600 px-3 py-2 text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {busy === 'msg' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        </div>

        {lightbox && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.85)' }}
            onClick={() => setLightbox(null)}
          >
            <img src={lightbox} alt={'Ch\u1ee9ng t\u1eeb'} className="max-h-full max-w-full rounded-xl" onClick={(ev) => ev.stopPropagation()} />
            <button onClick={() => setLightbox(null)} className="absolute right-4 top-4 rounded-full bg-black/60 p-2 text-white hover:bg-black/80">
              <X size={18} />
            </button>
          </div>
        )}

        {(rejectOpen || cancelOpen) && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)' }}
            onClick={(ev) => {
              if (ev.target === ev.currentTarget) {
                setRejectOpen(false);
                setCancelOpen(false);
              }
            }}
          >
            <div className="w-full max-w-sm space-y-4 rounded-3xl border border-white/10 p-6" style={{ background: 'var(--card)' }}>
              <h3 className="text-base font-700 text-foreground">
                {rejectOpen ? 'T\u1EEB ch\u1ED1i phi\u1EBFu chi' : 'H\u1EE7y phi\u1EBFu chi'}
              </h3>
              <textarea
                value={reason}
                onChange={(ev) => setReason(ev.target.value)}
                rows={4}
                placeholder={'Nh\u1eadp l\u00fd do\u2026'}
                className="w-full resize-none rounded-xl border border-white/10 bg-[#162033] px-3 py-2 text-sm text-foreground outline-none focus:border-red-500/60"
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => { setRejectOpen(false); setCancelOpen(false); }} className="btn-ghost rounded-xl px-3 py-2 text-sm">
                  {'\u0110\u00f3ng'}
                </button>
                <button
                  disabled={!reason.trim() || !!busy}
                  onClick={() => void action(rejectOpen ? 'reject' : 'cancel', { reason })}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-sm font-600 text-white hover:bg-red-500 disabled:opacity-50"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                  {'X\u00e1c nh\u1eadn'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
