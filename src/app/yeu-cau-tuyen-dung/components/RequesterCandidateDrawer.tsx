'use client';

import React, { useEffect, useState } from 'react';
import {
  X, Loader2, Eye, Download, FileText, Mail, Phone, MapPin, GraduationCap, Wallet,
  Briefcase, History, MessageSquare, CheckCircle2, XCircle, Star, ChevronLeft, ChevronRight,
} from 'lucide-react';
import {
  getRequisitionCandidate, updateRequisitionCandidateStatus, requisitionCandidateCvUrl,
  addRequisitionCandidateNote, listRequisitionCandidateEmails, listRequisitionCandidates,
  type RequisitionCandidate, type RequisitionCandidateDetail, type SentEmail,
} from '@/lib/api/requisitionApi';
import EmailComposer from './EmailComposer';
import { downloadAuthed, fmtDateTime } from '@/lib/api/onboardingApi';
import { STAGE_MAP, avatarFor, StarRating, SkillChip, fmtSalary, REJECT_REASONS, REJECT_REASON_MAP } from '@/app/nguon-nhan-luc/kho-ung-vien/components/candidateShared';
import FilePreviewModal, { FilePreviewContent } from '@/app/nhan-su/components/FilePreviewModal';
import ScorecardSection from './ScorecardSection';
import InterviewSection from './InterviewSection';
import { useToast } from '@/context/ToastContext';
import { useEscapeKey } from '@/hooks/useEscapeKey';

const labelCls = 'text-2xs font-600 text-muted-foreground uppercase tracking-wider';

/** Các quyết định người yêu cầu có thể đặt cho ứng viên TẠI VỊ TRÍ này. */
const DECISIONS: { key: string; label: string; icon: React.ElementType; cls: string }[] = [
  { key: 'screening',   label: 'Sàng lọc',        icon: FileText,     cls: 'border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10' },
  { key: 'interviewed', label: 'Chọn phỏng vấn',  icon: CheckCircle2, cls: 'border-purple-500/30 text-purple-300 hover:bg-purple-500/10' },
  { key: 'offered',     label: 'Offer',           icon: Star,         cls: 'border-amber-500/30 text-amber-300 hover:bg-amber-500/10' },
  { key: 'hired',       label: 'Đã Onboard',      icon: CheckCircle2, cls: 'border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10' },
  { key: 'rejected',    label: 'Loại vị trí này', icon: XCircle,      cls: 'border-red-500/30 text-red-300 hover:bg-red-500/10' },
];

