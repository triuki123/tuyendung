'use client';

export type ReqStatus = 'pending' | 'pending_approval' | 'open' | 'on_hold' | 'filled' | 'cancelled' | 'rejected';
export type ReqPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Requisition {
  id: string;
  title: string;
  company_id: string | null;
  department_id: string | null;
  position_id: string | null;
  jd_id: string | null;
  target_headcount: number;
  filled_count: number;
  status: ReqStatus;
  priority: ReqPriority;
  owner_id: string | null;
  open_date: string;
  target_close_date: string | null;
  filled_at: string | null;
  note: string | null;
  reject_reason?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_type?: string | null;
  budget_code?: string | null;
  cnt_sourcing?: number | null;
  cnt_screening?: number | null;
  cnt_interview?: number | null;
  cnt_offer?: number | null;
  sub_department_id?: string | null;
  company_name?: string | null;
  department_name?: string | null;
  sub_department_name?: string | null;
  owner_name?: string | null;
  requested_by?: string | null;
  requester_name?: string | null;
  created_by?: string | null;
  days_open?: number | null;
  /** Hội đồng phỏng vấn dự kiến của vị trí (users.id) + tên đã join sẵn. */
  interviewer_ids?: string[];
  interviewer_names?: string[];
  /** Người theo dõi: thêm tay trong form hoặc tự bấm nút "Theo dõi". */
  follower_ids?: string[];
  follower_names?: string[];
}

export const REQ_STATUS_LABELS: Record<ReqStatus, { label: string; color: string }> = {
  pending_approval: { label: 'Chờ phê duyệt', color: 'text-violet-400 bg-violet-500/15 border-violet-500/30' },
  pending:   { label: 'Chờ tiếp nhận', color: 'text-sky-400 bg-sky-500/15 border-sky-500/30' },
  open:      { label: 'Đang tuyển',  color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' },
  on_hold:   { label: 'Tạm dừng',    color: 'text-amber-400 bg-amber-500/15 border-amber-500/30' },
  filled:    { label: 'Hoàn thành',  color: 'text-indigo-400 bg-indigo-500/15 border-indigo-500/30' },
  cancelled: { label: 'Lưu trữ',     color: 'text-ink-muted bg-slate-500/15 border-slate-500/30' },
  rejected:  { label: 'Từ chối',     color: 'text-rose-400 bg-rose-500/15 border-rose-500/30' },
};

export const REQ_PRIORITY_LABELS: Record<ReqPriority, { label: string; color: string }> = {
  urgent: { label: 'Khẩn cấp', color: 'text-rose-400 bg-rose-500/15 border-rose-500/30' },
  high:   { label: 'Cao',      color: 'text-orange-400 bg-orange-500/15 border-orange-500/30' },
  normal: { label: 'Bình thường', color: 'text-sky-400 bg-sky-500/15 border-sky-500/30' },
  low:    { label: 'Thấp',     color: 'text-ink-muted bg-slate-500/15 border-slate-500/30' },
};

function headers(json = false): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  if (typeof window !== 'undefined') {
    try {
      const u = JSON.parse(localStorage.getItem('assetflow_auth') || '{}');
      if (u.id) h['x-current-user-id'] = u.id;
      if (u.role) h['x-current-user-role'] = u.role;
      if (u.module_permissions) h['x-user-permissions'] = JSON.stringify(u.module_permissions);
    } catch { /* noop */ }
  }
  return h;
}

async function ok(res: Response) {
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(d.error || 'Lỗi server'), { code: d.code });
  return d;
}

export async function listRequisitions(params: { status?: string; company_id?: string } = {}): Promise<Requisition[]> {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.company_id) qs.set('company_id', params.company_id);
  const res = await fetch(`/api/hr/requisitions?${qs}`, { headers: headers() });
  return (await ok(res)).data;
}

export async function createRequisition(body: Partial<Requisition>): Promise<Requisition> {
  const res = await fetch('/api/hr/requisitions', { method: 'POST', headers: headers(true), body: JSON.stringify(body) });
  return (await ok(res)).data;
}

