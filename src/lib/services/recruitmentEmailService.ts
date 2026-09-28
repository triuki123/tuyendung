/**
 * Gửi email tuyển dụng qua SMTP hộp thư Tuyển dụng (Zimbra) bằng Nodemailer.
 * Cấu hình SMTP lưu ở system_settings (key 'email.smtp') — sửa qua UI, KHÔNG hardcode/env.
 */
import nodemailer from 'nodemailer';
import { query, queryOne, execute } from '@/lib/db';
import { inlineEmailCss } from './emailInlineCss';

const SMTP_KEY = 'email.smtp';

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export interface SmtpConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;            // true = 465 (SSL), false = 587 (STARTTLS)
  user: string;               // email hộp thư tuyển dụng
  password: string;
  fromName: string;           // tên hiển thị người gửi
  rejectUnauthorized: boolean; // false nếu Zimbra cert tự ký
}

const DEFAULT_SMTP: SmtpConfig = {
  enabled: false, host: '', port: 587, secure: false, user: '', password: '',
  fromName: 'Bộ phận Tuyển dụng', rejectUnauthorized: false,
};

/** Đọc cấu hình SMTP (đầy đủ, gồm password) — chỉ dùng server-side để gửi. */
export async function getSmtpConfig(): Promise<SmtpConfig> {
  const row = await queryOne<{ value: Partial<SmtpConfig> }>(
    `SELECT value FROM system_settings WHERE key = $1`, [SMTP_KEY],
  ).catch(() => null);
  return { ...DEFAULT_SMTP, ...(row?.value ?? {}) };
}

/** Cấu hình đã che password (trả cho client). */
export async function getSmtpConfigMasked(): Promise<Omit<SmtpConfig, 'password'> & { hasPassword: boolean }> {
  const cfg = await getSmtpConfig();
  const { password, ...rest } = cfg;
  return { ...rest, hasPassword: !!password };
}

/** Lưu cấu hình SMTP. Password rỗng → GIỮ password cũ (write-only từ UI). */
export async function saveSmtpConfig(partial: Partial<SmtpConfig>, actor: string | null): Promise<void> {
  const current = await getSmtpConfig();
  const merged: SmtpConfig = { ...current, ...partial };
  if (!partial.password) merged.password = current.password; // không đổi nếu để trống
  await execute(
    `INSERT INTO system_settings (key, category, value, updated_by, updated_at)
     VALUES ($1, 'email', $2::jsonb, $3, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [SMTP_KEY, JSON.stringify(merged), isUuid(actor) ? actor : null],
  );
}

function isUuid(s: string | null): boolean {
  return !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/** Dựng transport từ config; ném lỗi nếu chưa cấu hình đủ. */
async function buildTransport(cfg?: SmtpConfig) {
  const c = cfg ?? (await getSmtpConfig());
  if (!c.enabled || !c.host || !c.user || !c.password) {
    throw new Error('SMTP tuyển dụng chưa được cấu hình (vào Mẫu Email → Cấu hình SMTP).');
  }
  const transport = nodemailer.createTransport({
    host: c.host,
    port: c.port || (c.secure ? 465 : 587),
    secure: !!c.secure,
    auth: { user: c.user, pass: c.password },
    tls: { rejectUnauthorized: !!c.rejectUnauthorized },
  });
  const from = c.fromName ? `"${c.fromName}" <${c.user}>` : c.user;
  return { transport, from };
}

/** Gửi thử tới 1 địa chỉ để kiểm tra cấu hình. */
export async function sendTestEmail(to: string): Promise<void> {
  const { transport, from } = await buildTransport();
  await transport.sendMail({
    from, to,
    subject: 'Email thử — Cấu hình SMTP Tuyển dụng',
    html: '<p>Đây là email thử từ hệ thống FADO AssetFlow. Nếu bạn nhận được, cấu hình SMTP tuyển dụng đã hoạt động. ✅</p>',
  });
}

export interface SendRecruitmentEmailInput {
  to: string; subject: string; html: string;
  /** CC — danh sách email nhận bản sao (tùy chọn). */
  cc?: string[] | null;
  cvId?: string | null; applicationId?: string | null; requisitionId?: string | null;
  templateId?: string | null; sentBy?: string | null;
}

/** Gửi 1 email tuyển dụng + ghi log (dù thành/bại). Gửi đúng HTML template do HR soạn. */
export async function sendRecruitmentEmail(input: SendRecruitmentEmailInput): Promise<{ id: string }> {
  const id = genId('rem');
  let status: 'sent' | 'failed' = 'sent';
  let error: string | null = null;
  // Inline CSS: template dùng <style> + class sẽ mất định dạng khi tới hộp thư nếu không inline.
  const finalHtml = await inlineEmailCss(input.html);
  const cc = (input.cc ?? []).filter(Boolean);
  try {
    const { transport, from } = await buildTransport();
    await transport.sendMail({
      from, to: input.to, subject: input.subject, html: finalHtml,
      ...(cc.length > 0 ? { cc } : {}),
    });
  } catch (e) {
    status = 'failed';
    error = e instanceof Error ? e.message : 'Lỗi gửi email';
  }
  await execute(
    `INSERT INTO hr_recruitment_emails
       (id, cv_id, application_id, requisition_id, to_email, subject, body_html, template_id, status, error, sent_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id, input.cvId ?? null, input.applicationId ?? null, input.requisitionId ?? null,
     input.to, input.subject, finalHtml, input.templateId ?? null, status, error, input.sentBy ?? null],
  );
  if (status === 'failed') throw new Error(error || 'Gửi email thất bại');
  return { id };
}

export interface SentEmail {
  id: string; to_email: string; subject: string; status: string; error: string | null;
  sent_by: string | null; sent_by_name: string | null; template_id: string | null; created_at: string;
}

/** Lịch sử email đã gửi cho 1 CV. */
export async function listSentEmailsForCv(cvId: string): Promise<SentEmail[]> {
  return query<SentEmail>(
    `SELECT e.id, e.to_email, e.subject, e.status, e.error, e.sent_by,
            u.name AS sent_by_name, e.template_id, e.created_at
       FROM hr_recruitment_emails e
       LEFT JOIN users u ON u.id::text = e.sent_by
      WHERE e.cv_id = $1
      ORDER BY e.created_at DESC`, [cvId],
  );
}
