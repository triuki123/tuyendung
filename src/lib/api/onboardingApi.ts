'use client';

import type { CvAdvancedFilter, CvFilterOptions } from '@/lib/cvFilters';

// Client helpers cho luồng Onboarding (Biểu Mẫu, Nguồn Nhân Lực, Duyệt Người Dùng).
// Tự đính kèm header user từ localStorage (cùng cơ chế hrApi).

export interface OnbFormField {
  id: string;
  field_key: string;
  label: string;
  field_type: string;
  section: string;
  required: boolean;
  enabled: boolean;
  sort_order: number;
  help_text: string | null;
  options: string[] | null;
  is_system: boolean;
}

export interface OnbSubmission {
  id: string;
  token: string;
  candidate_name: string;
  candidate_email: string;
  status: 'pending' | 'submitted' | 'confirmed' | 'sent_to_admin' | 'approved' | 'rejected';
  data: Record<string, any>;
  invited_by: string | null;
  invited_at: string;
  email_sent: boolean;
  email_error: string | null;
  submitted_at: string | null;
  confirmed_at: string | null;
  sent_to_admin_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  reject_reason: string | null;
  user_id: string | null;
  expires_at: string;
  created_at: string;
  attachments?: { id: string; file_name: string; mime_type: string | null; size_bytes: number | null; created_at: string }[];
  form_link?: string;
}

export interface CvItem {
  id: string;
  candidate_name: string;
  candidate_email: string | null;
  candidate_phone: string | null;
  position_applied: string | null;
  industry: string | null;
  source: string | null;
  status: string;
  note: string | null;
  file_name: string | null;
  mime_type?: string | null;
  size_bytes: number | null;
  uploaded_by?: string | null;
  uploaded_by_name?: string | null;
  created_at: string;
  updated_at?: string;
  uploaded_at?: string;
  // Trường có cấu trúc (ATS)
  skills: string[];
  years_experience: number | null;
  current_title: string | null;
  education_level: string | null;
  education_degree?: string | null;
  expected_salary: number | null;
  location: string | null;
  languages: string[];
  rating: number | null;
  tags: string[];
  has_content: boolean;
  employment_type?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  job_search_status?: string | null;
  last_activity_at?: string;
  is_viewed?: boolean;
}

export interface CvSearchFilter extends CvAdvancedFilter {
  keyword?: string;
  status?: string;
  skills?: string[];
  anySkills?: string[];
  minExperience?: number;
  maxExperience?: number;
  source?: string;
  minRating?: number;
  position?: string;
  industry?: string;
  requisitionId?: string;
  limit?: number;
}

export interface JdItem {
  id: string;
  title: string;
  department_name: string | null;
  description: string | null;
  status: string;
  file_name: string | null;
  size_bytes: number | null;
  created_at: string;
}

export const ONB_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:       { label: 'Chờ điền',       color: 'text-ink-muted bg-slate-500/15 border-slate-500/30' },
  submitted:     { label: 'Đã nộp',         color: 'text-sky-400 bg-sky-500/15 border-sky-500/30' },
  confirmed:     { label: 'Đã xác nhận',    color: 'text-indigo-400 bg-indigo-500/15 border-indigo-500/30' },
  sent_to_admin: { label: 'Chờ QTV duyệt',  color: 'text-amber-400 bg-amber-500/15 border-amber-500/30' },
  approved:      { label: 'Đã duyệt',       color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' },
  rejected:      { label: 'Từ chối',        color: 'text-red-400 bg-red-500/15 border-red-500/30' },
};

export function authHeaders(json = false): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('assetflow_auth');
    if (stored) {
      try {
        const u = JSON.parse(stored);
        if (u.id) h['x-current-user-id'] = u.id;
        if (u.role) h['x-current-user-role'] = u.role;
        if (u.module_permissions) h['x-user-permissions'] = JSON.stringify(u.module_permissions);
      } catch { /* noop */ }
    }
  }
  return h;
}

async function jsonOrThrow(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Lỗi server');
  return data;
}

// ── Form fields (Biểu Mẫu) ───────────────────────────────────────────────────
export async function listOnbFields(): Promise<OnbFormField[]> {
  const res = await fetch('/api/hr/onboarding/fields', { headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}
export async function updateOnbFields(updates: Partial<OnbFormField>[] & { id: string }[]): Promise<OnbFormField[]> {
  const res = await fetch('/api/hr/onboarding/fields', {
    method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ updates }),
  });
  return (await jsonOrThrow(res)).data;
}

