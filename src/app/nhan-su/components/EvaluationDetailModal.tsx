'use client';

import { useEffect, useRef, useState } from 'react';
import {
  X, Loader2, Paperclip, Trash2, Download, Eye, Users, CheckCircle2, XCircle, Clock, Wand2,
} from 'lucide-react';
import {
  Evaluation, EvalWatcher, AttachmentMeta, EmploymentType,
  getEvaluation, updateEvaluationApi, concludeEvaluationApi,
  listEvalWatchers, addEvalWatcher, removeEvalWatcher,
  listEvalAttachments, uploadEvalAttachments, deleteEvalAttachment,
  regenerateEvalContractsApi,
  fmtBytes,
} from './hrApi';
import { useToast } from '@/context/ToastContext';
import { fmtDate, canPreviewInline } from '../utils/hrHelpers';
import { EVAL_STATUS_LABELS } from './EvaluationsTab';
import MultiUserPicker from './MultiUserPicker';
import ConfirmModal from './ConfirmModal';
import { useEscapeKey } from '@/hooks/useEscapeKey';

interface Props {
  evaluationId: string;
  canEdit: boolean;
  empTypes: EmploymentType[];
  onClose: () => void;
  onChanged: () => void;
}

export default function EvaluationDetailModal({ evaluationId, canEdit, onClose, onChanged }: Props) {
  const toast = useToast();
  const [ev, setEv] = useState<Evaluation | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [watchers, setWatchers] = useState<EvalWatcher[]>([]);
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [concludeModal, setConcludeModal] = useState<'pass' | 'fail' | null>(null);
  const [failAction, setFailAction] = useState<'extend' | 'terminate'>('extend');
  const [extendDays, setExtendDays] = useState<number>(30);
  const [concludeNote, setConcludeNote] = useState('');
  const [concluding, setConcluding] = useState(false);
  const [concludeError, setConcludeError] = useState('');
  const [statusConfirm, setStatusConfirm] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ESC đóng modal chính — tắt khi đang mở lớp con (kết luận / lightbox) để không đóng nhầm.
  useEscapeKey(onClose, !concludeModal && !lightbox);
  // ESC đóng modal con "Kết luận" khi đang mở.
  useEscapeKey(() => { if (!concluding) setConcludeModal(null); }, !!concludeModal);

  /** Sinh lại nháp HĐ chính thức khi nháp tự động bị xoá nhầm (thẻ đã ĐẠT). */
  async function regenerateContracts() {
    setRegenerating(true);
    try {
      await regenerateEvalContractsApi(evaluationId);
      toast.success('Đã sinh lại nháp hợp đồng — xem tại tab Hợp Đồng');
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không sinh lại được nháp hợp đồng');
    } finally { setRegenerating(false); }
  }

  async function load() {
    try {
      const [detail, w, a] = await Promise.all([
        getEvaluation(evaluationId),
        listEvalWatchers(evaluationId),
        listEvalAttachments(evaluationId),
      ]);
      setEv(detail);
      setWatchers(w);
      setAttachments(a);
    } catch { /* noop */ } finally { setLoading(false); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [evaluationId]);

  async function markEvaluated() {
    if (!ev) return;
    setBusy(true);
    try {
      await updateEvaluationApi(ev.id, { status: 'evaluated' });
      onChanged();
      await load();
    } catch { /* noop */ } finally { setBusy(false); }
  }

  function openConclude(kind: 'pass' | 'fail') {
    setConcludeNote('');
    setConcludeError('');
    setFailAction('extend');
    setExtendDays(30);
    setConcludeModal(kind);
  }

  async function handleConclude() {
    if (!ev || !concludeModal) return;
    setConcluding(true);
    setConcludeError('');
    try {
      await concludeEvaluationApi(ev.id, {
        result: concludeModal,
        result_note: concludeNote || undefined,
        ...(concludeModal === 'fail'
          ? { failAction, ...(failAction === 'extend' ? { extendDays } : {}) }
          : {}),
      });
      setConcludeModal(null);
      onChanged();
      await load();
    } catch (err: any) {
      setConcludeError(err.message || 'Lỗi khi kết luận');
    } finally { setConcluding(false); }
  }

  async function handleAddWatcher(users: { id: string; name: string }[]) {
    if (!users.length || !ev) return;
    setBusy(true);
    try {
      for (const u of users) await addEvalWatcher(ev.id, u.id);
      setWatchers(await listEvalWatchers(ev.id));
    } catch { /* noop */ } finally { setBusy(false); }
  }

  async function handleRemoveWatcher(userId: string) {
    if (!ev) return;
    await removeEvalWatcher(ev.id, userId);
    setWatchers((prev) => prev.filter((w) => w.user_id !== userId));
  }

  async function handleUpload(files: FileList | null) {
    if (!files?.length || !ev) return;
    setBusy(true);
    try {
      await uploadEvalAttachments(ev.id, files);
      setAttachments(await listEvalAttachments(ev.id));
    } catch { /* noop */ } finally { setBusy(false); }
  }

  async function handleDeleteAttachment(id: string) {
    await deleteEvalAttachment(id);
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  const st = ev ? (EVAL_STATUS_LABELS[ev.status] ?? EVAL_STATUS_LABELS.draft) : null;
  const canConclude = canEdit && ev && ['pending_signing', 'evaluated'].includes(ev.status);
  const canMarkEvaluated = canEdit && ev?.status === 'pending_signing';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}>
      <div className="w-full max-w-2xl rounded-3xl border border-line overflow-hidden flex flex-col max-h-[90vh]"
        style={{ background: 'var(--card)' }}
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4 shrink-0">
          <div>
            <h2 className="text-base font-600 text-foreground">
              Chi tiết đánh giá — {ev?.employee_name ?? '…'}
            </h2>
            {st && <span className={`text-2xs rounded-full px-2 py-0.5 ${st.cls}`}>{st.label}</span>}
          </div>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : ev ? (
          <div className="overflow-y-auto flex-1">
            {/* Info */}
            <div className="p-6 grid grid-cols-2 sm:grid-cols-3 gap-4 border-b border-line-subtle">
              {[
                { label: 'Hình thức', value: ev.employment_type_name ?? '—' },
                { label: 'Ngày bắt đầu', value: fmtDate(ev.hire_date) },
                { label: 'Hạn đánh giá', value: fmtDate(ev.probation_end_date) },
                { label: 'Phòng ban', value: ev.employee_department_name ?? '—' },
                { label: 'Tự động tạo', value: ev.auto_generated ? 'Có (hệ thống)' : 'Không (thủ công)' },
                { label: 'Kết quả', value: ev.result === 'pass' ? '✅ Đạt' : ev.result === 'fail' ? '❌ Không đạt' : '—' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-2xs font-600 uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
                  <p className="text-sm text-foreground">{value}</p>
                </div>
              ))}
              {ev.result_note && (
                <div className="col-span-2 sm:col-span-3">
                  <p className="text-2xs font-600 uppercase tracking-wider text-muted-foreground mb-0.5">Ghi chú kết luận</p>
                  <p className="text-sm text-foreground">{ev.result_note}</p>
                </div>
              )}
              {ev.status === 'passed' && (
                <div className="col-span-2 sm:col-span-3">
                  <p className="text-2xs font-600 uppercase tracking-wider text-muted-foreground mb-0.5">Hợp đồng chính thức</p>
                  {ev.resulting_contract_id && ev.resulting_contract_exists !== false ? (
                    <p className="text-sm text-indigo-400">Đã tạo tự động (nháp) — xem tại tab Hợp Đồng</p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-sm text-amber-400">Nháp hợp đồng không còn (đã bị xoá hoặc chưa từng tạo)</p>
                      {canEdit && (
                        <button onClick={regenerateContracts} disabled={regenerating}
                          className="rounded-xl border border-indigo-500/40 text-indigo-400 hover:bg-indigo-500/10 px-3 py-1.5 text-xs font-600 flex items-center gap-1.5 disabled:opacity-50">
                          {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                          Tự sinh lại bản nháp
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              {ev.resulting_offboarding_id && (
                <div className="col-span-2 sm:col-span-3">
                  <p className="text-2xs font-600 uppercase tracking-wider text-muted-foreground mb-0.5">Quy trình Offboarding</p>
                  <a href="/nguon-nhan-luc/offboarding" target="_blank" rel="noopener noreferrer"
                    className="text-sm text-amber-400 hover:text-amber-300 underline underline-offset-2">
                    Đã khởi tạo tự động — xem tại Nguồn Nhân Lực → Nghỉ Việc
                  </a>
                </div>
              )}
            </div>

            {/* Actions */}
            {canEdit && !['passed', 'failed'].includes(ev.status) && (
              <div className="px-6 py-4 flex flex-wrap gap-2 border-b border-line-subtle">
                {canMarkEvaluated && (
                  <button onClick={markEvaluated} disabled={busy}
                    className="rounded-xl border border-sky-500 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 px-4 py-2 text-sm font-600 flex items-center gap-1.5 disabled:opacity-50">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Đánh dấu đã đánh giá
                  </button>
                )}
                {canConclude && (
                  <>
                    <button onClick={() => openConclude('pass')}
                      className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 text-sm font-600 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4" /> Kết luận: Đạt
                    </button>
                    <button onClick={() => openConclude('fail')}
                      className="rounded-xl bg-red-600 hover:bg-red-500 text-white px-4 py-2 text-sm font-600 flex items-center gap-1.5">
                      <XCircle className="h-4 w-4" /> Kết luận: Không đạt
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Người theo dõi */}
            <div className="px-6 py-4 border-b border-line-subtle space-y-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-600 text-foreground">Người theo dõi ({watchers.length})</p>
              </div>
              {canEdit && (
                <MultiUserPicker
                  value={[]}
                  onChange={(users) => handleAddWatcher(users)}
                  excludeIds={[ev.employee_id, ...watchers.map((w) => w.user_id)]}
                  placeholder="Thêm quản lý theo dõi…"
                />
              )}
              <div className="flex flex-wrap gap-2">
                {watchers.map((w) => (
                  <div key={w.user_id} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs">
                    <span>{w.user_name}</span>
                    {canEdit && (
                      <button onClick={() => handleRemoveWatcher(w.user_id)} className="text-muted-foreground hover:text-red-400">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
                {!watchers.length && <p className="text-xs text-muted-foreground">Chưa có người theo dõi</p>}
              </div>
            </div>

            {/* Tệp đính kèm */}
            <div className="px-6 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-600 text-foreground">Biên bản đánh giá ({attachments.length})</p>
                </div>
                {canEdit && (
                  <>
                    <input ref={fileRef} type="file" multiple
                      onChange={(e) => handleUpload(e.target.files)} className="hidden" />
                    <button onClick={() => fileRef.current?.click()} disabled={busy}
                      className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 disabled:opacity-50">
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                      Thêm tệp
                    </button>
                  </>
                )}
              </div>
              {attachments.length === 0 ? (
                <p className="text-xs text-muted-foreground">Chưa có biên bản</p>
              ) : (
                <div className="space-y-2">
                  {attachments.map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded-lg border border-line p-3">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm text-foreground truncate">{a.file_name}</p>
                          <p className="text-2xs text-muted-foreground">{fmtBytes(a.size_bytes)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        {canPreviewInline(a.mime_type) === 'image' && (
                          <button onClick={() => setLightbox(`/api/evaluations/attachments/${a.id}`)}
                            className="btn-ghost rounded p-1"><Eye className="h-4 w-4" /></button>
                        )}
                        <a href={`/api/evaluations/attachments/${a.id}?download=1`}
                          className="btn-ghost rounded p-1" download>
                          <Download className="h-4 w-4" />
                        </a>
                        {canEdit && (
                          <button onClick={() => handleDeleteAttachment(a.id)}
                            className="btn-ghost rounded p-1 text-red-400 hover:text-red-300">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-6 text-center text-muted-foreground text-sm">Không tìm thấy thẻ đánh giá</div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.9)' }} onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 rounded-full bg-hover-strong p-2 text-white hover:bg-white/20"
            onClick={() => setLightbox(null)}>
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Preview" className="max-w-full max-h-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* Conclude Modal */}
      {concludeModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={() => { if (!concluding) setConcludeModal(null); }}>
          <div className="w-full max-w-md rounded-3xl border border-line overflow-hidden"
            style={{ background: 'var(--card)' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
              <h3 className="text-base font-600 text-foreground">
                {concludeModal === 'pass' ? '✅ Kết luận: Đạt' : '❌ Kết luận: Không đạt'}
              </h3>
              <button onClick={() => setConcludeModal(null)} className="btn-ghost rounded-lg p-1.5">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {concludeModal === 'pass' && (
                <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-sm text-emerald-400">
                  Nhân viên sẽ được chuyển thành chính thức và hệ thống sẽ tạo hợp đồng chính thức ở trạng thái nháp. C&B cần điền đầy đủ và gửi ký.
                </div>
              )}

              {/* FAIL → chọn 1 trong 2 hành động */}
              {concludeModal === 'fail' && (
                <div className="space-y-3">
                  <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Chọn hành động</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setFailAction('extend')}
                      className={`rounded-xl border p-3 text-left transition ${
                        failAction === 'extend'
                          ? 'border-violet-500 bg-violet-500/10'
                          : 'border-line hover:bg-hover'
                      }`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Clock className={`h-4 w-4 ${failAction === 'extend' ? 'text-violet-400' : 'text-muted-foreground'}`} />
                        <span className={`text-sm font-600 ${failAction === 'extend' ? 'text-violet-400' : 'text-foreground'}`}>Kéo dài thử việc</span>
                      </div>
                      <p className="text-2xs text-muted-foreground">Gia hạn thêm thời gian, tạo thẻ đánh giá mới</p>
                    </button>
                    <button type="button" onClick={() => setFailAction('terminate')}
                      className={`rounded-xl border p-3 text-left transition ${
                        failAction === 'terminate'
                          ? 'border-red-500 bg-red-500/10'
                          : 'border-line hover:bg-hover'
                      }`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <XCircle className={`h-4 w-4 ${failAction === 'terminate' ? 'text-red-400' : 'text-muted-foreground'}`} />
                        <span className={`text-sm font-600 ${failAction === 'terminate' ? 'text-red-400' : 'text-foreground'}`}>Chấm dứt thử việc</span>
                      </div>
                      <p className="text-2xs text-muted-foreground">Tạo hồ sơ thôi việc, chạy flow ký</p>
                    </button>
                  </div>

                  {failAction === 'extend' && (
                    <div className="space-y-2 rounded-xl bg-violet-500/10 border border-violet-500/20 p-3">
                      <label className="text-xs font-600 text-violet-300 uppercase tracking-wider">Kéo dài thêm</label>
                      <select value={extendDays} onChange={(e) => setExtendDays(Number(e.target.value))}
                        className="w-full rounded-xl border border-line px-3 py-2 text-sm text-foreground outline-none focus:border-violet-500"
                        style={{ background: 'var(--input)' }}>
                        <option value={15}>15 ngày</option>
                        <option value={30}>30 ngày (1 tháng)</option>
                        <option value={45}>45 ngày</option>
                        <option value={60}>60 ngày (2 tháng)</option>
                        <option value={90}>90 ngày (3 tháng)</option>
                      </select>
                      <p className="text-2xs text-violet-300/80">
                        Hệ thống sẽ đẩy ngày kết thúc thử việc ra thêm {extendDays} ngày và tạo thẻ đánh giá mới (giữ nguyên người theo dõi).
                      </p>
                    </div>
                  )}

                  {failAction === 'terminate' && (
                    <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
                      Hệ thống tạo "Hồ sơ thôi việc" (nháp) trong mục Hợp đồng. C&B điền lý do/ngày → gửi ký → khi hoàn tất, nhân viên chuyển sang nghỉ việc.
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Ghi chú (tuỳ chọn)</label>
                <textarea value={concludeNote} onChange={(e) => setConcludeNote(e.target.value)}
                  rows={3} placeholder="Nhập nhận xét, lý do…"
                  className="w-full rounded-xl border border-line px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500 resize-none"
                  style={{ background: 'var(--input)' }} />
              </div>
              {concludeError && <p className="text-xs text-red-400">{concludeError}</p>}
            </div>
            <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
              <button onClick={() => setConcludeModal(null)} disabled={concluding}
                className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
              <button onClick={handleConclude} disabled={concluding}
                className={`rounded-xl px-4 py-2 text-sm font-600 text-white flex items-center gap-2 disabled:opacity-50 ${
                  concludeModal === 'pass'
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : failAction === 'extend'
                      ? 'bg-violet-600 hover:bg-violet-500'
                      : 'bg-red-600 hover:bg-red-500'
                }`}>
                {concluding && <Loader2 className="h-4 w-4 animate-spin" />}
                {concludeModal === 'pass'
                  ? 'Xác nhận: Đạt'
                  : failAction === 'extend'
                    ? `Kéo dài ${extendDays} ngày`
                    : 'Tạo hồ sơ thôi việc'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
