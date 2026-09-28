'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import MoneyInput from '@/components/ui/MoneyInput';
import {
  X, Loader2, Trash2, Download, Eye, Mail, Phone, MapPin, GraduationCap, Wallet,
  Briefcase, Link2, MessageSquarePlus, History, Plus, Save, FileText, ChevronLeft, ChevronRight,
} from 'lucide-react';
import {
  CvItem, CvApplication, CvNote, CvStageEvent, CvPositionHistoryEvent, getCvDetail, updateCv, deleteCv,
  addCvNote, deleteCvNote, linkRequisition, unlinkRequisition, listRequisitionOptions,
  downloadAuthed, fmtDateTime,
} from '@/lib/api/onboardingApi';
import { FilePreviewContent } from '@/app/nhan-su/components/FilePreviewModal';
import { CV_SOURCES, DEFAULT_INDUSTRIES, STAGES, STAGE_MAP, avatarFor, normalizeCvSource, StarRating, SkillChip, fmtSalary } from './candidateShared';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import RequesterCandidateDrawer from '@/app/yeu-cau-tuyen-dung/components/RequesterCandidateDrawer';
import CandidateCriteriaFields from './CandidateCriteriaFields';
import CandidateEducationField from './CandidateEducationField';
import CandidateCvInsights from './CandidateCvInsights';
import { formatCvUploadTime, inferCvEducationDegree } from '@/lib/cvFilters';

const inputCls = 'candidate-drawer-field w-full h-10 px-3 rounded-xl text-sm text-foreground border focus:outline-none';
const labelCls = 'text-2xs font-600 text-muted-foreground uppercase tracking-wider';
const CV_REALTIME_ENTITIES = ['hr_cv_pool'];
const shouldUseRecruitmentRealtime = process.env.NEXT_PUBLIC_RECRUITMENT_FOCUS !== 'true';