// ── Loại giấy tờ đính kèm (hr_document_types) cho biểu mẫu onboarding ─────────
export interface OnbDocType {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  onboarding_visible: boolean;
  onboarding_required: boolean;
  onboarding_multiple: boolean;
  sort_order: number;
}
export async function listDocTypes(): Promise<OnbDocType[]> {
  const res = await fetch('/api/hr-document-types?all=1', { headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}
export async function createDocType(body: { name: string; onboarding_visible?: boolean; onboarding_required?: boolean; onboarding_multiple?: boolean }): Promise<OnbDocType> {
  const res = await fetch('/api/hr-document-types', { method: 'POST', headers: authHeaders(true), body: JSON.stringify(body) });
  return (await jsonOrThrow(res)).data;
}
export async function updateDocType(id: string, body: Partial<OnbDocType>): Promise<OnbDocType> {
  const res = await fetch(`/api/hr-document-types/${id}`, { method: 'PUT', headers: authHeaders(true), body: JSON.stringify(body) });
  return (await jsonOrThrow(res)).data;
}

// ── Submissions ──────────────────────────────────────────────────────────────
export async function listOnbSubmissions(status?: string): Promise<{ data: OnbSubmission[]; counts: Record<string, number> }> {
  const qs = status ? `?status=${status}` : '';
  const res = await fetch(`/api/hr/onboarding${qs}`, { headers: authHeaders() });
  const json = await jsonOrThrow(res);
  return { data: json.data, counts: json.counts || {} };
}
export async function getOnbSubmission(id: string): Promise<OnbSubmission> {
  const res = await fetch(`/api/hr/onboarding/${id}`, { headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}
export async function updateOnbSubmission(id: string, data: Record<string, any>, candidateName?: string): Promise<OnbSubmission> {
  const res = await fetch(`/api/hr/onboarding/${id}`, {
    method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ data, candidate_name: candidateName }),
  });
  return (await jsonOrThrow(res)).data;
}
export async function confirmOnbSubmission(id: string): Promise<OnbSubmission> {
  const res = await fetch(`/api/hr/onboarding/${id}/confirm`, { method: 'POST', headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}
export async function sendOnbToAdmin(id: string): Promise<OnbSubmission> {
  const res = await fetch(`/api/hr/onboarding/${id}/send-admin`, { method: 'POST', headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}
export async function approveOnbSubmission(
  id: string,
  body: {
    working_email: string; password: string; role?: string;
    employment_type_id?: string; employment_type?: string;
    /** Quản lý trực tiếp chọn ngay lúc duyệt (tránh phải vào Chỉnh Sửa bổ sung sau). */
    manager_id?: string;
  }
): Promise<{ data: OnbSubmission; user_id: string }> {
  const res = await fetch(`/api/hr/onboarding/${id}/approve`, {
    method: 'POST', headers: authHeaders(true), body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}
export async function rejectOnbSubmission(id: string, reason: string): Promise<OnbSubmission> {
  const res = await fetch(`/api/hr/onboarding/${id}/reject`, {
    method: 'POST', headers: authHeaders(true), body: JSON.stringify({ reason }),
  });
  return (await jsonOrThrow(res)).data;
}

/**
 * Tạo NGAY các bản nháp HĐ onboarding cho 1 nhân sự đã duyệt (không chờ scheduler).
 * Idempotent ở backend: loại HĐ đã có sẽ bị bỏ qua. Trả về số tạo mới / bỏ qua.
 */
export async function generateOnboardingDrafts(employeeId: string): Promise<{ created: number; skipped: number; hires: number }> {
  const res = await fetch('/api/contracts/onboarding-drafts', {
    method: 'POST', headers: authHeaders(true), body: JSON.stringify({ employee_id: employeeId }),
  });
  return jsonOrThrow(res);
}

// ── Org data cho form chuẩn hóa (dùng API nội bộ có sẵn) ─────────────────────
export async function loadOrgData(): Promise<{
  companies: { id: string; name: string }[];
  departments: { id: string; name: string; company_id: string; parent_department_id: string | null; manager_id: string | null }[];
  subDepartments: { id: string; name: string; department_id: string; manager_id: string | null }[];
  positions: { id: string; name: string; company_id: string }[];
}> {
  const h = authHeaders();
  const [c, d, s, p] = await Promise.all([
    fetch('/api/organizations/companies', { headers: h }).then(r => r.json()).catch(() => []),
    fetch('/api/organizations/departments', { headers: h }).then(r => r.json()).catch(() => []),
    fetch('/api/organizations/sub-departments', { headers: h }).then(r => r.json()).catch(() => []),
    fetch('/api/organizations/positions', { headers: h }).then(r => r.json()).catch(() => []),
  ]);
  const arr = (x: any) => (Array.isArray(x) ? x : x?.data ?? []);
  return {
    companies: arr(c).map((x: any) => ({ id: String(x.id), name: x.name })),
    departments: arr(d).map((x: any) => ({ id: String(x.id), name: x.name, company_id: String(x.company_id), parent_department_id: x.parent_department_id ? String(x.parent_department_id) : null, manager_id: x.manager_id ? String(x.manager_id) : null })),
    subDepartments: arr(s).map((x: any) => ({ id: String(x.id), name: x.name, department_id: String(x.department_id), manager_id: x.manager_id ? String(x.manager_id) : null })),
    positions: arr(p).map((x: any) => ({ id: String(x.id), name: x.name, company_id: String(x.company_id) })),
  };
}

// ── Kho CV ───────────────────────────────────────────────────────────────────
export async function listCvs(status?: string): Promise<CvItem[]> {
  const qs = status ? `?status=${status}` : '';
  const res = await fetch(`/api/hr/cv${qs}`, { headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}
export async function createCv(form: FormData): Promise<CvItem> {
  const res = await fetch('/api/hr/cv', { method: 'POST', headers: authHeaders(), body: form });
  return (await jsonOrThrow(res)).data;
}
/** Tạo CV và trả kèm danh sách ứng viên trùng (email/SĐT) để cảnh báo. */
export async function createCvWithDup(form: FormData): Promise<{ cv: CvItem; duplicates: { id: string; candidate_name: string }[] }> {
  const res = await fetch('/api/hr/cv', { method: 'POST', headers: authHeaders(), body: form });
  const json = await jsonOrThrow(res);
  return { cv: json.data, duplicates: json.duplicates || [] };
}
export type { ExtractedCvCandidateData } from '@/lib/cvImport';
export async function extractCvCandidateData(file: File, signal?: AbortSignal): Promise<import('@/lib/cvImport').ExtractedCvCandidateData> {
  const form = new FormData(); form.append('file', file);
  const res = await fetch('/api/hr/cv/extract', { method: 'POST', headers: authHeaders(), body: form, signal });
  return (await jsonOrThrow(res)).data;
}
export async function updateCv(id: string, body: any): Promise<CvItem> {
  const res = await fetch(`/api/hr/cv/${id}`, { method: 'PUT', headers: authHeaders(true), body: JSON.stringify(body) });
  return (await jsonOrThrow(res)).data;
}
export async function deleteCv(id: string): Promise<void> {
  const res = await fetch(`/api/hr/cv/${id}`, { method: 'DELETE', headers: authHeaders() });
  await jsonOrThrow(res);
}
/** Tìm ứng viên theo filter có cấu trúc (nền cho Phase 2 AI/Telegram). */
export async function searchCvs(filter: CvSearchFilter): Promise<CvItem[]> {
  const res = await fetch('/api/hr/cv/search', { method: 'POST', headers: authHeaders(true), body: JSON.stringify(filter) });
  return (await jsonOrThrow(res)).data;
}
export async function getCvFilterOptions(): Promise<CvFilterOptions> {
  const res = await fetch('/api/hr/cv/filter-options', { headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}
export async function markCvViewed(id: string): Promise<void> {
  const res = await fetch(`/api/hr/cv/${id}/view`, { method: 'POST', headers: authHeaders() });
  await jsonOrThrow(res);
}
export interface CvIndustryFolder { id: string; name: string; count: number }
export async function listCvIndustries(): Promise<CvIndustryFolder[]> {
  const res = await fetch(`/api/hr/cv/industries?_=${Date.now()}`, {
    headers: authHeaders(),
    cache: 'no-store',
  });
  return (await jsonOrThrow(res)).data;
}
export async function createCvIndustry(name: string): Promise<CvIndustryFolder> {
  const res = await fetch('/api/hr/cv/industries', { method: 'POST', headers: authHeaders(true), body: JSON.stringify({ name }) });
  return (await jsonOrThrow(res)).data;
}
export async function renameCvIndustry(id: string, name: string): Promise<CvIndustryFolder> {
  const res = await fetch(`/api/hr/cv/industries/${id}`, { method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ name }) });
  return (await jsonOrThrow(res)).data;
}
export async function deleteCvIndustry(id: string): Promise<number> {
  const res = await fetch(`/api/hr/cv/industries/${id}`, { method: 'DELETE', headers: authHeaders() });
  return (await jsonOrThrow(res)).movedCount;
}
export async function moveCvsToIndustry(ids: string[], industry: string): Promise<number> {
  const res = await fetch('/api/hr/cv/move', { method: 'POST', headers: authHeaders(true), body: JSON.stringify({ ids, industry }) });
  return (await jsonOrThrow(res)).count;
}

// ── ATS: applications, ghi chú, lịch sử pipeline ─────────────────────────────
export interface CvApplication {
  id: string; cv_id: string; requisition_id: string; status: string | null; note: string | null;
  created_at: string; requisition_title?: string | null; requisition_status?: string | null;
}
export interface CvNote {
  id: string; cv_id: string; kind: string; rating: number | null; body: string | null;
  author_id: string | null; author_name?: string | null; created_at: string;
}
export interface CvStageEvent {
  id: string; cv_id: string; from_status: string | null; to_status: string;
  note: string | null; changed_by: string | null; changed_by_name?: string | null; created_at: string;
}
/** Lịch sử quyết định theo VỊ TRÍ (gộp mọi application của CV). */
export interface CvPositionHistoryEvent {
  id: string; requisition_id: string; requisition_title: string | null;
  from_status: string | null; to_status: string; actor_role: string | null;
  note: string | null; changed_by_name: string | null; created_at: string;
}
export interface CvDetail {
  cv: CvItem; applications: CvApplication[]; notes: CvNote[]; history: CvStageEvent[];
  positionHistory?: CvPositionHistoryEvent[];
}

export async function getCvDetail(id: string): Promise<CvDetail> {
  const res = await fetch(`/api/hr/cv/${id}/detail`, { headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}
export async function addCvNote(cvId: string, body: { kind?: string; rating?: number | null; body?: string }): Promise<CvNote> {
  const res = await fetch(`/api/hr/cv/${cvId}/notes`, { method: 'POST', headers: authHeaders(true), body: JSON.stringify(body) });
  return (await jsonOrThrow(res)).data;
}
export async function deleteCvNote(cvId: string, noteId: string): Promise<void> {
  const res = await fetch(`/api/hr/cv/${cvId}/notes?note_id=${encodeURIComponent(noteId)}`, { method: 'DELETE', headers: authHeaders() });
  await jsonOrThrow(res);
}
export async function linkRequisition(cvId: string, requisitionId: string, note?: string): Promise<CvApplication> {
  const res = await fetch(`/api/hr/cv/${cvId}/applications`, { method: 'POST', headers: authHeaders(true), body: JSON.stringify({ requisition_id: requisitionId, note }) });
  return (await jsonOrThrow(res)).data;
}
export async function unlinkRequisition(cvId: string, applicationId: string): Promise<void> {
  const res = await fetch(`/api/hr/cv/${cvId}/applications?application_id=${encodeURIComponent(applicationId)}`, { method: 'DELETE', headers: authHeaders() });
  await jsonOrThrow(res);
}
/** Danh sách yêu cầu tuyển dụng (mặc định đang mở) để liên kết với ứng viên. */
export async function listRequisitionOptions(status = 'open'): Promise<{ id: string; title: string; status: string }[]> {
  const res = await fetch(`/api/hr/requisitions${status ? `?status=${status}` : ''}`, { headers: authHeaders() });
  const json = await jsonOrThrow(res);
  return (json.data || []).map((r: any) => ({ id: r.id, title: r.title, status: r.status }));
}

// ── Kho JD ───────────────────────────────────────────────────────────────────
export async function listJds(status?: string): Promise<JdItem[]> {
  const qs = status ? `?status=${status}` : '';
  const res = await fetch(`/api/hr/jd${qs}`, { headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}
export async function createJd(form: FormData): Promise<JdItem> {
  const res = await fetch('/api/hr/jd', { method: 'POST', headers: authHeaders(), body: form });
  return (await jsonOrThrow(res)).data;
}
export async function updateJd(id: string, body: any): Promise<JdItem> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const res = await fetch(`/api/hr/jd/${id}`, {
    method: 'PUT',
    headers: isForm ? authHeaders() : authHeaders(true),
    body: isForm ? body : JSON.stringify(body),
  });
  return (await jsonOrThrow(res)).data;
}
export async function deleteJd(id: string): Promise<void> {
  const res = await fetch(`/api/hr/jd/${id}`, { method: 'DELETE', headers: authHeaders() });
  await jsonOrThrow(res);
}

/**
 * Tải hồ sơ đính kèm qua fetch (API yêu cầu header x-current-user-id —
 * thẻ <a href> không gửi được header nên phải dùng blob).
 */
export async function downloadHrDoc(id: string, fileName: string): Promise<void> {
  const res = await fetch(`/api/hr-documents/${id}?download=1`, { headers: authHeaders() });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Không tải được tệp');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Tải file qua fetch + blob kèm header auth (API CV/JD yêu cầu quyền — <a href> không gửi header được). */
export async function downloadAuthed(url: string, fileName: string): Promise<void> {
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Không tải được tệp');
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export function fmtBytes(n: number | null | undefined): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

export function fmtDateTime(s: string | null | undefined): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ── Dashboard Tình Hình Tuyển Dụng Nhân Sự ───────────────────────────────────
export interface DashBucket { label: string; value: number }
export interface DashTrend { month: string; value: number }
export interface RecruitmentDashboardData {
  funnel: { invited: number; submitted: number; confirmed: number; sent_to_admin: number; approved: number; rejected: number };
  cycleTime: { inviteToSubmit: number; submitToConfirm: number; confirmToSent: number; sentToApprove: number; submitToApprove: number };
  hiresByMonth: DashTrend[];
  cvByStage: DashBucket[];
  cvBySource: DashBucket[];
  cvTotal: number;
  jd: { active: number; total: number; openList: { title: string; department: string | null }[] };
  workforce: {
    headcount: number; newHires30d: number; newHires90d: number;
    byCompany: DashBucket[]; byDepartment: DashBucket[]; bySubDepartment: DashBucket[];
    byEmploymentType: DashBucket[];
    byGender: DashBucket[]; byAge: DashBucket[]; byTenure: DashBucket[];
    unitsMissingHead: { company: string; department: string }[];
  };
  applications: {
    total: number;
    byStage: DashBucket[];
    offer12m: { offered: number; accepted: number; declined: number; pending: number; acceptRate: number };
    stageDurations: DashBucket[];
  };
  interviews: {
    upcoming7d: number; done30d: number; cancelled30d: number;
    scorecards12m: number; avgOverall: number; byRecommendation: DashBucket[];
  };
  replacement: {
    contractsExpiring90d: number;
    contractsExpiringByWindow: DashBucket[];
    offboardingInProgress: number;
  };
  hiringPlan: {
    horizonMonths: number; openRemaining: number; expectedAttrition: number;
    contractRisk: number; pipelineOffset: number; total: number;
  }[];
  quality: { probationPassRate: number; probationPassed: number; probationFailed: number; earlyAttrition90d: number };
  turnover: { leavers12m: number; turnoverRate: number; leaversByMonth: DashTrend[] };
  requisitions: {
    open: number; onHold: number; filledThisMonth: number; totalTarget: number; totalFilled: number; avgTimeToFill: number;
    byPriority: DashBucket[];
    aging: { id: string; title: string; days_open: number; owner_name: string | null; target_headcount: number; filled_count: number }[];
    byOwner: DashBucket[];
  };
  forecast: {
    p10: number; p50: number; p90: number;
    confidence: 'low' | 'medium' | 'high';
    drivers: string[];
    basis: { pipeline: number; demand: number; trend: number };
  };
  forecastNextMonth: number;
  range: { from: string; to: string };
  companies: { id: string; name: string }[];
  cohorts: { month: string; hired: number; still: number }[];
}

export async function getRecruitmentDashboard(opts?: { company?: string; from?: string; to?: string }): Promise<RecruitmentDashboardData> {
  const params = new URLSearchParams();
  if (opts?.company) params.set('company', opts.company);
  if (opts?.from) params.set('from', opts.from);
  if (opts?.to) params.set('to', opts.to);
  const qs = params.toString();
  const res = await fetch(`/api/hr/recruitment-dashboard${qs ? `?${qs}` : ''}`, { headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}
