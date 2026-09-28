'use client';

export interface EmailTemplate {
  id: string; name: string; category: string; subject: string; body_html: string;
  is_active: boolean; created_at: string; updated_at: string;
}

export const EMAIL_TEMPLATE_CATEGORIES: { code: string; label: string }[] = [
  { code: 'interview_invite', label: 'Mời phỏng vấn' },
  { code: 'rejection', label: 'Từ chối / cảm ơn' },
  { code: 'offer', label: 'Mời nhận việc' },
  { code: 'account_provision', label: 'Cấp tài khoản nhân sự mới' },
  { code: 'other', label: 'Khác' },
];
export const EMAIL_TEMPLATE_VARIABLES: { key: string; label: string }[] = [
  { key: 'ung_vien', label: 'Tên ứng viên' },
  { key: 'vi_tri', label: 'Vị trí tuyển dụng' },
  { key: 'cong_ty', label: 'Công ty' },
  { key: 'thoi_gian', label: 'Thời gian phỏng vấn' },
  { key: 'hinh_thuc', label: 'Hình thức phỏng vấn' },
  { key: 'dia_diem', label: 'Địa điểm / Link' },
  { key: 'nguoi_gui', label: 'Người gửi' },
  { key: 'assetflow_user', label: 'Username AssetFlow' },
  { key: 'assetflow_pass', label: 'Password AssetFlow' },
  { key: 'zimbra_user', label: 'Username Zimbra' },
  { key: 'zimbra_pass', label: 'Password Zimbra' },
];

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
  if (!res.ok) throw new Error(d.error || 'Lỗi server');
  return d;
}

export async function listEmailTemplates(onlyActive = false): Promise<EmailTemplate[]> {
  const res = await fetch(`/api/hr/email-templates${onlyActive ? '?active=1' : ''}`, { headers: headers() });
  return (await ok(res)).data;
}
export async function createEmailTemplate(body: { name: string; category: string; subject: string; body_html: string }): Promise<EmailTemplate> {
  const res = await fetch('/api/hr/email-templates', { method: 'POST', headers: headers(true), body: JSON.stringify(body) });
  return (await ok(res)).data;
}
export async function updateEmailTemplate(id: string, body: Partial<{ name: string; category: string; subject: string; body_html: string; is_active: boolean }>): Promise<EmailTemplate> {
  const res = await fetch(`/api/hr/email-templates/${id}`, { method: 'PUT', headers: headers(true), body: JSON.stringify(body) });
  return (await ok(res)).data;
}
export async function deleteEmailTemplate(id: string): Promise<void> {
  const res = await fetch(`/api/hr/email-templates/${id}`, { method: 'DELETE', headers: headers() });
  await ok(res);
}

// ── Cấu hình SMTP (admin) ──
export interface SmtpSettings {
  enabled: boolean; host: string; port: number; secure: boolean; user: string;
  fromName: string; rejectUnauthorized: boolean; hasPassword: boolean;
}
export async function getSmtpSettings(): Promise<SmtpSettings> {
  const res = await fetch('/api/hr/email-settings', { headers: headers() });
  return (await ok(res)).data;
}
export async function saveSmtpSettings(body: {
  enabled: boolean; host: string; port: number; secure: boolean; user: string;
  password?: string; from_name: string; reject_unauthorized: boolean;
}): Promise<SmtpSettings> {
  const res = await fetch('/api/hr/email-settings', { method: 'PUT', headers: headers(true), body: JSON.stringify(body) });
  return (await ok(res)).data;
}
export async function testSmtp(to: string): Promise<void> {
  const res = await fetch('/api/hr/email-settings/test', { method: 'POST', headers: headers(true), body: JSON.stringify({ to }) });
  await ok(res);
}
