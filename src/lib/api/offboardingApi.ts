'use client';

// Client helpers cho luồng Offboarding (Quy Trình Nghỉ Việc — Nguồn Nhân Lực).
// Tự đính kèm header user từ localStorage (cùng cơ chế onboardingApi).

export interface ObTemplate {
  id: string;
  title: string;
  description: string | null;
  category: string;
  sort_order: number;
  enabled: boolean;
  required: boolean;
  auto_type: string | null;
  is_system: boolean;
  assignee_id: string | null;
  assignee_name?: string | null;
  assignee_avatar?: string | null;
}

export interface ObItem {
  id: string;
  process_id: string;
  template_id: string | null;
  title: string;
  description: string | null;
  category: string;
  sort_order: number;
  required: boolean;
  asset_id: string | null;
  is_done: boolean;
  done_by: string | null;
  done_by_name?: string | null;
  done_at: string | null;
  note: string | null;
  assignee_id: string | null;
  assignee_name?: string | null;
  assignee_avatar?: string | null;
}

export interface ObProcess {
  id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  user_avatar?: string | null;
  department_name?: string | null;
  sub_department_name?: string | null;
  company_name?: string | null;
  job_title_name?: string | null;
  reason: string;
  reason_note: string | null;
  last_working_date: string | null;
  source_ticket_id: string | null;
  status: 'in_progress' | 'completed' | 'cancelled';
  created_by: string | null;
  created_by_name?: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  total_items?: number;
  done_items?: number;
  items?: ObItem[];
}

export interface ObEligibleUser {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  department_name: string | null;
  company_name: string | null;
  job_title_name: string | null;
  asset_count: number;
  has_active_process: boolean;
}

export const OB_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  in_progress: { label: 'Đang xử lý', color: 'text-amber-400 bg-amber-500/15 border-amber-500/30' },
  completed:   { label: 'Hoàn tất',   color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' },
  cancelled:   { label: 'Đã hủy',     color: 'text-ink-muted bg-slate-500/15 border-slate-500/30' },
};

export const OB_REASON_LABELS: Record<string, string> = {
  resignation:  'Xin nghỉ việc',
  termination:  'Chấm dứt HĐLĐ',
  contract_end: 'Hết hạn hợp đồng',
  retirement:   'Nghỉ hưu',
  other:        'Khác',
};

export const OB_CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  hcns:    { label: 'Hành Chính Nhân Sự', color: 'text-indigo-400' },
  asset:   { label: 'Thu Hồi Tài Sản',    color: 'text-amber-400' },
  it:      { label: 'IT & Tài Khoản',     color: 'text-sky-400' },
  finance: { label: 'Kế Toán',            color: 'text-emerald-400' },
  other:   { label: 'Khác',               color: 'text-ink-muted' },
};

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

// ── Quy trình ────────────────────────────────────────────────────────────────
export async function listObProcesses(status?: string): Promise<{ data: ObProcess[]; counts: Record<string, number> }> {
  const qs = status ? `?status=${status}` : '';
  const res = await fetch(`/api/hr/offboarding${qs}`, { headers: authHeaders() });
  const json = await jsonOrThrow(res);
  return { data: json.data, counts: json.counts || {} };
}

export async function getObProcess(id: string): Promise<ObProcess> {
  const res = await fetch(`/api/hr/offboarding/${id}`, { headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}

export async function createObProcess(body: {
  user_id: string; reason: string; reason_note?: string;
  last_working_date?: string; source_ticket_id?: string;
}): Promise<ObProcess> {
  const res = await fetch('/api/hr/offboarding', {
    method: 'POST', headers: authHeaders(true), body: JSON.stringify(body),
  });
  return (await jsonOrThrow(res)).data;
}

export async function toggleObItem(processId: string, itemId: string, isDone: boolean, note?: string): Promise<ObItem> {
  const res = await fetch(`/api/hr/offboarding/${processId}/items/${itemId}`, {
    method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ is_done: isDone, note }),
  });
  return (await jsonOrThrow(res)).data;
}

export async function completeObProcess(id: string, skipAttachment = false): Promise<ObProcess> {
  const res = await fetch(`/api/hr/offboarding/${id}/complete`, {
    method: 'POST', headers: authHeaders(true), body: JSON.stringify({ skipAttachment }),
  });
  return (await jsonOrThrow(res)).data;
}