export default function CandidateDrawer({
  cv, candidates, canEdit, onClose, onNavigate, onUpdated, onDeleted,
}: {
  cv: CvItem; candidates: CvItem[]; canEdit: boolean;
  onClose: () => void; onNavigate: (cv: CvItem) => void; onUpdated: (cv: CvItem) => void; onDeleted: (id: string) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [applications, setApplications] = useState<CvApplication[]>([]);
  const [notes, setNotes] = useState<CvNote[]>([]);
  const [history, setHistory] = useState<CvStageEvent[]>([]);
  const [positionHistory, setPositionHistory] = useState<CvPositionHistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openApplication, setOpenApplication] = useState<CvApplication | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  useEscapeKey(onClose, !openApplication);
  const currentIndex = candidates.findIndex((item) => item.id === cv.id);
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < candidates.length - 1;
  const refreshRealtimeDetail = useCallback(async () => {
    const detail = await getCvDetail(cv.id);
    setApplications(detail.applications); setNotes(detail.notes); setHistory(detail.history);
    setPositionHistory(detail.positionHistory || []); setEdit(toForm(detail.cv)); onUpdated(detail.cv);
  }, [cv.id, onUpdated]);
  const handleRealtimeUpdate = useCallback((event: { entity: string; entityId: string }) => {
    if (event.entity === 'hr_cv_pool' && event.entityId === cv.id) {
      refreshRealtimeDetail().catch((error) => console.error('Không thể làm mới hồ sơ realtime:', error));
    }
  }, [cv.id, refreshRealtimeDetail]);
  const { isConnected: isRealtimeConnected } = useRealtimeData(CV_REALTIME_ENTITIES, {
    enabled: shouldUseRecruitmentRealtime,
    onUpdate: handleRealtimeUpdate,
  });

  // form chỉnh sửa trường cấu trúc
  const [edit, setEdit] = useState(() => toForm(cv));
  const setF = (k: keyof ReturnType<typeof toForm>) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setEdit((p) => ({ ...p, [k]: e.target.value, ...(k === 'education_level' && !p.education_degree && inferCvEducationDegree(e.target.value) ? { education_degree: inferCvEducationDegree(e.target.value)! } : {}) }));

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector<HTMLButtonElement>('[aria-label="Đóng hồ sơ ứng viên"]')?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);

  useEffect(() => {
    let active = true;
    setOpenApplication(null);
    setEdit(toForm(cv));
    (async () => {
      setLoading(true);
      try {
        const d = await getCvDetail(cv.id);
        if (!active) return;
        setApplications(d.applications); setNotes(d.notes); setHistory(d.history);
        setPositionHistory(d.positionHistory || []);
        setEdit(toForm(d.cv));
        onUpdated(d.cv);
      } catch (e) { if (active) console.error(e); } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cv.id]);

  const patch = async (body: any) => {
    const u = await updateCv(cv.id, body);
    onUpdated(u);
    return u;
  };
  const changeStatus = async (status: string) => {
    try { await patch({ status }); const d = await getCvDetail(cv.id); setHistory(d.history); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Lỗi'); }
  };
  const changeRating = async (rating: number | null) => {
    try { await patch({ rating }); } catch (e) { toast.error(e instanceof Error ? e.message : 'Lỗi'); }
  };
  const saveInfo = async () => {
    setSaving(true);
    try {
      await patch({
        candidate_name: edit.candidate_name.trim() || cv.candidate_name,
        candidate_email: edit.candidate_email || null,
        candidate_phone: edit.candidate_phone || null,
        position_applied: edit.position_applied || null,
        industry: edit.industry || null,
        current_title: edit.current_title || null,
        source: edit.source || null,
        location: edit.location || null,
        education_level: edit.education_level || null,
        education_degree: edit.education_degree || null,
        expected_salary: edit.expected_salary ? Number(edit.expected_salary) : null,
        years_experience: edit.years_experience ? Number(edit.years_experience) : null,
        skills: splitList(edit.skills),
        languages: splitList(edit.languages),
        tags: splitList(edit.tags),
        note: edit.note || null,
        employment_type: edit.employment_type || null, gender: edit.gender || null,
        date_of_birth: edit.date_of_birth || null, job_search_status: edit.job_search_status || null,
      });
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Lỗi'); } finally { setSaving(false); }
  };
  const remove = async () => {
    if (!await confirm({ title: 'Xóa ứng viên?', message: 'Xóa ứng viên này khỏi kho?', confirmLabel: 'Xóa', danger: true })) return;
    try { await deleteCv(cv.id); onDeleted(cv.id); } catch (e) { toast.error(e instanceof Error ? e.message : 'Lỗi'); }
  };

  return (
    <div className="candidate-detail-overlay" onClick={onClose}>
      <div ref={dialog} className={`candidate-detail-shell ${cv.file_name ? 'candidate-detail-with-cv' : ''}`}
        role="dialog" aria-modal="true" aria-labelledby="candidate-detail-name" onClick={(e) => e.stopPropagation()}
        onKeyDown={event => {
          if (event.key !== 'Tab' || openApplication) return;
          const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, select, iframe, [tabindex="0"]')).filter(element => element.getClientRects().length);
          const first = elements[0], last = elements[elements.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}>

        {/* Header */}
        <div className="candidate-detail-header flex items-start gap-3 border-b border-line px-5 py-4" style={{ background: 'var(--card)' }}>
          <div className="h-12 w-12 rounded-full flex items-center justify-center text-base font-700 text-white shrink-0" style={{ background: avatarFor(cv.candidate_name) }}>
            {cv.candidate_name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 id="candidate-detail-name" className="text-base font-700 text-foreground truncate">{cv.candidate_name}</h2>
            <p className="text-xs text-muted-foreground truncate">{cv.current_title || cv.position_applied || 'Ứng viên'}</p>
            <p className={`mt-0.5 text-2xs ${isRealtimeConnected ? 'text-emerald-400' : 'text-muted-foreground'}`}>{!shouldUseRecruitmentRealtime ? 'Thông tin hồ sơ đã lưu' : isRealtimeConnected ? 'Đang cập nhật thời gian thực' : 'Đang kết nối cập nhật'}</p>
            <div className="mt-1.5"><StarRating value={cv.rating} onChange={canEdit ? changeRating : undefined} /></div>
          </div>
          <div className="flex items-center gap-1.5">
            {candidates.length > 1 && (
              <div className="mr-1 flex items-center gap-1" aria-label="Chuyển hồ sơ">
                <button onClick={() => hasPrevious && onNavigate(candidates[currentIndex - 1])} disabled={!hasPrevious}
                  className="btn-ghost rounded-lg p-1.5 disabled:cursor-not-allowed disabled:opacity-35" title="Hồ sơ trước" aria-label="Hồ sơ trước">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-9 text-center text-2xs text-muted-foreground">{currentIndex + 1}/{candidates.length}</span>
                <button onClick={() => hasNext && onNavigate(candidates[currentIndex + 1])} disabled={!hasNext}
                  className="btn-ghost rounded-lg p-1.5 disabled:cursor-not-allowed disabled:opacity-35" title="Hồ sơ tiếp theo" aria-label="Hồ sơ tiếp theo">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
            {canEdit && <button onClick={remove} className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-red-400" title="Xóa"><Trash2 className="h-4 w-4" /></button>}
            <button onClick={onClose} aria-label="Đóng hồ sơ ứng viên" className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="candidate-detail-body">
          {cv.file_name && <section className="candidate-detail-cv" aria-label="CV ứng viên" data-cv-preview-id={cv.id}>
            <header className="candidate-detail-cv-heading">
              <FileText className="h-5 w-5 shrink-0" />
              <div className="min-w-0 flex-1"><h3>CV ứng viên</h3><p title={cv.file_name}>{cv.file_name}</p></div>
              <button type="button" aria-label="Tải CV về máy" title="Tải CV về máy" onClick={() => downloadAuthed(`/api/hr/cv/${cv.id}`, cv.file_name!).catch((e) => toast.error(e.message))}>
                <Download className="h-4 w-4" /><span>Tải CV</span>
              </button>
            </header>
            <CandidateCvInsights key={cv.id} cvId={cv.id} />
            <div className="candidate-detail-cv-content"><FilePreviewContent key={`${cv.id}:${cv.file_name}:${cv.mime_type}`}
              apiUrl={`/api/hr/cv/${cv.id}`} mimeType={cv.mime_type || null} fileName={cv.file_name}
              onDownload={() => downloadAuthed(`/api/hr/cv/${cv.id}`, cv.file_name!).catch((e) => toast.error(e.message))} /></div>
          </section>}
        <div className="candidate-detail-info px-5 py-4 space-y-5">
          {/* Giai đoạn pipeline */}
          <div>
            <label className={labelCls}>Giai đoạn</label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {STAGES.map((s) => (
                <button key={s.key} disabled={!canEdit} onClick={() => changeStatus(s.key)}
                  className={`rounded-full border px-2.5 py-1 text-2xs font-600 transition-colors flex items-center gap-1.5 ${
                    cv.status === s.key ? s.color : 'border-line text-muted-foreground hover:bg-hover'} ${!canEdit ? 'cursor-default' : ''}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} /> {s.label}
                </button>
              ))}
            </div>
          </div>

          {!cv.file_name && <p className="text-sm text-muted-foreground rounded-xl border border-line p-3">Hồ sơ này chưa có tệp CV đính kèm.</p>}

          {/* Thông tin cấu trúc — chỉnh sửa */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-700 text-foreground">Thông tin ứng viên</h3>
              {cv.has_content && <span className="text-2xs text-emerald-300/80 inline-flex items-center gap-1"><FileText className="h-3 w-3" /> Đã trích xuất CV</span>}
            </div>

            {!canEdit ? (
              <>
              <p className="text-xs text-muted-foreground" data-cv-uploaded-at={cv.uploaded_at || cv.created_at}>Tải CV lên: {formatCvUploadTime(cv.uploaded_at || cv.created_at)}</p>
              <ReadOnlyInfo cv={cv} />
              </>
            ) : (
              <div className="space-y-2.5">
                <p className="text-xs text-muted-foreground" data-cv-uploaded-at={cv.uploaded_at || cv.created_at}>Tải CV lên: {formatCvUploadTime(cv.uploaded_at || cv.created_at)}</p>
                <CandidateEducationField value={edit.education_degree} fieldClass={inputCls} onChange={value => setEdit(current => ({ ...current, education_degree: value }))} />
                <input className={inputCls} placeholder="Họ tên" value={edit.candidate_name} onChange={setF('candidate_name')} />
                <CandidateCriteriaFields values={edit} fieldClass={inputCls} onChange={(key, value) => setEdit(current => ({ ...current, [key]: value }))} />
                <div className="grid grid-cols-2 gap-2.5">
                  <input className={inputCls} placeholder="Email" value={edit.candidate_email} onChange={setF('candidate_email')} />
                  <input className={inputCls} placeholder="SĐT" value={edit.candidate_phone} onChange={setF('candidate_phone')} />
                </div>
                <div>
                  <label className={labelCls}>Thư mục ngành nghề</label>
                  <input className={`${inputCls} mt-1`} list="cv-drawer-industry-options" placeholder="Ví dụ: Công nghệ thông tin" value={edit.industry} onChange={setF('industry')} />
                  <datalist id="cv-drawer-industry-options">{DEFAULT_INDUSTRIES.map((item) => <option key={item} value={item} />)}</datalist>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <input className={inputCls} placeholder="Vị trí ứng tuyển" value={edit.position_applied} onChange={setF('position_applied')} />
                  <input className={inputCls} placeholder="Chức danh hiện tại" value={edit.current_title} onChange={setF('current_title')} />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="relative">
                    <input className={`${inputCls} pr-12`} type="number" step="0.5" placeholder="Số năm KN" value={edit.years_experience} onChange={setF('years_experience')} />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-600 text-muted-foreground">Năm</span>
                  </div>
                  <select aria-label="Nguồn CV" className={inputCls} value={edit.source} onChange={event => setEdit(current => ({ ...current, source: event.target.value }))}>
                    {CV_SOURCES.map(source => <option key={source} value={source}>{source}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Kỹ năng (phân cách phẩy)</label>
                  <input className={`${inputCls} mt-1`} value={edit.skills} onChange={setF('skills')} placeholder="Excel, SQL..." />
                  {splitList(edit.skills).length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">{splitList(edit.skills).map((s) => <SkillChip key={s} label={s} highlight />)}</div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <input className={inputCls} placeholder="Ngoại ngữ" value={edit.languages} onChange={setF('languages')} />
                  <input className={inputCls} placeholder="Khu vực" value={edit.location} onChange={setF('location')} />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <input className={inputCls} placeholder="Học vấn / Trường học" value={edit.education_level} onChange={setF('education_level')} />
                  <MoneyInput className={inputCls} placeholder="Lương mong muốn" value={edit.expected_salary} onValueChange={(n) => setEdit((p) => ({ ...p, expected_salary: n ? String(n) : '' }))} />
                </div>
                <input className={inputCls} placeholder="Tags" value={edit.tags} onChange={setF('tags')} />
                <textarea className="candidate-drawer-field w-full px-3 py-2 rounded-xl text-sm text-foreground border focus:outline-none resize-none" rows={2} placeholder="Ghi chú" value={edit.note} onChange={setF('note')} />
                <button onClick={saveInfo} disabled={saving} className="btn-indigo rounded-xl px-4 py-2 text-sm font-600 flex items-center gap-2 disabled:opacity-50">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu thông tin
                </button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <ApplicationsSection cvId={cv.id} canEdit={canEdit} applications={applications} setApplications={setApplications} onOpen={setOpenApplication} />
              <NotesSection cvId={cv.id} canEdit={canEdit} notes={notes} setNotes={setNotes} />
              <PositionHistorySection cv={cv} history={positionHistory} />
              <HistorySection history={history} />
            </>
          )}
        </div>
        </div>
      </div>
      {openApplication && (
        <RequesterCandidateDrawer
          reqId={openApplication.requisition_id}
          appId={openApplication.id}
          onClose={() => setOpenApplication(null)}
          onChanged={() => refreshRealtimeDetail().catch((error) => console.error('Không thể làm mới hồ sơ:', error))}
        />
      )}
    </div>
  );
}

function ReadOnlyInfo({ cv }: { cv: CvItem }) {
  const rows: [React.ReactNode, React.ReactNode][] = [
    [<Mail className="h-3.5 w-3.5" />, cv.candidate_email],
    [<Phone className="h-3.5 w-3.5" />, cv.candidate_phone],
    [<Briefcase className="h-3.5 w-3.5" />, cv.position_applied],
    [<Briefcase className="h-3.5 w-3.5" />, cv.industry],
    [<MapPin className="h-3.5 w-3.5" />, cv.location],
    [<GraduationCap className="h-3.5 w-3.5" />, cv.education_level],
    [<GraduationCap className="h-3.5 w-3.5" />, cv.education_degree ? `Bằng cấp: ${cv.education_degree}` : null],
    [<Wallet className="h-3.5 w-3.5" />, cv.expected_salary ? fmtSalary(cv.expected_salary) : null],
  ];
  return (
    <div className="space-y-1.5">
      {cv.years_experience != null && <p className="text-xs text-muted-foreground">Kinh nghiệm: <b className="text-foreground">{cv.years_experience} năm</b></p>}
      {rows.filter(([, v]) => v).map(([icon, v], i) => (
        <p key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">{icon} {v}</p>
      ))}
      {cv.skills.length > 0 && <div className="flex flex-wrap gap-1 pt-1">{cv.skills.map((s) => <SkillChip key={s} label={s} highlight />)}</div>}
      {cv.languages.length > 0 && <div className="flex flex-wrap gap-1">{cv.languages.map((s) => <SkillChip key={s} label={s} />)}</div>}
      {cv.note && <p className="text-xs text-muted-foreground bg-hover rounded-lg px-2.5 py-1.5">{cv.note}</p>}
    </div>
  );
}

function ApplicationsSection({ cvId, canEdit, applications, setApplications, onOpen }: {
  cvId: string; canEdit: boolean; applications: CvApplication[]; setApplications: (a: CvApplication[]) => void; onOpen: (application: CvApplication) => void;
}) {
  const toast = useToast();
  const [opts, setOpts] = useState<{ id: string; title: string; status: string }[]>([]);
  const [picking, setPicking] = useState(false);
  const [sel, setSel] = useState('');
  const [transferNote, setTransferNote] = useState('');

  const openPicker = async () => {
    setPicking(true);
    try { setOpts(await listRequisitionOptions('')); } catch (e) { console.error(e); }
  };
  const link = async () => {
    if (!sel) return;
    try {
      const a = await linkRequisition(cvId, sel, transferNote.trim() || undefined);
      setApplications([a, ...applications.filter((x) => x.id !== a.id)]);
      setPicking(false); setSel(''); setTransferNote('');
      toast.success('Đã chuyển hồ sơ vào yêu cầu tuyển dụng');
    }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Lỗi'); }
  };
  const unlink = async (id: string) => {
    try { await unlinkRequisition(cvId, id); setApplications(applications.filter((a) => a.id !== id)); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Lỗi'); }
  };

  return (
    <div className="space-y-2 border-t border-line-subtle pt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-700 text-foreground flex items-center gap-1.5"><Link2 className="h-4 w-4 text-sky-400" /> Chuyển hồ sơ tuyển dụng</h3>
        {canEdit && !picking && <button onClick={openPicker} className="btn-ghost rounded-lg px-2 py-1 text-2xs flex items-center gap-1"><Plus className="h-3 w-3" /> Chuyển hồ sơ</button>}
      </div>
      {picking && (
        <div className="space-y-2 rounded-lg border border-line-subtle p-2.5">
          <select value={sel} onChange={(e) => setSel(e.target.value)} className={inputCls}>
            <option value="">— Chọn yêu cầu —</option>
            {opts.map((o) => <option key={o.id} value={o.id} className="bg-surface-2">{o.title} ({o.status})</option>)}
          </select>
          <textarea value={transferNote} onChange={(e) => setTransferNote(e.target.value)} rows={2} className="candidate-drawer-field w-full rounded-xl px-3 py-2 text-xs text-foreground border focus:outline-none resize-none" placeholder="Lời nhắn khi chuyển hồ sơ (tùy chọn)" />
          <div className="flex justify-end gap-2"><button onClick={link} disabled={!sel} className="btn-indigo rounded-lg px-3 py-1.5 text-sm disabled:opacity-50">Chuyển</button><button onClick={() => { setPicking(false); setTransferNote(''); }} className="btn-ghost rounded-lg px-2 text-sm">Hủy</button></div>
        </div>
      )}
      {applications.length === 0 ? (
        <p className="text-2xs text-muted-foreground/70">Chưa chuyển hồ sơ vào yêu cầu tuyển dụng nào.</p>
      ) : applications.map((a) => (
        <div key={a.id} className="flex items-center gap-2 rounded-lg border border-line-subtle bg-white/[0.02] px-3 py-2">
          <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="flex-1 text-xs text-foreground truncate">{a.requisition_title || a.requisition_id}</span>
          {a.note && <span className="max-w-32 truncate text-2xs text-muted-foreground" title={a.note}>{a.note}</span>}
          {a.requisition_status && <span className="text-2xs text-muted-foreground">{a.requisition_status}</span>}
          <button onClick={() => onOpen(a)} className="btn-ghost rounded-lg p-1.5 text-indigo-300" title="Mở hồ sơ theo vị trí"><Eye className="h-3.5 w-3.5" /></button>
          {canEdit && <button onClick={() => unlink(a.id)} className="text-muted-foreground hover:text-red-400"><X className="h-3.5 w-3.5" /></button>}
        </div>
      ))}
    </div>
  );
}

function NotesSection({ cvId, canEdit, notes, setNotes }: {
  cvId: string; canEdit: boolean; notes: CvNote[]; setNotes: (n: CvNote[]) => void;
}) {
  const toast = useToast();
  const [body, setBody] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [kind, setKind] = useState('note');
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!body.trim() && rating === null) return;
    setSaving(true);
    try { const n = await addCvNote(cvId, { kind, rating, body }); setNotes([n, ...notes]); setBody(''); setRating(null); setKind('note'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Lỗi'); } finally { setSaving(false); }
  };
  const del = async (id: string) => {
    try { await deleteCvNote(cvId, id); setNotes(notes.filter((n) => n.id !== id)); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Lỗi'); }
  };
  const KIND_LABEL: Record<string, string> = { note: 'Ghi chú', interview: 'Phỏng vấn', evaluation: 'Đánh giá' };

  return (
    <div className="space-y-2 border-t border-line-subtle pt-4">
      <h3 className="text-sm font-700 text-foreground flex items-center gap-1.5"><MessageSquarePlus className="h-4 w-4 text-purple-400" /> Ghi chú & đánh giá</h3>
      {canEdit && (
        <div className="rounded-xl border border-line bg-white/[0.02] p-2.5 space-y-2">
          <textarea className="candidate-drawer-field w-full px-2.5 py-2 rounded-xl text-sm text-foreground border focus:outline-none resize-none" rows={2} placeholder="Nhận xét, kết quả phỏng vấn..." value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="flex items-center justify-between gap-2">
            <select value={kind} onChange={(e) => setKind(e.target.value)} className="candidate-drawer-field h-9 rounded-xl px-2 text-xs text-foreground border">
              {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <StarRating value={rating} onChange={setRating} />
            <button onClick={add} disabled={saving} className="btn-indigo rounded-lg px-3 py-1.5 text-xs font-600 flex items-center gap-1 disabled:opacity-50 ml-auto">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Thêm
            </button>
          </div>
        </div>
      )}
      {notes.length === 0 ? (
        <p className="text-2xs text-muted-foreground/70">Chưa có ghi chú.</p>
      ) : notes.map((n) => (
        <div key={n.id} className="rounded-lg border border-line-subtle bg-white/[0.02] px-3 py-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xs font-600 text-indigo-300">{KIND_LABEL[n.kind] || n.kind}</span>
            {n.rating != null && <StarRating value={n.rating} size={11} />}
            <span className="text-2xs text-muted-foreground ml-auto">{n.author_name || '—'} · {fmtDateTime(n.created_at)}</span>
            {canEdit && <button onClick={() => del(n.id)} className="text-muted-foreground hover:text-red-400"><Trash2 className="h-3 w-3" /></button>}
          </div>
          {n.body && <p className="text-xs text-foreground whitespace-pre-wrap">{n.body}</p>}
        </div>
      ))}
    </div>
  );
}

/** Lịch sử quyết định theo VỊ TRÍ — ai loại/chọn hồ sơ cho vị trí nào, khi nào. */
function PositionHistorySection({ cv, history }: { cv: CvItem; history: CvPositionHistoryEvent[] }) {
  const events = [
    {
      id: `uploaded-${cv.id}`,
      kind: 'uploaded' as const,
      created_at: cv.created_at,
      actor_name: cv.uploaded_by_name || cv.uploaded_by || 'Hệ thống',
    },
    ...history.map((item) => ({
      id: item.id,
      kind: 'stage' as const,
      created_at: item.created_at,
      event: item,
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div className="space-y-2 border-t border-line-subtle pt-4">
      <h3 className="text-sm font-700 text-foreground flex items-center gap-1.5"><History className="h-4 w-4 text-sky-400" /> Lịch sử theo vị trí</h3>
      <div className="space-y-1.5">
        {events.map((item) => {
          if (item.kind === 'uploaded') {
            return (
              <div key={item.id} className="flex items-start gap-2 text-2xs text-muted-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
                <span className="flex-1">
                  <span className="text-foreground">Tải CV vào kho</span>
                  <span className="block opacity-70">{item.actor_name} · {fmtDateTime(item.created_at)}</span>
                </span>
              </div>
            );
          }

          const h = item.event;
          const from = h.from_status ? (STAGE_MAP[h.from_status]?.label || h.from_status) : 'Mới tạo';
          const to = STAGE_MAP[h.to_status]?.label || h.to_status;
          return (
            <div key={item.id} className="flex items-start gap-2 text-2xs text-muted-foreground">
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 mt-1.5 ${h.to_status === 'rejected' ? 'bg-red-400' : h.to_status === 'hired' ? 'bg-emerald-400' : 'bg-sky-400'}`} />
              <span className="flex-1">
                <span className="text-foreground">{from} → {to}</span>
                {h.requisition_title ? <span> · {h.requisition_title}</span> : null}
                <span className="block opacity-70">
                  {h.changed_by_name || 'Hệ thống'}{h.actor_role ? ` (${h.actor_role === 'requester' ? 'người yêu cầu' : 'tuyển dụng'})` : ''} · {fmtDateTime(h.created_at)}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HistorySection({ history }: { history: CvStageEvent[] }) {
  if (history.length === 0) return null;
  return (
    <div className="space-y-2 border-t border-line-subtle pt-4">
      <h3 className="text-sm font-700 text-foreground flex items-center gap-1.5"><History className="h-4 w-4 text-amber-400" /> Lịch sử giai đoạn</h3>
      <div className="space-y-1.5">
        {history.map((h) => (
          <div key={h.id} className="flex items-center gap-2 text-2xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
            <span className="text-foreground">{STAGE_MAP[h.from_status || '']?.label || h.from_status || 'Mới tạo'} → {STAGE_MAP[h.to_status]?.label || h.to_status}</span>
            <span className="ml-auto">{h.changed_by_name || ''} · {fmtDateTime(h.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── helpers ──
function toForm(cv: CvItem) {
  return {
    candidate_name: cv.candidate_name || '', candidate_email: cv.candidate_email || '',
    candidate_phone: cv.candidate_phone || '', position_applied: cv.position_applied || '', industry: cv.industry || '',
    current_title: cv.current_title || '', source: normalizeCvSource(cv.source), location: cv.location || '',
    education_level: cv.education_level || '', education_degree: cv.education_degree || inferCvEducationDegree(cv.education_level) || '', expected_salary: cv.expected_salary != null ? String(cv.expected_salary) : '',
    years_experience: cv.years_experience != null ? String(cv.years_experience) : '',
    skills: (cv.skills || []).join(', '), languages: (cv.languages || []).join(', '),
    tags: (cv.tags || []).join(', '), note: cv.note || '',
    employment_type: cv.employment_type || '', gender: cv.gender || '',
    date_of_birth: cv.date_of_birth || '', job_search_status: cv.job_search_status || '',
  };
}
const splitList = (v: string): string[] => v.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