/** Ứng viên đã được Tuyển Dụng gắn vào yêu cầu này (trạng thái theo VỊ TRÍ). */
export interface RequisitionCandidate {
  id: string;                     // cv_id
  application_id: string;         // khóa thao tác đổi trạng thái per-vị-trí
  candidate_name: string; current_title: string | null; position_applied: string | null;
  status: string;                 // trạng thái ứng tuyển cho vị trí này
  reject_reason: string | null;
  rating: number | null; years_experience: number | null; skills: string[];
  hired_elsewhere: string | null; // tên vị trí khác nếu CV đã được tuyển ở đó
}
export async function listRequisitionCandidates(reqId: string): Promise<RequisitionCandidate[]> {
  const res = await fetch(`/api/hr/requisitions/${reqId}/candidates`, { headers: headers() });
  return (await ok(res)).data;
}

/** Chi tiết 1 ứng viên trong yêu cầu (cho drawer người yêu cầu). */
export interface RequisitionCandidateDetail {
  application: {
    id: string; cv_id: string; requisition_id: string; requisition_title: string | null;
    status: string; reject_reason: string | null; reject_reason_code: string | null;
    decided_by_name: string | null; decided_at: string | null;
  };
  cv: any;
  notes: { id: string; kind: string; rating: number | null; body: string | null; author_name: string | null; created_at: string }[];
  history: {
    id: string; requisition_title: string | null; from_status: string | null; to_status: string;
    actor_role: string | null; note: string | null; changed_by_name: string | null; created_at: string;
  }[];
}
export async function getRequisitionCandidate(reqId: string, appId: string): Promise<RequisitionCandidateDetail> {
  const res = await fetch(`/api/hr/requisitions/${reqId}/candidates/${appId}`, { headers: headers() });
  return (await ok(res)).data;
}
export async function updateRequisitionCandidateStatus(
  reqId: string, appId: string, status: string,
  extra?: { note?: string; reject_reason?: string; reject_reason_code?: string },
): Promise<RequisitionCandidateDetail['application']> {
  const res = await fetch(`/api/hr/requisitions/${reqId}/candidates/${appId}`, {
    method: 'PUT', headers: headers(true), body: JSON.stringify({ status, ...extra }),
  });
  return (await ok(res)).data;
}
/** URL file CV theo yêu cầu (cho FilePreviewModal / tải về). */
export function requisitionCandidateCvUrl(reqId: string, appId: string): string {
  return `/api/hr/requisitions/${reqId}/candidates/${appId}/cv`;
}
/** Scorecard phỏng vấn của ứng viên (theo vị trí). */
export interface ScorecardCriterion { name: string; rating: number | null; comment?: string | null }
export interface Scorecard {
  id: string; round_label: string; interviewer_name: string | null;
  recommendation: string | null; overall: number | null;
  criteria: ScorecardCriterion[]; summary: string | null; created_at: string;
}
export async function listRequisitionCandidateScorecards(reqId: string, appId: string): Promise<Scorecard[]> {
  const res = await fetch(`/api/hr/requisitions/${reqId}/candidates/${appId}/scorecards`, { headers: headers() });
  return (await ok(res)).data;
}
export async function addRequisitionCandidateScorecard(
  reqId: string, appId: string,
  body: { round_label?: string; recommendation?: string | null; overall?: number | null; criteria?: ScorecardCriterion[]; summary?: string },
): Promise<Scorecard> {
  const res = await fetch(`/api/hr/requisitions/${reqId}/candidates/${appId}/scorecards`, {
    method: 'POST', headers: headers(true), body: JSON.stringify(body),
  });
  return (await ok(res)).data;
}

/** Lịch phỏng vấn của ứng viên (theo vị trí). */
export interface InterviewSchedule {
  id: string; application_id: string; round_label: string; scheduled_at: string; duration_min: number;
  mode: string; location: string | null; meeting_link: string | null;
  interviewer_ids: string[]; interviewer_names: string[]; status: string; note: string | null;
  room_booking_id: string | null; created_at: string;
}
export async function listRequisitionCandidateInterviews(reqId: string, appId: string): Promise<InterviewSchedule[]> {
  const res = await fetch(`/api/hr/requisitions/${reqId}/candidates/${appId}/interviews`, { headers: headers() });
  return (await ok(res)).data;
}
export async function addRequisitionCandidateInterview(
  reqId: string, appId: string,
  body: {
    round_label?: string; scheduled_at: string; duration_min?: number; mode?: string;
    location?: string | null; room_name?: string | null; meeting_link?: string | null;
    interviewer_ids?: string[]; note?: string; allow_room_conflict?: boolean;
  },
): Promise<InterviewSchedule> {
  const res = await fetch(`/api/hr/requisitions/${reqId}/candidates/${appId}/interviews`, {
    method: 'POST', headers: headers(true), body: JSON.stringify(body),
  });
  return (await ok(res)).data;
}
export async function updateRequisitionCandidateInterview(
  reqId: string, appId: string, interviewId: string, status: 'done' | 'cancelled',
): Promise<InterviewSchedule> {
  const res = await fetch(`/api/hr/requisitions/${reqId}/candidates/${appId}/interviews/${interviewId}`, {
    method: 'PUT', headers: headers(true), body: JSON.stringify({ status }),
  });
  return (await ok(res)).data;
}

