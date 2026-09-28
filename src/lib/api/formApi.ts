'use client';

// Client helpers cho Kho Biểu Mẫu nội bộ (Google Forms style).

export interface FormTemplate {
  id: string;
  title: string;
  description: string | null;
  form_type: 'onboarding' | 'general';
  token: string;
  status: 'draft' | 'active' | 'closed';
  is_internal: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  submission_count?: number;
  field_count?: number;
}

export interface FormField {
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
  visible_if: VisibleIf | null;
}

export interface VisibleCond { field: string; op: 'equals' | 'not_equals' | 'includes' | 'not_empty' | 'empty'; value?: string }
export interface VisibleIf { mode: 'all' | 'any'; conditions: VisibleCond[] }

export interface FormResponse {
  id: string;
  candidate_name: string;
  candidate_email: string;
  data: Record<string, any>;
  created_at: string;
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

export async function listForms(): Promise<FormTemplate[]> {
  const res = await fetch('/api/hr/forms', { headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}
export async function createForm(body: { title: string; description?: string }): Promise<FormTemplate> {
  const res = await fetch('/api/hr/forms', { method: 'POST', headers: authHeaders(true), body: JSON.stringify(body) });
  return (await jsonOrThrow(res)).data;
}
export async function getForm(id: string): Promise<FormTemplate> {
  const res = await fetch(`/api/hr/forms/${id}`, { headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}
export async function updateForm(id: string, body: { title?: string; description?: string; status?: string; is_internal?: boolean; expires_at?: string | null }): Promise<FormTemplate> {
  const res = await fetch(`/api/hr/forms/${id}`, { method: 'PUT', headers: authHeaders(true), body: JSON.stringify(body) });
  return (await jsonOrThrow(res)).data;
}
export async function deleteForm(id: string): Promise<void> {
  const res = await fetch(`/api/hr/forms/${id}`, { method: 'DELETE', headers: authHeaders() });
  await jsonOrThrow(res);
}

export async function listFormFields(id: string): Promise<FormField[]> {
  const res = await fetch(`/api/hr/forms/${id}/fields`, { headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}
export async function addFormField(id: string, body: { label: string; field_type: string; required?: boolean; options?: string[]; help_text?: string }): Promise<FormField[]> {
  const res = await fetch(`/api/hr/forms/${id}/fields`, { method: 'POST', headers: authHeaders(true), body: JSON.stringify(body) });
  return (await jsonOrThrow(res)).data;
}
export async function updateFormFields(id: string, updates: { id: string; enabled?: boolean; required?: boolean; label?: string; sort_order?: number; visible_if?: VisibleIf | null }[]): Promise<FormField[]> {
  const res = await fetch(`/api/hr/forms/${id}/fields`, { method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ updates }) });
  return (await jsonOrThrow(res)).data;
}
export async function deleteFormField(id: string, fieldId: string): Promise<FormField[]> {
  const res = await fetch(`/api/hr/forms/${id}/fields?fieldId=${fieldId}`, { method: 'DELETE', headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}

export async function getFormResponses(id: string): Promise<{ submissions: FormResponse[]; fields: FormField[] }> {
  const res = await fetch(`/api/hr/forms/${id}/responses`, { headers: authHeaders() });
  return (await jsonOrThrow(res)).data;
}

export const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'Văn bản ngắn',
  textarea: 'Văn bản dài',
  email: 'Email',
  tel: 'Số điện thoại',
  number: 'Số',
  date: 'Ngày',
  select: 'Lựa chọn',
};

export function fmtDateTime(s: string | null | undefined): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
}
