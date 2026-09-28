'use client';

// Client helpers cho module Nhân Sự — tự đính kèm header user (giống api-client).

export interface Contract {
  id: string;
  employee_id: string;
  contract_type_id: string | null;
  employment_type_id: string | null;
  contract_number: string;
  sign_date: string | null;
  start_date: string | null;
  end_date: string | null;
  salary_info: string | null;
  notes: string | null;
  status: 'draft' | 'pending_signing' | 'active' | 'renewed' | 'terminated';
  previous_contract_id: string | null;
  reminder_count?: number;
  escalated_at?: string | null;
  created_at: string;
  employee_name?: string | null;
  employee_email?: string | null;
  contract_type_name?: string | null;
  employment_type_name?: string | null;
  employee_job_title?: string | null;
  attachment_count?: number;
  employee_department_id?: string | null;
  employee_department_name?: string | null;
  employee_company_id?: string | null;
  employee_company_name?: string | null;
}

export interface ContractWatcher {
  id: string;
  contract_id: string;
  user_id: string;
  role?: 'watcher' | 'co_handler';
  name: string | null;
  email: string | null;
  added_by: string | null;
  created_at: string;
}

export interface CompanyOption {
  id: string;
  name: string;
}

export interface LookupItem {
  id: string;
  name: string;
  description?: string | null;
  code?: string | null;
  code_template?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

export interface AttachmentMeta {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export interface HrDocument {
  id: string;
  employee_id: string;
  doc_type_id: string | null;
  title: string | null;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  doc_type_name?: string | null;
  employee_name?: string | null;
}

export interface UserOption {
  id: string;
  name: string;
  email?: string | null;
  department?: string | null;
}

export interface DepartmentOption {
  id: string;
  name: string;
}

function authHeaders(json = false): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('assetflow_auth');
    if (stored) {
      try {
        const u = JSON.parse(stored);
        if (u.id) h['x-current-user-id'] = u.id;
        if (u.role) h['x-current-user-role'] = u.role;
      } catch {
        /* noop */
      }
    }
  }
  return h;
}

async function jsonOrThrow(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Lỗi server');
  return data;
}

/**
 * Mở preview file qua fetch (có auth header).
 * window.open() thuần sẽ không gửi custom header → 401.
 */
export async function openFilePreview(url: string, download = false): Promise<void> {
  const res = await fetch(download ? `${url}?download=1` : url, { headers: authHeaders() });
  if (!res.ok) throw new Error('Không thể tải tệp');
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.target = '_blank';
  if (download) a.download = '';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
}