/** Email đã gửi cho ứng viên (lịch sử). */
export interface SentEmail {
  id: string; to_email: string; subject: string; status: string; error: string | null;
  sent_by_name: string | null; template_id: string | null; created_at: string;
}
export async function listRequisitionCandidateEmails(reqId: string, appId: string): Promise<SentEmail[]> {
  const res = await fetch(`/api/hr/requisitions/${reqId}/candidates/${appId}/emails`, { headers: headers() });
  return (await ok(res)).data;
}
export async function sendRequisitionCandidateEmail(
  reqId: string, appId: string,
  body: { to?: string; cc?: string; subject: string; body_html: string; template_id?: string | null; render?: boolean; overrides?: Record<string, string> },
): Promise<SentEmail[]> {
  const res = await fetch(`/api/hr/requisitions/${reqId}/candidates/${appId}/emails`, {
    method: 'POST', headers: headers(true), body: JSON.stringify(body),
  });
  return (await ok(res)).data;
}

/** Người yêu cầu ghi đánh giá/ghi chú cho ứng viên trong yêu cầu. */
export async function addRequisitionCandidateNote(
  reqId: string, appId: string, body: { kind?: string; rating?: number | null; body?: string },
): Promise<RequisitionCandidateDetail['notes'][number]> {
  const res = await fetch(`/api/hr/requisitions/${reqId}/candidates/${appId}/notes`, {
    method: 'POST', headers: headers(true), body: JSON.stringify(body),
  });
  return (await ok(res)).data;
}

export async function updateRequisition(id: string, body: Partial<Requisition>): Promise<Requisition> {
  const res = await fetch(`/api/hr/requisitions/${id}`, { method: 'PUT', headers: headers(true), body: JSON.stringify(body) });
  return (await ok(res)).data;
}

export async function deleteRequisition(id: string): Promise<void> {
  const res = await fetch(`/api/hr/requisitions/${id}`, { method: 'DELETE', headers: headers() });
  await ok(res);
}

export interface ReqAttachment { id: string; file_name: string; mime_type: string | null; size_bytes: number | null; created_at: string }

export async function listAttachments(reqId: string): Promise<ReqAttachment[]> {
  const res = await fetch(`/api/hr/requisitions/${reqId}/attachments`, { headers: headers() });
  return (await ok(res)).data;
}
export async function uploadAttachment(reqId: string, file: File): Promise<ReqAttachment> {
  const fd = new FormData(); fd.append('file', file);
  const res = await fetch(`/api/hr/requisitions/${reqId}/attachments`, { method: 'POST', headers: headers(), body: fd });
  return (await ok(res)).data;
}
export async function deleteAttachment(reqId: string, attachId: string): Promise<void> {
  const res = await fetch(`/api/hr/requisitions/${reqId}/attachments/${attachId}`, { method: 'DELETE', headers: headers() });
  await ok(res);
}
export function attachmentDownloadUrl(reqId: string, attachId: string): string {
  return `/api/hr/requisitions/${reqId}/attachments/${attachId}`;
}

export interface JdItem { id: string; title: string; department_name: string | null; status: string }
export async function listJdsForReq(): Promise<JdItem[]> {
  const res = await fetch('/api/hr/jd?status=active', { headers: headers() });
  return (await ok(res)).data;
}

export interface Recruiter { id: string; name: string; email: string; avatar: string | null }

export async function listRecruiters(): Promise<Recruiter[]> {
  const res = await fetch('/api/hr/requisitions/recruiters', { headers: headers() });
  return (await ok(res)).data;
}

export async function acceptRequisition(id: string): Promise<Requisition> {
  const res = await fetch(`/api/hr/requisitions/${id}/accept`, { method: 'POST', headers: headers(true) });
  return (await ok(res)).data;
}

