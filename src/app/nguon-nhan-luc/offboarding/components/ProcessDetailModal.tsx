'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Loader2, CheckCircle2, ShieldCheck, Ban, CalendarDays, Ticket, AlertTriangle, Package, UserCircle2,
  Paperclip, Upload, Trash2, Download, FileText, Briefcase,
} from 'lucide-react';
import {
  getObProcess, toggleObItem, completeObProcess, cancelObProcess,
  listObAttachments, uploadObAttachment, deleteObAttachment, obAttachmentUrl, getObPendingWork,
  ObProcess, ObItem, ObAttachment, ObPendingWork,
  OB_STATUS_LABELS, OB_REASON_LABELS, OB_CATEGORY_LABELS, obFmtDate, obFmtDateTime,
} from '@/lib/api/offboardingApi';
import UserAvatar from '@/components/UserAvatar';
import { useEscapeKey } from '@/hooks/useEscapeKey';

interface ProcessDetailModalProps {
  processId: string;
  onClose: () => void;
  onChanged: () => void;
}

/** Modal chi tiết quy trình: checklist nhóm theo bộ phận, xác nhận hoàn tất / hủy. */
export default function ProcessDetailModal({ processId, onClose, onChanged }: ProcessDetailModalProps) {
  const [proc, setProc] = useState<ObProcess | null>(null);
  // ESC đóng modal chính, nhưng nếu đang mở hộp xác nhận con thì để hộp con tự xử lý.
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState('');
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');
  const [attachments, setAttachments] = useState<ObAttachment[]>([]);
  const [skipAttach, setSkipAttach] = useState(false); // nghỉ sớm: hoàn tất không kèm hồ sơ
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState<ObPendingWork | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  useEscapeKey(onClose, !confirmComplete && !confirmCancel);

  const load = async () => {
    try {
      const [p, atts] = await Promise.all([getObProcess(processId), listObAttachments(processId).catch(() => [])]);
      setProc(p);
      setAttachments(atts);
      getObPendingWork(processId).then(setPending).catch(() => {});
    }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [processId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) e.target.value = '';
    if (!file) return;
    setUploading(true); setError('');
    try {
      const att = await uploadObAttachment(processId, file);
      setAttachments((prev) => [att, ...prev]);
    } catch (err: any) { setError(err.message || 'Lỗi tải tệp'); }
    finally { setUploading(false); }
  };

  const handleDeleteAtt = async (docId: string) => {
    setError('');
    try {
      await deleteObAttachment(processId, docId);
      setAttachments((prev) => prev.filter((a) => a.id !== docId));
    } catch (err: any) { setError(err.message || 'Lỗi xoá tệp'); }
  };

  const items = proc?.items || [];
  const grouped = useMemo(() => {
    const g: Record<string, ObItem[]> = {};
    for (const i of items) (g[i.category] ||= []).push(i);
    return g;
  }, [items]);

  const doneCount = items.filter((i) => i.is_done).length;
  const requiredLeft = items.filter((i) => i.required && !i.is_done).length;
  const pct = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0;
  const inProgress = proc?.status === 'in_progress';

  const handleToggle = async (item: ObItem) => {
    if (!inProgress || togglingId) return;
    setTogglingId(item.id); setError('');
    try {
      const updated = await toggleObItem(processId, item.id, !item.is_done);
      setProc((prev) => prev ? { ...prev, items: (prev.items || []).map((i) => i.id === updated.id ? { ...i, ...updated } : i) } : prev);
      onChanged();
    } catch (e: any) { setError(e.message || 'Lỗi server'); }
    finally { setTogglingId(''); }
  };

  const handleComplete = async () => {
    setActing(true); setError('');
    try {
      const updated = await completeObProcess(processId, attachments.length === 0 && skipAttach);
      setProc(updated); setConfirmComplete(false); onChanged();
    } catch (e: any) { setError(e.message || 'Lỗi server'); setConfirmComplete(false); }
    finally { setActing(false); }
  };

  const handleCancel = async () => {
    setActing(true); setError('');
    try {
      const updated = await cancelObProcess(processId, cancelReason);
      setProc(updated); setConfirmCancel(false); onChanged();
    } catch (e: any) { setError(e.message || 'Lỗi server'); }
    finally { setActing(false); }
  };

  const st = proc ? (OB_STATUS_LABELS[proc.status] || OB_STATUS_LABELS.in_progress) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={() => { if (!confirmComplete && !confirmCancel) onClose(); }}>
      <div className="w-full max-w-2xl rounded-3xl border border-line overflow-hidden max-h-[92vh] flex flex-col"
        style={{ background: 'var(--card)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
          <h2 className="text-base font-700 text-foreground">Quy Trình Nghỉ Việc</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-hover"><X className="h-4 w-4" /></button>
        </div>

        {loading || !proc ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="overflow-y-auto">
              {/* Thông tin nhân sự */}
              <div className="px-6 py-4 border-b border-line-subtle">
                <div className="flex items-start gap-3">
                  <UserAvatar name={proc.user_name || '?'} avatarUrl={proc.user_avatar} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-base font-600 text-foreground">{proc.user_name}</p>
                      {st && <span className={`rounded-full border px-2 py-0.5 text-2xs font-600 ${st.color}`}>{st.label}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">{[proc.job_title_name, proc.sub_department_name, proc.department_name, proc.company_name].filter(Boolean).join(' · ') || proc.user_email}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="rounded-md bg-hover px-1.5 py-0.5">{OB_REASON_LABELS[proc.reason] || proc.reason}</span>
                      {proc.last_working_date && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Ngày cuối: {obFmtDate(proc.last_working_date)}</span>}
                      {proc.source_ticket_id && <span className="inline-flex items-center gap-1"><Ticket className="h-3 w-3" /> {proc.source_ticket_id}</span>}
                    </div>
                    {proc.reason_note && <p className="mt-1.5 text-xs text-muted-foreground italic">&quot;{proc.reason_note}&quot;</p>}
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex items-center justify-between text-2xs text-muted-foreground mb-1">
                    <span>Tiến độ checklist</span><span>{doneCount}/{items.length} · {pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-hover overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
                {proc.status === 'completed' && (
                  <p className="mt-2 text-xs text-emerald-400 inline-flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5" /> Hoàn tất {obFmtDateTime(proc.completed_at)} — tài khoản đã vô hiệu hóa
                  </p>
                )}
                {proc.status === 'cancelled' && (
                  <p className="mt-2 text-xs text-ink-muted inline-flex items-center gap-1.5">
                    <Ban className="h-3.5 w-3.5" /> Đã hủy {obFmtDateTime(proc.cancelled_at)}{proc.cancel_reason ? ` — ${proc.cancel_reason}` : ''}
                  </p>
                )}
              </div>

              {/* Checklist theo nhóm */}
              <div className="px-6 py-4 space-y-4">
                {Object.entries(grouped).map(([cat, list]) => {
                  const cl = OB_CATEGORY_LABELS[cat] || OB_CATEGORY_LABELS.other;
                  return (
                    <div key={cat}>
                      <p className={`text-xs font-600 uppercase tracking-wider mb-2 ${cl.color}`}>{cl.label} ({list.filter((i) => i.is_done).length}/{list.length})</p>
                      <div className="space-y-1.5">
                        {list.map((item) => (
                          <button key={item.id} onClick={() => handleToggle(item)} disabled={!inProgress || !!togglingId}
                            className={`flex w-full items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${item.is_done ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-line-subtle hover:bg-hover'} ${!inProgress ? 'cursor-default' : ''}`}>
                            {togglingId === item.id
                              ? <Loader2 className="h-4.5 w-4.5 mt-0.5 shrink-0 animate-spin text-muted-foreground" />
                              : <CheckCircle2 className={`h-4.5 w-4.5 mt-0.5 shrink-0 ${item.is_done ? 'text-emerald-400' : 'text-white/15'}`} />}
                            <div className="min-w-0 flex-1">
                              <p className={`text-sm ${item.is_done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                                {item.asset_id && <Package className="inline h-3.5 w-3.5 mr-1 text-amber-400" />}
                                {item.title}
                                {!item.required && <span className="ml-1.5 text-2xs text-muted-foreground">(không bắt buộc)</span>}
                              </p>
                              {item.description && <p className="text-2xs text-muted-foreground mt-0.5">{item.description}</p>}
                              <div className="flex items-center flex-wrap gap-x-3 mt-0.5">
                                {item.assignee_name && (
                                  <p className="text-2xs text-indigo-300/80 flex items-center gap-1">
                                    <UserCircle2 className="h-3 w-3" /> {item.assignee_name}
                                  </p>
                                )}
                                {item.is_done && item.done_by_name && (
                                  <p className="text-2xs text-emerald-400/70">✓ {item.done_by_name} · {obFmtDateTime(item.done_at)}</p>
                                )}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Hồ sơ nghỉ việc đính kèm */}
              <div className="px-6 py-4 border-t border-line-subtle">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-600 uppercase tracking-wider text-foreground inline-flex items-center gap-1.5">
                    <Paperclip className="h-3.5 w-3.5 text-indigo-400" /> Hồ Sơ Nghỉ Việc
                    <span className="text-2xs font-400 text-muted-foreground normal-case tracking-normal">(bắt buộc ≥ 1 tệp)</span>
                  </p>
                  {inProgress && (
                    <>
                      <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload}
                        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" />
                      <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1.5 text-2xs font-600 text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-50">
                        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Tải lên
                      </button>
                    </>
                  )}
                </div>
                {attachments.length === 0 ? (
                  <p className="text-2xs text-muted-foreground italic py-1">Chưa có hồ sơ nào. Đính kèm quyết định thôi việc / biên bản thanh lý…</p>
                ) : (
                  <div className="space-y-1.5">
                    {attachments.map((a) => (
                      <div key={a.id} className="flex items-center gap-2.5 rounded-xl border border-line-subtle px-3 py-2" style={{ background: 'var(--secondary)' }}>
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <a href={obAttachmentUrl(processId, a.id)} target="_blank" rel="noopener noreferrer"
                          className="text-sm text-foreground truncate flex-1 hover:text-indigo-300">{a.file_name}</a>
                        {a.size_bytes != null && <span className="text-2xs text-muted-foreground shrink-0">{(a.size_bytes / 1024).toFixed(0)} KB</span>}
                        <a href={obAttachmentUrl(processId, a.id)} download className="text-muted-foreground hover:text-indigo-300 shrink-0" title="Tải xuống"><Download className="h-3.5 w-3.5" /></a>
                        {inProgress && (
                          <button onClick={() => handleDeleteAtt(a.id)} className="text-muted-foreground hover:text-red-400 shrink-0" title="Xoá"><Trash2 className="h-3.5 w-3.5" /></button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Cảnh báo việc còn tồn của nhân sự */}
              {inProgress && pending && (pending.tickets + pending.tasks + pending.bookings) > 0 && (
                <div className="px-6 pb-4">
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
                    <p className="text-xs font-600 text-amber-400 inline-flex items-center gap-1.5">
                      <Briefcase className="h-3.5 w-3.5" /> Nhân sự còn việc chưa bàn giao
                    </p>
                    <p className="text-2xs text-amber-300/90 mt-1">
                      {[
                        pending.tickets > 0 ? `${pending.tickets} ticket đang mở` : null,
                        pending.tasks > 0 ? `${pending.tasks} công việc` : null,
                        pending.bookings > 0 ? `${pending.bookings} lịch họp sắp tới` : null,
                      ].filter(Boolean).join(' · ')} — nên chuyển giao trước khi hoàn tất.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <p className="px-6 py-2 flex items-center gap-1.5 text-xs text-red-400 border-t border-line-subtle">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {error}
              </p>
            )}

            {/* Footer hành động */}
            {inProgress && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-line-subtle px-6 py-4">
                <button onClick={() => setConfirmCancel(true)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm text-muted-foreground hover:text-red-400 hover:bg-red-500/10">
                  <Ban className="h-4 w-4" /> Hủy quy trình
                </button>
                <div className="flex flex-col items-stretch sm:items-end gap-1">
                  <button onClick={() => setConfirmComplete(true)} disabled={requiredLeft > 0 || (attachments.length === 0 && !skipAttach)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2.5 text-sm font-600 text-white disabled:opacity-40 disabled:cursor-not-allowed">
                    <ShieldCheck className="h-4 w-4" /> Xác Nhận Đủ Thủ Tục Nghỉ Việc
                  </button>
                  {requiredLeft > 0 && <p className="text-2xs text-amber-400 text-center sm:text-right">Còn {requiredLeft} đầu mục bắt buộc chưa hoàn thành</p>}
                  {requiredLeft === 0 && attachments.length === 0 && (
                    <label className="flex items-center gap-1.5 text-2xs text-amber-400 cursor-pointer select-none sm:justify-end">
                      <input type="checkbox" checked={skipAttach} onChange={(e) => setSkipAttach(e.target.checked)} className="accent-amber-500" />
                      Nghỉ sớm, không có biên bản bàn giao — hoàn tất không kèm hồ sơ
                    </label>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Xác nhận hoàn tất */}
        {confirmComplete && proc && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
            <div className="w-full max-w-sm rounded-2xl border border-line p-5" style={{ background: 'var(--card)' }}>
              <p className="text-sm font-600 text-foreground">Xác nhận hoàn tất thủ tục nghỉ việc?</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Tài khoản của <span className="text-foreground font-600">{proc.user_name}</span> sẽ bị
                <span className="text-red-400 font-600"> vô hiệu hóa NGAY LẬP TỨC</span> + đăng xuất mọi phiên.
                Đồng thời: <span className="text-foreground">thu hồi toàn bộ tài sản</span> (về "Sẵn sàng) và
                <span className="text-foreground"> lưu hồ sơ nghỉ việc vào hồ sơ nhân sự</span>. Hành động này không thể hoàn tác.
              </p>
              {attachments.length === 0 && skipAttach && (
                <p className="mt-2 text-2xs text-amber-400">⚠️ Hoàn tất KHÔNG kèm hồ sơ nghỉ việc (nghỉ sớm, không có biên bản bàn giao).</p>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => setConfirmComplete(false)} className="rounded-xl px-3 py-1.5 text-sm text-muted-foreground hover:bg-hover">Quay lại</button>
                <button onClick={handleComplete} disabled={acting}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-sm font-600 text-white disabled:opacity-50">
                  {acting && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Xác nhận
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Xác nhận hủy */}
        {confirmCancel && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
            <div className="w-full max-w-sm rounded-2xl border border-line p-5" style={{ background: 'var(--card)' }}>
              <p className="text-sm font-600 text-foreground">Hủy quy trình nghỉ việc này?</p>
              <p className="mt-1.5 text-xs text-muted-foreground">Dùng khi nhân sự rút đơn hoặc tạo nhầm. Tài khoản không bị ảnh hưởng.</p>
              <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={2}
                placeholder="Lý do hủy..." className="mt-3 w-full rounded-xl px-3 py-2 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 resize-none" />
              <div className="mt-3 flex justify-end gap-2">
                <button onClick={() => setConfirmCancel(false)} className="rounded-xl px-3 py-1.5 text-sm text-muted-foreground hover:bg-hover">Quay lại</button>
                <button onClick={handleCancel} disabled={acting}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 hover:bg-red-500 px-3 py-1.5 text-sm font-600 text-white disabled:opacity-50">
                  {acting && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Hủy quy trình
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