export default function RequesterCandidateDrawer({
  reqId, appId: initialAppId, onClose, onChanged,
}: {
  reqId: string; appId: string; onClose: () => void; onChanged?: () => void;
}) {
  const toast = useToast();
  useEscapeKey(onClose);
  const [appId, setAppId] = useState(initialAppId);
  const [candidateOrder, setCandidateOrder] = useState<RequisitionCandidate[]>([]);
  const [data, setData] = useState<RequisitionCandidateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  // Ghi đánh giá / ghi chú
  const [noteBody, setNoteBody] = useState('');
  const [noteRating, setNoteRating] = useState<number | null>(null);
  const [noteKind, setNoteKind] = useState('evaluation');
  const [savingNote, setSavingNote] = useState(false);
  // Loại ứng viên — chọn lý do chuẩn
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectCode, setRejectCode] = useState('');
  const [rejectNote, setRejectNote] = useState('');
  // Email
  const [emailOpen, setEmailOpen] = useState(false);
  const [sentEmails, setSentEmails] = useState<SentEmail[]>([]);
  useEffect(() => { setAppId(initialAppId); }, [initialAppId]);
  useEffect(() => {
    listRequisitionCandidates(reqId).then(setCandidateOrder).catch(() => setCandidateOrder([]));
  }, [reqId]);
  const loadEmails = () => { listRequisitionCandidateEmails(reqId, appId).then(setSentEmails).catch(() => {}); };
  useEffect(() => { loadEmails(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [reqId, appId]);

  const load = async () => {
    setLoading(true);
    try { setData(await getRequisitionCandidate(reqId, appId)); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Không tải được ứng viên'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [reqId, appId]);

  const cv = data?.cv;
  const app = data?.application;
  const curStage = app ? STAGE_MAP[app.status] : null;
  const currentIndex = candidateOrder.findIndex((candidate) => candidate.application_id === appId);
  const previousCandidate = currentIndex > 0 ? candidateOrder[currentIndex - 1] : null;
  const nextCandidate = currentIndex >= 0 && currentIndex < candidateOrder.length - 1 ? candidateOrder[currentIndex + 1] : null;

  const navigateCandidate = (candidate: RequisitionCandidate | null) => {
    if (!candidate) return;
    setPreview(false);
    setEmailOpen(false);
    setRejectOpen(false);
    setNoteBody('');
    setNoteRating(null);
    setAppId(candidate.application_id);
  };

  async function decide(status: string) {
    if (!app) return;
    if (status === 'rejected') { setRejectOpen(true); return; } // mở form chọn lý do chuẩn
    setSaving(true);
    try {
      await updateRequisitionCandidateStatus(reqId, appId, status);
      await load();
      onChanged?.();
      toast.success('Đã cập nhật trạng thái ứng viên');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không cập nhật được');
    } finally { setSaving(false); }
  }

  async function submitReject() {
    if (!rejectCode) { toast.error('Chọn lý do loại'); return; }
    setSaving(true);
    try {
      await updateRequisitionCandidateStatus(reqId, appId, 'rejected', {
        reject_reason_code: rejectCode,
        reject_reason: rejectNote.trim() || undefined,
      });
      setRejectOpen(false); setRejectCode(''); setRejectNote('');
      await load();
      onChanged?.();
      toast.success('Đã loại ứng viên cho vị trí này');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không cập nhật được');
    } finally { setSaving(false); }
  }

  async function addNote() {
    if (!noteBody.trim() && noteRating === null) return;
    setSavingNote(true);
    try {
      await addRequisitionCandidateNote(reqId, appId, { kind: noteKind, rating: noteRating, body: noteBody });
      setNoteBody(''); setNoteRating(null); setNoteKind('evaluation');
      await load();
      toast.success('Đã lưu đánh giá');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không lưu được đánh giá');
    } finally { setSavingNote(false); }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Hồ sơ ứng viên theo vị trí" className="h-full w-full max-w-[1440px] flex flex-col overflow-hidden border-l border-line shadow-2xl"
        style={{ background: 'var(--card)' }} onClick={(e) => e.stopPropagation()}>

        {loading || !cv || !app ? (
          <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-line px-5 py-4" style={{ background: 'var(--card)' }}>
              <div className="h-12 w-12 rounded-full flex items-center justify-center text-base font-700 text-white shrink-0" style={{ background: avatarFor(cv.candidate_name) }}>
                {cv.candidate_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-700 text-foreground truncate">{cv.candidate_name}</h2>
                <p className="text-xs text-muted-foreground truncate">{cv.current_title || cv.position_applied || 'Ứng viên'}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <StarRating value={cv.rating} />
                  {curStage && <span className={`rounded-full border px-2 py-0.5 text-2xs font-600 ${curStage.color}`}>{curStage.label}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => navigateCandidate(previousCandidate)} disabled={!previousCandidate}
                  className="btn-ghost h-8 w-8 flex items-center justify-center disabled:opacity-30" title="CV trước">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-10 text-center text-2xs text-muted-foreground tabular-nums">
                  {currentIndex >= 0 ? `${currentIndex + 1}/${candidateOrder.length}` : ''}
                </span>
                <button onClick={() => navigateCandidate(nextCandidate)} disabled={!nextCandidate}
                  className="btn-ghost h-8 w-8 flex items-center justify-center disabled:opacity-30" title="CV kế tiếp">
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button onClick={onClose} className="btn-ghost h-8 w-8 flex items-center justify-center ml-1" title="Đóng"><X className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1.25fr)_minmax(400px,1fr)] lg:overflow-hidden">
              <section aria-label="CV ứng viên" className="flex flex-col border-b lg:border-b-0 lg:border-r border-line bg-slate-50 min-h-[65vh] lg:min-h-0">
                <div className="flex items-center gap-2 border-b border-line px-4 py-3">
                  <FileText className="h-4 w-4 shrink-0 text-blue-500" />
                  <span className="min-w-0 flex-1 truncate text-sm font-600 text-foreground" title={cv.file_name || ''}>{cv.file_name || 'CV ứng viên'}</span>
                  {cv.file_name && <>
                    <button onClick={() => setPreview(true)} className="rounded-lg p-2 text-blue-600 hover:bg-blue-50" title="Phóng to CV" aria-label="Phóng to CV"><Eye className="h-4 w-4" /></button>
                    <button onClick={() => downloadAuthed(requisitionCandidateCvUrl(reqId, appId), cv.file_name).catch((e: any) => toast.error(e.message))} className="rounded-lg p-2 text-blue-600 hover:bg-blue-50" title="Tải CV" aria-label="Tải CV"><Download className="h-4 w-4" /></button>
                  </>}
                </div>
                <div className="flex flex-col flex-1 min-h-[55vh] lg:min-h-0 overflow-auto">
                  {cv.file_name ? <FilePreviewContent key={appId} apiUrl={requisitionCandidateCvUrl(reqId, appId)} mimeType={cv.mime_type || null} fileName={cv.file_name}
                    onDownload={() => downloadAuthed(requisitionCandidateCvUrl(reqId, appId), cv.file_name).catch((e: any) => toast.error(e.message))} />
                    : <p className="m-auto p-8 text-sm text-muted-foreground">Hồ sơ này chưa có file CV.</p>}
                </div>
              </section>
            <div className="px-5 py-5 space-y-6 lg:overflow-y-auto min-w-0">
              {/* Quyết định cho vị trí này */}
              <div>
                <label className={labelCls}>Quyết định cho vị trí “{app.requisition_title || ''}”</label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {DECISIONS.map((d) => {
                    const Icon = d.icon;
                    const active = app.status === d.key;
                    return (
                      <button key={d.key} disabled={saving || active} onClick={() => decide(d.key)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs font-600 transition-colors disabled:opacity-50 ${active ? (STAGE_MAP[d.key]?.color || '') : d.cls}`}>
                        <Icon className="h-3 w-3" /> {d.label}
                      </button>
                    );
                  })}
                </div>
                {app.status === 'rejected' && (app.reject_reason_code || app.reject_reason) && (
                  <p className="mt-2 text-2xs text-rose-300 bg-rose-500/5 border border-rose-500/20 rounded-lg px-2.5 py-1.5">
                    <b>Lý do loại:</b> {app.reject_reason_code ? (REJECT_REASON_MAP[app.reject_reason_code] || app.reject_reason_code) : ''}
                    {app.reject_reason ? ` — ${app.reject_reason}` : ''}
                  </p>
                )}
              </div>


              {/* Gửi email cho ứng viên */}
              <button onClick={() => setEmailOpen(true)}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 px-3 py-2 text-sm font-600">
                <Mail className="h-4 w-4" /> Gửi email cho ứng viên
              </button>
              {sentEmails.length > 0 && (
                <div className="space-y-1.5">
                  <label className={labelCls}>Email đã gửi ({sentEmails.length})</label>
                  {sentEmails.slice(0, 5).map((e) => (
                    <div key={e.id} className="flex items-center gap-2 rounded-lg border border-line-subtle bg-white/[0.02] px-2.5 py-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${e.status === 'sent' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-2xs text-foreground truncate">{e.subject}</p>
                        <p className="text-2xs text-muted-foreground truncate">{e.to_email} · {e.sent_by_name || ''} · {fmtDateTime(e.created_at)}{e.status === 'failed' ? ` · Lỗi: ${e.error || ''}` : ''}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Thông tin ứng viên (chỉ đọc) */}
              <div className="space-y-2">
                <h3 className="text-sm font-700 text-foreground">Thông tin ứng viên</h3>
                {cv.years_experience != null && <p className="text-xs text-muted-foreground">Kinh nghiệm: <b className="text-foreground">{cv.years_experience} năm</b></p>}
                {([
                  [<Mail className="h-3.5 w-3.5" key="m" />, cv.candidate_email],
                  [<Phone className="h-3.5 w-3.5" key="p" />, cv.candidate_phone],
                  [<Briefcase className="h-3.5 w-3.5" key="b" />, cv.position_applied],
                  [<MapPin className="h-3.5 w-3.5" key="l" />, cv.location],
                  [<GraduationCap className="h-3.5 w-3.5" key="g" />, cv.education_level],
                  [<Wallet className="h-3.5 w-3.5" key="w" />, cv.expected_salary ? fmtSalary(cv.expected_salary) : null],
                ] as [React.ReactNode, React.ReactNode][]).map(([icon, v], i) => v ? (
                  <div key={i} className="text-sm text-foreground flex items-start gap-2 rounded-xl border border-line-subtle p-3"><span className="shrink-0 mt-1 text-muted-foreground">{icon}</span><div className="min-w-0 break-words">{i === 4 ? <details><summary className="cursor-pointer font-600">Học vấn / Trường học</summary><p className="mt-2 whitespace-pre-wrap leading-6">{v}</p></details> : v}</div></div>
                ) : null)}
                {cv.skills?.length > 0 && <div className="flex flex-wrap gap-1 pt-1">{cv.skills.map((s: string) => <SkillChip key={s} label={s} highlight />)}</div>}
                {cv.note && <p className="text-xs text-muted-foreground bg-hover rounded-lg px-2.5 py-1.5">{cv.note}</p>}
              </div>

              {/* Đánh giá / ghi chú (chỉ đọc) */}
              <div className="space-y-2 border-t border-line-subtle pt-4">
                <h3 className="text-sm font-700 text-foreground flex items-center gap-1.5"><MessageSquare className="h-4 w-4 text-purple-400" /> Đánh giá & ghi chú</h3>

                {/* Ô ghi đánh giá cho người yêu cầu */}
                <div className="rounded-xl border border-line bg-white/[0.02] p-2.5 space-y-2">
                  <textarea
                    className="w-full px-2.5 py-1.5 rounded-lg text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 resize-none"
                    rows={2} placeholder="Nhận xét, đánh giá ứng viên cho vị trí này..."
                    value={noteBody} onChange={(e) => setNoteBody(e.target.value)}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <select value={noteKind} onChange={(e) => setNoteKind(e.target.value)}
                      className="h-8 rounded-lg px-2 text-xs text-foreground bg-surface-2 border border-line">
                      <option value="evaluation" className="bg-surface-2">Đánh giá</option>
                      <option value="interview" className="bg-surface-2">Phỏng vấn</option>
                      <option value="note" className="bg-surface-2">Ghi chú</option>
                    </select>
                    <StarRating value={noteRating} onChange={setNoteRating} />
                    <button onClick={addNote} disabled={savingNote || (!noteBody.trim() && noteRating === null)}
                      className="btn-indigo rounded-lg px-3 py-1.5 text-xs font-600 flex items-center gap-1 disabled:opacity-50 ml-auto">
                      {savingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />} Lưu
                    </button>
                  </div>
                </div>

                {data!.notes.length === 0 ? (
                  <p className="text-2xs text-muted-foreground/70">Chưa có đánh giá.</p>
                ) : data!.notes.map((n) => (
                  <div key={n.id} className="rounded-lg border border-line-subtle bg-white/[0.02] px-3 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-2xs font-600 text-indigo-300">{n.kind === 'interview' ? 'Phỏng vấn' : n.kind === 'evaluation' ? 'Đánh giá' : 'Ghi chú'}</span>
                      {n.rating != null && <StarRating value={n.rating} size={11} />}
                      <span className="text-2xs text-muted-foreground ml-auto">{n.author_name || '—'} · {fmtDateTime(n.created_at)}</span>
                    </div>
                    {n.body && <p className="text-xs text-foreground whitespace-pre-wrap">{n.body}</p>}
                  </div>
                ))}
              </div>

              {/* Lịch phỏng vấn */}
              <InterviewSection reqId={reqId} appId={appId} />

              {/* Scorecard phỏng vấn có cấu trúc */}
              <ScorecardSection reqId={reqId} appId={appId} />

              {/* Lịch sử theo vị trí */}
              <div className="space-y-2 border-t border-line-subtle pt-4">
                  <h3 className="text-sm font-700 text-foreground flex items-center gap-1.5"><History className="h-4 w-4 text-amber-400" /> Lịch sử theo vị trí</h3>
                  {data!.history.length === 0 ? <p className="text-2xs text-muted-foreground/70">Chưa có thay đổi theo vị trí.</p> : <div className="space-y-1.5">
                    {data!.history.map((h) => (
                      <div key={h.id} className="text-2xs text-muted-foreground flex items-start gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0 mt-1.5" />
                        <span className="flex-1">
                          <span className="text-foreground">{STAGE_MAP[h.to_status]?.label || h.to_status}</span>
                          {h.requisition_title ? <span className="text-muted-foreground"> · {h.requisition_title}</span> : null}
                          <span className="block opacity-70">{h.changed_by_name || ''}{h.actor_role ? ` (${h.actor_role === 'requester' ? 'người yêu cầu' : 'tuyển dụng'})` : ''} · {fmtDateTime(h.created_at)}</span>
                        </span>
                      </div>
                    ))}
                  </div>}
                </div>
            </div>
            </div>
          </>
        )}
      </div>

      {preview && cv?.file_name && (
        <FilePreviewModal apiUrl={requisitionCandidateCvUrl(reqId, appId)} mimeType={cv.mime_type || null} fileName={cv.file_name}
          onClose={() => setPreview(false)}
          onDownload={() => downloadAuthed(requisitionCandidateCvUrl(reqId, appId), cv.file_name).catch((e: any) => toast.error(e.message))} />
      )}

      {emailOpen && (
        <EmailComposer reqId={reqId} appId={appId} candidateEmail={cv?.candidate_email || ''}
          onClose={() => setEmailOpen(false)} onSent={() => { setEmailOpen(false); loadEmails(); }} />
      )}

      {/* Modal chọn lý do loại (chuẩn hóa để thống kê) */}
      {rejectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={() => setRejectOpen(false)}>
          <div className="w-full max-w-md rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'var(--card)' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
              <h2 className="text-base font-700 text-foreground">Loại ứng viên cho vị trí này</h2>
              <button onClick={() => setRejectOpen(false)} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-2xs text-muted-foreground">Chỉ loại tại vị trí này — hồ sơ vẫn có thể ứng tuyển vị trí/công ty khác.</p>
              <div>
                <label className={labelCls}>Lý do loại</label>
                <div className="mt-1.5 grid grid-cols-1 gap-1.5">
                  {REJECT_REASONS.map((r) => (
                    <button key={r.code} onClick={() => setRejectCode(r.code)}
                      className={`text-left rounded-lg border px-3 py-2 text-xs font-600 transition-colors ${rejectCode === r.code ? 'border-rose-500/50 bg-rose-500/10 text-rose-200' : 'border-line text-muted-foreground hover:bg-hover'}`}>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelCls}>Ghi chú (tuỳ chọn)</label>
                <textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} rows={2}
                  placeholder="Chi tiết thêm..."
                  className="mt-1.5 w-full px-3 py-2 rounded-lg text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-rose-500/50 resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
              <button onClick={() => setRejectOpen(false)} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
              <button onClick={submitReject} disabled={saving || !rejectCode}
                className="rounded-xl px-4 py-2 text-sm font-600 text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Loại
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