export async function rejectRequisition(id: string, reason: string): Promise<Requisition> {
  const res = await fetch(`/api/hr/requisitions/${id}/reject`, { method: 'POST', headers: headers(true), body: JSON.stringify({ reason }) });
  return (await ok(res)).data;
}

export async function approveRequisition(id: string): Promise<Requisition> {
  const res = await fetch(`/api/hr/requisitions/${id}/approve`, { method: 'POST', headers: headers(true) });
  return (await ok(res)).data;
}

export interface RequisitionComment {
  id: string;
  requisition_id: string;
  user_id: string;
  user_name: string | null;
  content: string;
  created_at: string;
}

export async function listComments(reqId: string): Promise<RequisitionComment[]> {
  const res = await fetch(`/api/hr/requisitions/${reqId}/comments`, { headers: headers() });
  return (await ok(res)).data;
}

export async function addComment(reqId: string, content: string): Promise<RequisitionComment> {
  const res = await fetch(`/api/hr/requisitions/${reqId}/comments`, { method: 'POST', headers: headers(true), body: JSON.stringify({ content }) });
  return (await ok(res)).data;
}

/** 1 sự kiện trong lịch sử xử lý của yêu cầu tuyển dụng. */
export interface RequisitionAuditEntry {
  id: string;
  action: string;
  details: string | null;
  changes: Record<string, { label: string; from: string | null; to: string | null }> | null;
  performed_by_name: string | null;
  created_at: string;
}

export async function listRequisitionHistory(reqId: string): Promise<RequisitionAuditEntry[]> {
  const res = await fetch(`/api/hr/requisitions/${reqId}/history`, { headers: headers() });
  return (await ok(res)).data;
}

export type WorkflowMilestoneStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'skipped';
export interface RequisitionWorkflowMilestone {
  id: string; step_code: string; title: string; description: string | null; owner_label: string | null;
  sla_hours: number | null; status: WorkflowMilestoneStatus; due_at: string | null; completed_at: string | null; note: string | null;
}
export async function listRequisitionWorkflow(reqId: string): Promise<RequisitionWorkflowMilestone[]> {
  const res = await fetch(`/api/hr/requisitions/${reqId}/workflow`, { headers: headers() });
  return (await ok(res)).data;
}
export async function updateRequisitionWorkflowMilestone(reqId: string, milestoneId: string, body: { status: WorkflowMilestoneStatus; note?: string }): Promise<RequisitionWorkflowMilestone> {
  const res = await fetch(`/api/hr/requisitions/${reqId}/workflow/${milestoneId}`, { method: 'PATCH', headers: headers(true), body: JSON.stringify(body) });
  return (await ok(res)).data;
}

/** Bật/tắt theo dõi cho chính người đang đăng nhập. */
export async function toggleFollowRequisition(reqId: string): Promise<{ requisition: Requisition; following: boolean }> {
  const res = await fetch(`/api/hr/requisitions/${reqId}/follow`, { method: 'POST', headers: headers(true) });
  const d = await ok(res);
  return { requisition: d.data, following: d.following };
}

export async function cloneRequisition(source: Requisition): Promise<Requisition> {
  const body: Partial<Requisition> = {
    title: source.title,
    company_id: source.company_id,
    department_id: source.department_id,
    position_id: source.position_id,
    jd_id: source.jd_id,
    target_headcount: source.target_headcount,
    priority: source.priority,
    note: source.note,
    salary_min: source.salary_min,
    salary_max: source.salary_max,
    salary_type: source.salary_type,
    budget_code: source.budget_code,
    // Panel phỏng vấn giữ nguyên khi nhân bản; người theo dõi thì không (mỗi yêu cầu tự theo dõi lại).
    interviewer_ids: source.interviewer_ids || [],
    status: 'pending',
    filled_count: 0,
    cnt_sourcing: 0,
    cnt_screening: 0,
    cnt_interview: 0,
    cnt_offer: 0,
    open_date: new Date().toISOString().slice(0, 10),
    target_close_date: null,
  };
  return createRequisition(body);
}

/**
 * Tính số ngày còn lại đến hạn đóng tuyển dụng.
 * Trả về null nếu không có ngày, dương = còn X ngày, âm = quá hạn X ngày.
 */
export function calcDaysUntilClose(targetCloseDate: string | null): number | null {
  if (!targetCloseDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const close = new Date(targetCloseDate);
  close.setHours(0, 0, 0, 0);
  return Math.round((close.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