// ── Contracts ────────────────────────────────────────────────────────────────
export async function listContracts(params: Record<string, string> = {}): Promise<Contract[]> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/contracts${qs ? `?${qs}` : ''}`, { headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}
export async function getContract(id: string): Promise<{ data: Contract; chain: Contract[] }> {
  const res = await fetch(`/api/contracts/${id}`, { headers: authHeaders() });
  return jsonOrThrow(res);
}
export async function createContract(body: any): Promise<Contract> {
  const res = await fetch('/api/contracts', { method: 'POST', headers: authHeaders(true), body: JSON.stringify(body) });
  return (await jsonOrThrow(res)).data;
}
export async function updateContract(id: string, body: any): Promise<Contract> {
  const res = await fetch(`/api/contracts/${id}`, { method: 'PUT', headers: authHeaders(true), body: JSON.stringify(body) });
  return (await jsonOrThrow(res)).data;
}
export async function deleteContract(id: string): Promise<void> {
  const res = await fetch(`/api/contracts/${id}`, { method: 'DELETE', headers: authHeaders() });
  await jsonOrThrow(res);
}
export async function renewContract(id: string, body: any): Promise<Contract> {
  const res = await fetch(`/api/contracts/${id}/renew`, { method: 'POST', headers: authHeaders(true), body: JSON.stringify(body) });
  return (await jsonOrThrow(res)).data;
}
/** Sinh mã hợp đồng theo template của loại HĐ (cấp 1 STT mới). */
export async function generateContractCode(contractTypeId: string, employeeId: string): Promise<string> {
  const res = await fetch('/api/contracts/generate-code', {
    method: 'POST', headers: authHeaders(true),
    body: JSON.stringify({ contract_type_id: contractTypeId, employee_id: employeeId }),
  });
  return (await jsonOrThrow(res)).code;
}
/** Loại HĐ phù hợp với hình thức làm việc của nhân viên (để gợi ý khi tạo). */
export async function suggestedContractTypes(employeeId: string): Promise<{ id: string; name: string; code: string | null }[]> {
  const res = await fetch(`/api/contracts/suggested-types?employee_id=${encodeURIComponent(employeeId)}`, { headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}

// ── Contract watchers ────────────────────────────────────────────────────────
export async function listContractWatchers(contractId: string): Promise<ContractWatcher[]> {
  const res = await fetch(`/api/contracts/${contractId}/watchers`, { headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}
export async function addContractWatcher(contractId: string, userId: string, role: 'watcher' | 'co_handler' = 'watcher'): Promise<ContractWatcher | null> {
  const res = await fetch(`/api/contracts/${contractId}/watchers`, {
    method: 'POST', headers: authHeaders(true), body: JSON.stringify({ user_id: userId, role }),
  });
  return (await jsonOrThrow(res)).data;
}
export async function removeContractWatcher(contractId: string, userId: string): Promise<void> {
  const res = await fetch(`/api/contracts/${contractId}/watchers`, {
    method: 'DELETE', headers: authHeaders(true), body: JSON.stringify({ user_id: userId }),
  });
  await jsonOrThrow(res);
}
export async function remindContractSign(contractId: string): Promise<void> {
  const res = await fetch(`/api/contracts/${contractId}/remind`, {
    method: 'POST', headers: authHeaders(),
  });
  await jsonOrThrow(res);
}

// ── Contract attachments ─────────────────────────────────────────────────────
export async function listContractAttachments(id: string): Promise<AttachmentMeta[]> {
  const res = await fetch(`/api/contracts/${id}/attachments`, { headers: authHeaders() });
  return (await jsonOrThrow(res)).attachments;
}
export async function uploadContractAttachments(id: string, files: FileList | File[]): Promise<void> {
  const fd = new FormData();
  Array.from(files).forEach((f) => fd.append('files', f));
  const res = await fetch(`/api/contracts/${id}/attachments`, { method: 'POST', headers: authHeaders(), body: fd });
  await jsonOrThrow(res);
}
export async function deleteContractAttachment(attachmentId: string): Promise<void> {
  const res = await fetch(`/api/contracts/attachments/${attachmentId}`, { method: 'DELETE', headers: authHeaders() });
  await jsonOrThrow(res);
}

// ── Lookups (contract-types, hr-document-types) ──────────────────────────────
export async function listLookup(kind: 'contract-types' | 'hr-document-types', all = false): Promise<LookupItem[]> {
  const res = await fetch(`/api/${kind}${all ? '?all=1' : ''}`, { headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}
export async function createLookup(kind: 'contract-types' | 'hr-document-types', name: string): Promise<LookupItem> {
  const res = await fetch(`/api/${kind}`, { method: 'POST', headers: authHeaders(true), body: JSON.stringify({ name }) });
  return (await jsonOrThrow(res)).data;
}
export async function updateLookup(kind: 'contract-types' | 'hr-document-types', id: string, body: any): Promise<LookupItem> {
  const res = await fetch(`/api/${kind}/${id}`, { method: 'PUT', headers: authHeaders(true), body: JSON.stringify(body) });
  return (await jsonOrThrow(res)).data;
}
export async function deleteLookup(kind: 'contract-types' | 'hr-document-types', id: string): Promise<void> {
  const res = await fetch(`/api/${kind}/${id}`, { method: 'DELETE', headers: authHeaders() });
  await jsonOrThrow(res);
}

// ── HR documents ─────────────────────────────────────────────────────────────
export async function listHrDocuments(employeeId?: string): Promise<HrDocument[]> {
  const qs = employeeId ? `?employee_id=${encodeURIComponent(employeeId)}` : '';
  const res = await fetch(`/api/hr-documents${qs}`, { headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}
export async function listAllHrDocuments(docTypeId?: string): Promise<HrDocument[]> {
  const qs = new URLSearchParams({ all: '1', ...(docTypeId ? { doc_type_id: docTypeId } : {}) });
  const res = await fetch(`/api/hr-documents?${qs}`, { headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}
export async function uploadHrDocuments(opts: {
  files: FileList | File[];
  employeeId?: string;
  docTypeId?: string | null;
  title?: string | null;
}): Promise<void> {
  const fd = new FormData();
  Array.from(opts.files).forEach((f) => fd.append('files', f));
  if (opts.employeeId) fd.append('employee_id', opts.employeeId);
  if (opts.docTypeId) fd.append('doc_type_id', opts.docTypeId);
  if (opts.title) fd.append('title', opts.title);
  const res = await fetch('/api/hr-documents', { method: 'POST', headers: authHeaders(), body: fd });
  await jsonOrThrow(res);
}

export async function uploadHrDocument(opts: {
  employeeId: string;
  docTypeId: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  buffer: ArrayBuffer;
  uploadedBy?: string | null;
}): Promise<HrDocument> {
  const blob = new Blob([opts.buffer], { type: opts.mimeType });
  const file = new File([blob], opts.fileName, { type: opts.mimeType });
  const fd = new FormData();
  fd.append('files', file);
  fd.append('employee_id', opts.employeeId);
  fd.append('doc_type_id', opts.docTypeId);
  fd.append('title', opts.title);
  const res = await fetch('/api/hr-documents', { method: 'POST', headers: authHeaders(), body: fd });
  return (await jsonOrThrow(res)).data;
}
export async function deleteHrDocument(id: string): Promise<void> {
  const res = await fetch(`/api/hr-documents/${id}`, { method: 'DELETE', headers: authHeaders() });
  await jsonOrThrow(res);
}

// ── Reminder config ──────────────────────────────────────────────────────────
export async function getReminderConfig(): Promise<string[]> {
  const res = await fetch('/api/hr/reminder-config', { headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}
export async function setReminderConfig(departmentIds: string[]): Promise<void> {
  const res = await fetch('/api/hr/reminder-config', { method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ department_ids: departmentIds }) });
  await jsonOrThrow(res);
}

// ── Pickers ──────────────────────────────────────────────────────────────────
export async function listUsers(): Promise<{ id: string; name: string }[]> {
  const res = await fetch('/api/users', { headers: authHeaders() });
  const data = await res.json().catch(() => []);
  const arr = Array.isArray(data) ? data : data?.data ?? [];
  return arr.map((u: any) => ({ id: String(u.id), name: u.name }));
}

export async function searchUsers(q: string): Promise<UserOption[]> {
  const res = await fetch(`/api/hr-documents/employees?q=${encodeURIComponent(q)}`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  return data?.data ?? [];
}

export interface DepartedPerson {
  id: string; name: string; email: string; avatar: string | null;
  department_name: string | null; company_name: string | null;
  left_date: string | null; doc_count: number;
}
export async function listDepartedPersonnel(q = ''): Promise<DepartedPerson[]> {
  const res = await fetch(`/api/hr-documents/departed?q=${encodeURIComponent(q)}`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  return data?.data ?? [];
}
export async function listDepartments(companyId?: string): Promise<DepartmentOption[]> {
  const qs = companyId ? `?company_id=${encodeURIComponent(companyId)}` : '';
  const res = await fetch(`/api/organizations/departments${qs}`, { headers: authHeaders() });
  const data = await res.json().catch(() => []);
  const arr = Array.isArray(data) ? data : data?.data ?? [];
  return arr.map((d: any) => ({ id: String(d.id), name: d.name }));
}

export async function listCompanies(): Promise<CompanyOption[]> {
  const res = await fetch('/api/organizations/companies', { headers: authHeaders() });
  const data = await res.json().catch(() => []);
  const arr = Array.isArray(data) ? data : data?.data ?? [];
  return arr.map((c: any) => ({ id: String(c.id), name: c.name }));
}

// ── HR document replace requests ─────────────────────────────────────────────
export interface ReplaceRequest {
  id: string;
  original_doc_id: string;
  new_file_name: string;
  new_title: string | null;
  new_mime_type: string | null;
  new_size_bytes: number | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  requested_by: string;
  reviewed_by: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
  original_file_name?: string | null;
  original_title?: string | null;
  original_mime_type?: string | null;
  original_size_bytes?: number | null;
  employee_id?: string | null;
  employee_name?: string | null;
  doc_type_name?: string | null;
  requester_name?: string | null;
}

export async function createReplaceRequest(
  docId: string,
  file: File,
  title: string | null
): Promise<ReplaceRequest> {
  const fd = new FormData();
  fd.append('files', file);
  if (title) fd.append('title', title);
  const res = await fetch(`/api/hr-documents/${docId}/replace-request`, {
    method: 'POST', headers: authHeaders(), body: fd,
  });
  return (await jsonOrThrow(res)).data;
}
export async function listMyReplaceRequests(): Promise<ReplaceRequest[]> {
  const res = await fetch('/api/hr-documents/replace-requests?scope=mine', { headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}
export async function listPendingReplaceRequests(): Promise<ReplaceRequest[]> {
  const res = await fetch('/api/hr-documents/replace-requests?scope=pending', { headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}
export async function approveReplaceRequest(reqId: string): Promise<void> {
  const res = await fetch(`/api/hr-documents/replace-requests/${reqId}/approve`, {
    method: 'POST', headers: authHeaders(),
  });
  await jsonOrThrow(res);
}
export async function rejectReplaceRequest(reqId: string, note?: string): Promise<void> {
  const res = await fetch(`/api/hr-documents/replace-requests/${reqId}/reject`, {
    method: 'POST', headers: authHeaders(true), body: JSON.stringify({ note: note || '' }),
  });
  await jsonOrThrow(res);
}

// ── Employment Types ─────────────────────────────────────────────────────────
export interface EmploymentType {
  id: string;
  name: string;
  description: string | null;
  default_duration_days: number | null;
  requires_evaluation: boolean;
  sort_order: number;
  is_active: boolean;
}

export async function listEmploymentTypes(all = false): Promise<EmploymentType[]> {
  const res = await fetch(`/api/employment-types${all ? '?all=1' : ''}`, { headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}
export async function createEmploymentType(body: any): Promise<EmploymentType> {
  const res = await fetch('/api/employment-types', { method: 'POST', headers: authHeaders(true), body: JSON.stringify(body) });
  return (await jsonOrThrow(res)).data;
}
export async function updateEmploymentType(id: string, body: any): Promise<EmploymentType> {
  const res = await fetch(`/api/employment-types/${id}`, { method: 'PUT', headers: authHeaders(true), body: JSON.stringify(body) });
  return (await jsonOrThrow(res)).data;
}
export async function deleteEmploymentType(id: string): Promise<void> {
  const res = await fetch(`/api/employment-types/${id}`, { method: 'DELETE', headers: authHeaders() });
  await jsonOrThrow(res);
}
/** Loại HĐ đã gắn cho 1 hình thức làm việc. */
export async function getEmpTypeContractTypes(employmentTypeId: string): Promise<{ id: string; name: string; code: string | null }[]> {
  const res = await fetch(`/api/employment-types/${employmentTypeId}/contract-types`, { headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}
/** Set danh sách loại HĐ cho 1 hình thức làm việc. */
export async function setEmpTypeContractTypes(employmentTypeId: string, contractTypeIds: string[]): Promise<void> {
  const res = await fetch(`/api/employment-types/${employmentTypeId}/contract-types`, {
    method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ contract_type_ids: contractTypeIds }),
  });
  await jsonOrThrow(res);
}

// ── Luồng chuyển tiếp sau thử việc ────────────────────────────────────────────
export interface EmploymentTransition {
  id: string;
  from_employment_type_id: string;
  from_employment_type_name: string | null;
  to_employment_type_id: string;
  to_employment_type_name: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  contract_types: { id: string; name: string; code: string | null }[];
}
export async function listEmploymentTransitions(): Promise<EmploymentTransition[]> {
  const res = await fetch('/api/employment-transitions', { headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}
export async function createEmploymentTransition(from: string, to: string): Promise<void> {
  const res = await fetch('/api/employment-transitions', {
    method: 'POST', headers: authHeaders(true),
    body: JSON.stringify({ from_employment_type_id: from, to_employment_type_id: to }),
  });
  await jsonOrThrow(res);
}
export async function updateEmploymentTransition(
  id: string, body: { to_employment_type_id?: string; is_active?: boolean; contract_type_ids?: string[] }
): Promise<void> {
  const res = await fetch(`/api/employment-transitions/${id}`, { method: 'PUT', headers: authHeaders(true), body: JSON.stringify(body) });
  await jsonOrThrow(res);
}
export async function deleteEmploymentTransition(id: string): Promise<void> {
  const res = await fetch(`/api/employment-transitions/${id}`, { method: 'DELETE', headers: authHeaders() });
  await jsonOrThrow(res);
}

// ── Evaluations ───────────────────────────────────────────────────────────────
export interface Evaluation {
  id: string;
  employee_id: string;
  employment_type_id: string | null;
  employment_type_name: string | null;
  hire_date: string | null;
  probation_end_date: string | null;
  status: 'draft' | 'pending_signing' | 'evaluated' | 'passed' | 'failed' | 'extended';
  result: 'pass' | 'fail' | null;
  result_note: string | null;
  evaluated_by: string | null;
  concluded_by: string | null;
  concluded_at: string | null;
  resulting_contract_id: string | null;
  /** Nháp HĐ sinh khi ĐẠT còn tồn tại không (false = đã bị xoá → cho phép sinh lại). */
  resulting_contract_exists?: boolean;
  resulting_offboarding_id: string | null;
  auto_generated: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  employee_name?: string | null;
  employee_email?: string | null;
  employee_department_id?: string | null;
  employee_department_name?: string | null;
  attachment_count?: number;
  /** Mốc lưu trữ (NULL = đang hiển thị ở danh sách chính). */
  archived_at?: string | null;
}

export interface EvalWatcher {
  id: string;
  evaluation_id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  added_by: string | null;
  created_at: string;
}

export async function listEvaluations(params: Record<string, string> = {}): Promise<Evaluation[]> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/evaluations${qs ? `?${qs}` : ''}`, { headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}
export async function getEvaluation(id: string): Promise<Evaluation> {
  const res = await fetch(`/api/evaluations/${id}`, { headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}
export async function createEvaluationApi(body: any): Promise<Evaluation> {
  const res = await fetch('/api/evaluations', { method: 'POST', headers: authHeaders(true), body: JSON.stringify(body) });
  return (await jsonOrThrow(res)).data;
}
/** Sinh lại nháp hợp đồng cho thẻ đánh giá đã ĐẠT (khi nháp tự động bị xoá nhầm). */
export async function regenerateEvalContractsApi(id: string): Promise<string | null> {
  const res = await fetch(`/api/evaluations/${id}/regenerate-contracts`, { method: 'POST', headers: authHeaders(true) });
  return (await jsonOrThrow(res)).data.contractId;
}
export async function updateEvaluationApi(id: string, body: any): Promise<Evaluation> {
  const res = await fetch(`/api/evaluations/${id}`, { method: 'PUT', headers: authHeaders(true), body: JSON.stringify(body) });
  return (await jsonOrThrow(res)).data;
}
export async function deleteEvaluationApi(id: string): Promise<void> {
  const res = await fetch(`/api/evaluations/${id}`, { method: 'DELETE', headers: authHeaders() });
  await jsonOrThrow(res);
}
/** Lưu trữ / bỏ lưu trữ thẻ đánh giá (chỉ thẻ đã kết luận). */
export async function archiveEvaluationApi(id: string, archived: boolean): Promise<void> {
  const res = await fetch(`/api/evaluations/${id}/archive`, {
    method: 'POST', headers: authHeaders(true), body: JSON.stringify({ archived }),
  });
  await jsonOrThrow(res);
}
export async function concludeEvaluationApi(
  id: string,
  body: {
    result: 'pass' | 'fail';
    failAction?: 'extend' | 'terminate';
    extendDays?: number;
    result_note?: string;
  }
): Promise<{ data: Evaluation; contractId: string | null; newEvaluationId: string | null }> {
  const res = await fetch(`/api/evaluations/${id}/conclude`, {
    method: 'POST', headers: authHeaders(true), body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

// Watchers
export async function listEvalWatchers(evalId: string): Promise<EvalWatcher[]> {
  const res = await fetch(`/api/evaluations/${evalId}/watchers`, { headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}
export async function addEvalWatcher(evalId: string, userId: string): Promise<EvalWatcher> {
  const res = await fetch(`/api/evaluations/${evalId}/watchers`, {
    method: 'POST', headers: authHeaders(true), body: JSON.stringify({ user_id: userId }),
  });
  return (await jsonOrThrow(res)).data;
}
export async function removeEvalWatcher(evalId: string, userId: string): Promise<void> {
  const res = await fetch(`/api/evaluations/${evalId}/watchers`, {
    method: 'DELETE', headers: authHeaders(true), body: JSON.stringify({ user_id: userId }),
  });
  await jsonOrThrow(res);
}

// Attachments
export async function listEvalAttachments(evalId: string): Promise<AttachmentMeta[]> {
  const res = await fetch(`/api/evaluations/${evalId}/attachments`, { headers: authHeaders() });
  return (await jsonOrThrow(res)).attachments;
}
export async function uploadEvalAttachments(evalId: string, files: FileList | File[]): Promise<void> {
  const fd = new FormData();
  Array.from(files).forEach((f) => fd.append('files', f));
  const res = await fetch(`/api/evaluations/${evalId}/attachments`, {
    method: 'POST', headers: authHeaders(), body: fd,
  });
  await jsonOrThrow(res);
}
export async function deleteEvalAttachment(attachmentId: string): Promise<void> {
  const res = await fetch(`/api/evaluations/attachments/${attachmentId}`, {
    method: 'DELETE', headers: authHeaders(),
  });
  await jsonOrThrow(res);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
/** Số ngày còn lại tới end_date (âm = quá hạn, null nếu vô thời hạn). */
export function daysLeft(endDate: string | null): number | null {
  if (!endDate) return null;
  const today = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const end = new Date(endDate);
  return Math.round((end.getTime() - today.getTime()) / 86400000);
}

export function fmtBytes(n: number | null | undefined): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