export async function cancelObProcess(id: string, reason: string): Promise<ObProcess> {
  const res = await fetch(`/api/hr/offboarding/${id}/cancel`, {
    method: 'POST', headers: authHeaders(true), body: JSON.stringify({ reason }),
  });
  return (await jsonOrThrow(res)).data;
}

export async function updateObProcessInfo(id: string, body: {
  reason?: string; reason_note?: string | null; last_working_date?: string | null; source_ticket_id?: string | null;
}): Promise<ObProcess> {
  const res = await fetch(`/api/hr/offboarding/${id}`, {
    method: 'PUT', headers: authHeaders(true), body: JSON.stringify(body),
  });
  return (await jsonOrThrow(res)).data;
}

export async function archiveObProcess(id: string): Promise<void> {
  const res = await fetch(`/api/hr/offboarding/${id}/archive`, { method: 'POST', headers: authHeaders() });
  await jsonOrThrow(res);
}

export async function restoreObProcess(id: string): Promise<void> {
  const res = await fetch(`/api/hr/offboarding/${id}/archive`, { method: 'DELETE', headers: authHeaders() });
  await jsonOrThrow(res);
}

export async function listArchivedObProcesses(): Promise<ObProcess[]> {
  const res = await fetch('/api/hr/offboarding/archived', { headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}

export async function deleteObProcess(id: string): Promise<void> {
  const res = await fetch(`/api/hr/offboarding/${id}`, { method: 'DELETE', headers: authHeaders() });
  await jsonOrThrow(res);
}

export async function searchObEligibleUsers(q: string): Promise<ObEligibleUser[]> {
  const res = await fetch(`/api/hr/offboarding/eligible-users?q=${encodeURIComponent(q)}`, { headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}

// ── Hồ sơ nghỉ việc đính kèm + việc còn tồn ──────────────────────────────────
export interface ObAttachment {
  id: string; file_name: string; mime_type: string | null; size_bytes: number | null;
  uploaded_by: string | null; uploaded_by_name?: string | null; created_at: string;
}
export interface ObPendingWork { tickets: number; tasks: number; bookings: number; }

export async function listObAttachments(processId: string): Promise<ObAttachment[]> {
  const res = await fetch(`/api/hr/offboarding/${processId}/attachments`, { headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}

export async function uploadObAttachment(processId: string, file: File): Promise<ObAttachment> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`/api/hr/offboarding/${processId}/attachments`, {
    method: 'POST', headers: authHeaders(false), body: fd,
  });
  return (await jsonOrThrow(res)).data;
}

export async function deleteObAttachment(processId: string, docId: string): Promise<void> {
  const res = await fetch(`/api/hr/offboarding/${processId}/attachments/${docId}`, {
    method: 'DELETE', headers: authHeaders(),
  });
  await jsonOrThrow(res);
}

export function obAttachmentUrl(processId: string, docId: string): string {
  return `/api/hr/offboarding/${processId}/attachments/${docId}/content`;
}

export async function getObPendingWork(processId: string): Promise<ObPendingWork> {
  const res = await fetch(`/api/hr/offboarding/${processId}/pending-work`, { headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}

// ── Cấu hình checklist ───────────────────────────────────────────────────────
export async function listObTemplates(): Promise<ObTemplate[]> {
  const res = await fetch('/api/hr/offboarding/templates', { headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}

export async function createObTemplate(body: { title: string; description?: string; category?: string; required?: boolean }): Promise<ObTemplate> {
  const res = await fetch('/api/hr/offboarding/templates', {
    method: 'POST', headers: authHeaders(true), body: JSON.stringify(body),
  });
  return (await jsonOrThrow(res)).data;
}

export async function updateObTemplate(id: string, body: Partial<ObTemplate>): Promise<ObTemplate> {
  const res = await fetch(`/api/hr/offboarding/templates/${id}`, {
    method: 'PUT', headers: authHeaders(true), body: JSON.stringify(body),
  });
  return (await jsonOrThrow(res)).data;
}

export async function deleteObTemplate(id: string): Promise<void> {
  const res = await fetch(`/api/hr/offboarding/templates/${id}`, { method: 'DELETE', headers: authHeaders() });
  await jsonOrThrow(res);
}

// ── Format helpers ───────────────────────────────────────────────────────────
export function obFmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  const d = String(s).slice(0, 10).split('-');
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : String(s);
}

export function obFmtDateTime(s: string | null | undefined): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
}
