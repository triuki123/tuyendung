/**
 * Trung Tâm Email — soạn/gửi email theo template, log outbox snapshot HTML.
 * Render: thay {{var}} trong subject + body.
 * Gửi qua SES; nếu có đính kèm → SendRawEmailCommand (MIME).
 * Không lưu snapshot templates cũ — sửa template chỉ ảnh hưởng lần gửi mới.
 */
import crypto from 'crypto';
import { SESClient, SendEmailCommand, SendRawEmailCommand } from '@aws-sdk/client-ses';
import { inlineEmailCss } from './emailInlineCss';
import nodemailer from 'nodemailer';
import { queryOne, query, execute } from '@/lib/db';
import { uploadBufferAsMedia, getMediaBuffer } from '@/lib/services/mediaService';

// SES client mặc định (dùng khi sender không override credentials).
const defaultSes = new SESClient({
  region: process.env.AWS_REGION || 'ap-southeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const ENV_FROM = process.env.SES_FROM_EMAIL || 'no-reply@fadogroup.com.au';

export type EmailCategory = 'payment' | 'hr' | 'account' | 'internal' | 'other';
export interface TemplateField { key: string; label: string; type: 'text' | 'number' | 'date' | 'textarea' | 'money'; required?: boolean; default?: string; help?: string }

export interface EmailTemplate {
  id: string;
  category: EmailCategory;
  key: string;
  name: string;
  description: string | null;
  subject_tpl: string;
  body_html_tpl: string;
  schema: TemplateField[];
  engine: 'ses' | 'smtp';
  is_active: boolean;
  is_system: boolean;
  default_sender_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface OutboxRow {
  id: string;
  template_id: string | null;
  category: string | null;
  engine: string;
  from_addr: string | null;
  to_addr: string;
  cc: string | null;
  bcc: string | null;
  subject: string;
  body_html: string;
  variables: Record<string, any>;
  status: 'pending' | 'sent' | 'failed';
  error: string | null;
  sent_by: string | null;
  sent_at: string | null;
  sender_id: string | null;
  created_at: string;
}

export interface AttachmentInput {
  filename: string;
  mime: string;
  content: Buffer;
}

export interface EmailSender {
  id: string;
  name: string;
  from_addr: string;
  from_name: string | null;
  reply_to: string | null;
  engine: 'ses' | 'smtp';
  ses_region: string | null;
  ses_access_key: string | null;
  ses_secret_key: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: boolean | null;
  smtp_user: string | null;
  smtp_password: string | null;
  smtp_reject_unauth: boolean | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type EmailSenderPublic = Omit<EmailSender, 'ses_secret_key' | 'smtp_password'> & { has_secret: boolean };

function maskSender(s: EmailSender): EmailSenderPublic {
  const { ses_secret_key, smtp_password, ...rest } = s;
  return { ...rest, has_secret: !!(ses_secret_key || smtp_password) };
}

function genId(prefix: string): string {
  return prefix + crypto.randomBytes(10).toString('hex');
}

/**
 * Render template:
 * - {{#loopKey}}...{{/loopKey}} — lặp mảng vars[loopKey]; trong body dùng {{col}} tham chiếu cell.
 *   Có thể lồng {{@parent.varKey}} để truy cập biến ngoài loop, {{@index}} = số thứ tự 1..n.
 * - {{var}} hoặc {{parent.child}} — thay giá trị.
 * - {{fmt:money varKey}} — format money (thêm dấu phẩy).
 */
/**
 * Parse số theo chuẩn vi-VN: '.' = ngăn cách hàng nghìn, ',' = thập phân.
 * "5.800.000" → 5800000, "250.000" → 250000, "1,5" → 1.5. Tránh Number("5.800.000")=NaN.
 */
function toNumVN(v: any): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v == null || v === '') return 0;
  let s = String(v).trim().replace(/[^\d.,-]/g, '');
  const neg = s.startsWith('-');
  s = s.replace(/-/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
}

export function render(tpl: string, vars: Record<string, any>): string {
  // 1. Xử lý loop trước (có thể lồng field bên trong)
  let out = tpl.replace(/\{\{#([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, body) => {
    const arr = vars?.[key];
    if (!Array.isArray(arr)) return '';
    return arr.map((row: any, idx: number) => {
      return body.replace(/\{\{\s*(?:fmt:(money|number)\s+)?([a-zA-Z0-9_.@]+)\s*\}\}/g, (_m: string, fmt: string, k: string) => {
        let v: any;
        if (k === '@index') v = idx + 1;                       // số thứ tự tự động 1..n
        else if (k.startsWith('@parent.')) v = vars?.[k.slice(8)];
        else if (k.includes('.')) v = k.split('.').reduce((o: any, p: string) => (o == null ? '' : o[p]), row);
        else v = row?.[k];
        if (v === undefined || v === null) return '';
        if (fmt === 'money') return toNumVN(v).toLocaleString('vi-VN');
        if (fmt === 'number') return toNumVN(v).toLocaleString('vi-VN');
        return String(v);
      });
    }).join('');
  });
  // 2. Biến đơn ngoài loop
  out = out.replace(/\{\{\s*(?:fmt:(money|number)\s+)?([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, fmt, k) => {
    const v = k.includes('.') ? k.split('.').reduce((o: any, p: string) => (o == null ? '' : o[p]), vars) : vars?.[k];
    if (v === undefined || v === null) return '';
    if (fmt === 'money') return toNumVN(v).toLocaleString('vi-VN');
    if (fmt === 'number') return toNumVN(v).toLocaleString('vi-VN');
    return String(v);
  });
  return out;
}

/* ============ TEMPLATES CRUD ============ */

/** Tự sinh schema từ subject + body — parse {{var}} thành text field. */
function autoSchemaFromPlaceholders(subject: string, body: string): TemplateField[] {
  const seen = new Set<string>();
  const re = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
  for (const src of [subject || '', body || '']) {
    let m; while ((m = re.exec(src)) !== null) seen.add(m[1]);
  }
  return Array.from(seen).map(k => ({ key: k, label: k, type: 'text' as const, required: false }));
}

/** Suy đoán category email-center từ category free-text của template HR cũ. */
function mapLegacyCategory(raw: string, name: string): EmailCategory {
  const s = ((raw || '') + ' ' + (name || '')).toLowerCase();
  if (/(tài\s*khoản|tai\s*khoan|credential|account|password|mật\s*khẩu)/.test(s)) return 'account';
  return 'hr';
}

/** Đọc template HR cũ (bảng hr_email_templates) và format cho Trung Tâm Email dùng. */
async function listHrRecruitmentAsTemplates(): Promise<EmailTemplate[]> {
  const rows = await query<{ id: string; name: string; category: string; subject: string; body_html: string; default_sender_id: string | null }>(
    `SELECT id, name, category, subject, body_html, default_sender_id
       FROM hr_email_templates WHERE is_active ORDER BY name`
  );
  const now = new Date().toISOString();
  return rows.map(r => ({
    id: 'hr_' + r.id, // prefix để distinguish khi send
    category: mapLegacyCategory(r.category, r.name),
    key: r.id,
    name: r.name,
    description: r.category || null,
    subject_tpl: r.subject,
    body_html_tpl: r.body_html,
    schema: autoSchemaFromPlaceholders(r.subject, r.body_html),
    engine: 'ses' as const,
    is_active: true,
    // is_system = nguồn dữ liệu là bảng cũ hr_email_templates (KHÔNG còn nghĩa "cấm sửa").
    // Nội dung vẫn sửa được từ Trung Tâm Email — xem updateTemplate().
    is_system: true,
    default_sender_id: r.default_sender_id ?? null,
    created_at: now,
    updated_at: now,
  }));
}

export async function listTemplates(category?: string): Promise<EmailTemplate[]> {
  const own = category
    ? await query<EmailTemplate>(`SELECT * FROM email_templates WHERE is_active AND category = $1 ORDER BY name`, [category])
    : await query<EmailTemplate>(`SELECT * FROM email_templates WHERE is_active ORDER BY category, name`);
  // Gộp thêm template tuyển dụng cũ — mỗi template được map category (hr | account).
  if (!category || category === 'hr' || category === 'account') {
    try {
      const hrOld = await listHrRecruitmentAsTemplates();
      const filtered = category ? hrOld.filter(t => t.category === category) : hrOld;
      return [...own, ...filtered];
    } catch (err) {
      console.warn('Không đọc được hr_email_templates:', err);
    }
  }
  return own;
}

export async function getTemplate(id: string): Promise<EmailTemplate | null> {
  // Template tuyển dụng cũ có id prefix 'hr_' — đọc từ bảng cũ.
  if (id.startsWith('hr_')) {
    const realId = id.slice(3);
    const r = await queryOne<{ id: string; name: string; category: string; subject: string; body_html: string; default_sender_id: string | null }>(
      `SELECT id, name, category, subject, body_html, default_sender_id
         FROM hr_email_templates WHERE id = $1 AND is_active`,
      [realId]
    );
    if (!r) return null;
    const now = new Date().toISOString();
    return {
      id, category: 'hr', key: r.id, name: `[Tuyển dụng] ${r.name}`, description: r.category || null,
      subject_tpl: r.subject, body_html_tpl: r.body_html,
      schema: autoSchemaFromPlaceholders(r.subject, r.body_html),
      engine: 'ses', is_active: true, is_system: true,
      default_sender_id: r.default_sender_id ?? null,
      created_at: now, updated_at: now,
    };
  }
  return queryOne<EmailTemplate>(`SELECT * FROM email_templates WHERE id = $1`, [id]);
}

export async function createTemplate(input: Omit<EmailTemplate, 'id' | 'created_at' | 'updated_at' | 'is_system'>): Promise<EmailTemplate> {
  const id = genId('et_');
  const row = await queryOne<EmailTemplate>(
    `INSERT INTO email_templates (id, category, key, name, description, subject_tpl, body_html_tpl, schema, engine, is_active, is_system)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false) RETURNING *`,
    [id, input.category, input.key, input.name, input.description, input.subject_tpl, input.body_html_tpl,
     JSON.stringify(input.schema || []), input.engine || 'ses', input.is_active !== false]
  );
  return row!;
}

export async function updateTemplate(id: string, patch: Partial<EmailTemplate>): Promise<EmailTemplate> {
  // Template tuyển dụng (id 'hr_...') KHÔNG nằm trong email_templates — nó là bản ghi ảo
  // dựng từ bảng cũ hr_email_templates. Lệnh lưu phải định tuyến về đúng bảng đó, nếu không
  // UPDATE email_templates trả 0 dòng → "Không tìm thấy template".
  //
  // Nội dung SỬA ĐƯỢC ngay tại Trung Tâm Email (không còn chặn "template hệ thống").
  if (id.startsWith('hr_')) {
    const realId = id.slice(3);
    const current = await getTemplate(id);
    if (!current) throw new Error('Không tìm thấy template');

    // Ánh xạ field của Trung Tâm Email → cột bảng cũ.
    // `description` chính là cột `category` của bảng cũ (getTemplate đọc ngược như vậy).
    const map: Record<string, string> = {
      name: 'name',
      subject_tpl: 'subject',
      body_html_tpl: 'body_html',
      description: 'category',
      is_active: 'is_active',
      default_sender_id: 'default_sender_id',
    };

    const cols: string[] = [];
    const vals: any[] = [];
    let i = 1;
    for (const [field, col] of Object.entries(map)) {
      const v = (patch as any)[field];
      if (v === undefined) continue;
      cols.push(`"${col}" = $${i++}`);
      vals.push(field === 'default_sender_id' ? (v || null) : v);
    }

    if (cols.length > 0) {
      vals.push(realId);
      await execute(`UPDATE hr_email_templates SET ${cols.join(', ')} WHERE id = $${i}`, vals);
    }

    // `schema` KHÔNG lưu được: bảng cũ không có cột này — schema của nhóm tuyển dụng luôn
    // được suy tự động từ các {{biến}} trong subject/body (autoSchemaFromPlaceholders).
    // Sửa biến trong nội dung là schema tự đổi theo, nên bỏ qua là đúng, không phải mất dữ liệu.
    return (await getTemplate(id))!;
  }

  const cols: string[] = [];
  const vals: any[] = [];
  let i = 1;
  const editable = ['category', 'key', 'name', 'description', 'subject_tpl', 'body_html_tpl', 'schema', 'engine', 'is_active', 'default_sender_id'];
  for (const k of editable) {
    if ((patch as any)[k] === undefined) continue;
    cols.push(`"${k}" = $${i++}`);
    vals.push(k === 'schema' ? JSON.stringify((patch as any)[k]) : (patch as any)[k]);
  }
  if (cols.length === 0) return (await getTemplate(id))!;
  vals.push(id);
  const row = await queryOne<EmailTemplate>(
    `UPDATE email_templates SET ${cols.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`,
    vals
  );
  if (!row) throw new Error('Không tìm thấy template');
  return row;
}

export async function deleteTemplate(id: string): Promise<void> {
  const t = await getTemplate(id);
  if (t?.is_system) throw new Error('Không xóa được template hệ thống');
  await execute(`DELETE FROM email_templates WHERE id = $1 AND is_system = false`, [id]);
}

/* ============ SENDERS CRUD ============ */

export async function listSenders(activeOnly = false): Promise<EmailSenderPublic[]> {
  const rows = await query<EmailSender>(
    activeOnly
      ? `SELECT * FROM email_senders WHERE is_active ORDER BY is_default DESC, name`
      : `SELECT * FROM email_senders ORDER BY is_default DESC, name`
  );
  return rows.map(maskSender);
}

export async function getSender(id: string): Promise<EmailSender | null> {
  return queryOne<EmailSender>(`SELECT * FROM email_senders WHERE id = $1`, [id]);
}

export async function getDefaultSender(): Promise<EmailSender | null> {
  return queryOne<EmailSender>(`SELECT * FROM email_senders WHERE is_default AND is_active LIMIT 1`);
}

export async function createSender(input: Partial<EmailSender>): Promise<EmailSenderPublic> {
  if (!input.name || !input.from_addr) throw new Error('Thiếu tên hoặc from_addr');
  const id = genId('es_');
  // Nếu đặt is_default = true, hạ default hiện tại xuống.
  if (input.is_default) await execute(`UPDATE email_senders SET is_default = false WHERE is_default`);
  const row = await queryOne<EmailSender>(
    `INSERT INTO email_senders (id, name, from_addr, from_name, reply_to, engine, ses_region, ses_access_key, ses_secret_key,
       smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password, smtp_reject_unauth, is_default, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
    [id, input.name, input.from_addr, input.from_name || null, input.reply_to || null, input.engine || 'ses',
     input.ses_region || null, input.ses_access_key || null, input.ses_secret_key || null,
     input.smtp_host || null, input.smtp_port || null, input.smtp_secure ?? false, input.smtp_user || null,
     input.smtp_password || null, input.smtp_reject_unauth ?? true, !!input.is_default, input.is_active ?? true]
  );
  return maskSender(row!);
}

export async function updateSender(id: string, patch: Partial<EmailSender>): Promise<EmailSenderPublic> {
  const cur = await getSender(id);
  if (!cur) throw new Error('Không tìm thấy sender');
  if (patch.is_default) await execute(`UPDATE email_senders SET is_default = false WHERE is_default AND id <> $1`, [id]);
  const editable = ['name', 'from_addr', 'from_name', 'reply_to', 'engine', 'ses_region', 'ses_access_key',
    'smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_reject_unauth', 'is_default', 'is_active'];
  const cols: string[] = [];
  const vals: any[] = [];
  let i = 1;
  for (const k of editable) {
    if ((patch as any)[k] === undefined) continue;
    cols.push(`"${k}" = $${i++}`); vals.push((patch as any)[k]);
  }
  // Chỉ update secret nếu có giá trị mới (không rỗng) — write-only.
  if (patch.ses_secret_key) { cols.push(`ses_secret_key = $${i++}`); vals.push(patch.ses_secret_key); }
  if (patch.smtp_password) { cols.push(`smtp_password = $${i++}`); vals.push(patch.smtp_password); }
  if (cols.length === 0) return maskSender(cur);
  vals.push(id);
  const row = await queryOne<EmailSender>(
    `UPDATE email_senders SET ${cols.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`, vals
  );
  return maskSender(row!);
}

export async function deleteSender(id: string): Promise<void> {
  await execute(`DELETE FROM email_senders WHERE id = $1`, [id]);
}

/** Resolve sender: theo id truyền vào, fallback default, fallback env FROM. */
async function resolveSender(senderId?: string | null): Promise<EmailSender | null> {
  if (senderId) {
    const s = await getSender(senderId);
    if (s && s.is_active) return s;
  }
  return getDefaultSender();
}

function formatFrom(s: EmailSender | null): string {
  if (!s) return ENV_FROM;
  return s.from_name ? `"${s.from_name}" <${s.from_addr}>` : s.from_addr;
}

/* ============ SEND ============ */

/** MIME cho SendRawEmailCommand với đính kèm. */
function buildRawMime(opts: {
  from: string; to: string; cc?: string; bcc?: string; subject: string; html: string;
  attachments: AttachmentInput[];
}): Buffer {
  const boundary = '----=_Part_' + crypto.randomBytes(8).toString('hex');
  const lines: string[] = [];
  lines.push(`From: ${opts.from}`);
  lines.push(`To: ${opts.to}`);
  if (opts.cc) lines.push(`Cc: ${opts.cc}`);
  if (opts.bcc) lines.push(`Bcc: ${opts.bcc}`);
  const subjB64 = Buffer.from(opts.subject, 'utf-8').toString('base64');
  lines.push(`Subject: =?UTF-8?B?${subjB64}?=`);
  lines.push('MIME-Version: 1.0');
  lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  lines.push('');
  lines.push(`--${boundary}`);
  lines.push('Content-Type: text/html; charset=UTF-8');
  lines.push('Content-Transfer-Encoding: base64');
  lines.push('');
  lines.push(Buffer.from(opts.html, 'utf-8').toString('base64'));
  for (const a of opts.attachments) {
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: ${a.mime}; name="${a.filename}"`);
    lines.push('Content-Transfer-Encoding: base64');
    lines.push(`Content-Disposition: attachment; filename="${a.filename}"`);
    lines.push('');
    lines.push(a.content.toString('base64'));
  }
  lines.push(`--${boundary}--`);
  return Buffer.from(lines.join('\r\n'), 'utf-8');
}

interface SendInput {
  templateId?: string | null;
  category?: string | null;
  senderId?: string | null;         // override sender; nếu bỏ trống → dùng default
  to: string;
  cc?: string | null;
  bcc?: string | null;
  subject: string;
  html: string;
  variables?: Record<string, any>;
  attachments?: AttachmentInput[];
  sentBy?: string | null;
}

/** Gửi 1 email + log outbox. Trả về row outbox. */
export async function sendEmail(input: SendInput): Promise<OutboxRow> {
  const id = genId('eo_');
  // Inline CSS: template dùng <style>+class sẽ mất định dạng ở hộp thư nếu không inline.
  const html = await inlineEmailCss(input.html);
  const attachments = input.attachments || [];
  const sender = await resolveSender(input.senderId || null);
  const fromDisplay = formatFrom(sender);
  const engine = sender?.engine || 'ses';

  await execute(
    `INSERT INTO email_outbox (id, template_id, category, engine, from_addr, to_addr, cc, bcc, subject, body_html, variables, status, sent_by, sender_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending',$12,$13)`,
    [id, input.templateId || null, input.category || null, engine, fromDisplay, input.to, input.cc || null, input.bcc || null,
     input.subject, html, JSON.stringify(input.variables || {}), input.sentBy || null, sender?.id || null]
  );

  for (const a of attachments) {
    // Dual-write: ưu tiên MinIO (media_id, BYTEA NULL); S3 chưa cấu hình → giữ đường BYTEA cũ.
    const media = await uploadBufferAsMedia({
      buffer: a.content,
      mimeType: a.mime || 'application/octet-stream',
      scope: 'email_attachments',
      originalName: a.filename,
      sourceId: id,
    });
    await execute(
      `INSERT INTO email_attachments (id, outbox_id, filename, mime, size, content, media_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [genId('ea_'), id, a.filename, a.mime, a.content.length, media ? null : a.content, media?.id ?? null]
    );
  }

  try {
    if (engine === 'smtp') {
      if (!sender?.smtp_host || !sender?.smtp_user || !sender?.smtp_password) throw new Error('Sender SMTP chưa cấu hình đủ');
      const transport = nodemailer.createTransport({
        host: sender.smtp_host,
        port: sender.smtp_port || (sender.smtp_secure ? 465 : 587),
        secure: !!sender.smtp_secure,
        auth: { user: sender.smtp_user, pass: sender.smtp_password },
        tls: { rejectUnauthorized: sender.smtp_reject_unauth ?? false },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        // Force IPv4 — nhiều container Coolify ưu tiên IPv6 nhưng route IPv6 chưa mở → ECONNREFUSED giả.
        family: 4,
      } as any);
      // Zimbra thường yêu cầu From = user đã auth. Nếu from_addr khác smtp_user → dùng smtp_user để không bị drop.
      const authFromDisplay = sender.from_name ? `"${sender.from_name}" <${sender.smtp_user}>` : sender.smtp_user;
      const finalFrom = sender.from_addr === sender.smtp_user ? fromDisplay : authFromDisplay;
      await transport.sendMail({
        from: finalFrom,
        to: input.to,
        cc: input.cc || undefined,
        bcc: input.bcc || undefined,
        replyTo: sender.reply_to || sender.from_addr || undefined,
        subject: input.subject,
        html,
        attachments: attachments.map(a => ({ filename: a.filename, content: a.content, contentType: a.mime })),
      });
    } else {
      // SES — dùng client per-sender nếu có credentials riêng, ngược lại default client.
      const client = sender?.ses_access_key && sender?.ses_secret_key
        ? new SESClient({
            region: sender.ses_region || process.env.AWS_REGION || 'ap-southeast-2',
            credentials: { accessKeyId: sender.ses_access_key, secretAccessKey: sender.ses_secret_key },
          })
        : defaultSes;
      if (attachments.length > 0) {
        const raw = buildRawMime({ from: fromDisplay, to: input.to, cc: input.cc || undefined, bcc: input.bcc || undefined, subject: input.subject, html, attachments });
        await client.send(new SendRawEmailCommand({ RawMessage: { Data: raw } }));
      } else {
        await client.send(new SendEmailCommand({
          Source: fromDisplay,
          Destination: { ToAddresses: [input.to], CcAddresses: input.cc ? [input.cc] : undefined, BccAddresses: input.bcc ? [input.bcc] : undefined },
          ReplyToAddresses: sender?.reply_to ? [sender.reply_to] : undefined,
          Message: {
            Subject: { Data: input.subject, Charset: 'UTF-8' },
            Body: { Html: { Data: html, Charset: 'UTF-8' } },
          },
        }));
      }
    }
    await execute(`UPDATE email_outbox SET status = 'sent', sent_at = NOW() WHERE id = $1`, [id]);
  } catch (err: any) {
    await execute(`UPDATE email_outbox SET status = 'failed', error = $1 WHERE id = $2`, [String(err?.message || err), id]);
    throw err;
  }
  return (await queryOne<OutboxRow>('SELECT * FROM email_outbox WHERE id = $1', [id]))!;
}

/* ============ OUTBOX ============ */

export async function listOutbox(limit = 200, category?: string): Promise<OutboxRow[]> {
  if (category) {
    return query<OutboxRow>(
      `SELECT * FROM email_outbox WHERE category = $1 ORDER BY created_at DESC LIMIT $2`,
      [category, limit]
    );
  }
  return query<OutboxRow>(`SELECT * FROM email_outbox ORDER BY created_at DESC LIMIT $1`, [limit]);
}

export async function getOutbox(id: string): Promise<OutboxRow | null> {
  return queryOne<OutboxRow>('SELECT * FROM email_outbox WHERE id = $1', [id]);
}

export async function listOutboxAttachments(outboxId: string) {
  return query<{ id: string; filename: string; mime: string; size: number }>(
    `SELECT id, filename, mime, size FROM email_attachments WHERE outbox_id = $1 ORDER BY filename`,
    [outboxId]
  );
}

export async function getAttachmentContent(id: string): Promise<{ filename: string; mime: string; content: Buffer } | null> {
  const row = await queryOne<{ filename: string; mime: string; content: Buffer | null; media_id: string | null }>(
    `SELECT filename, mime, content, media_id FROM email_attachments WHERE id = $1`,
    [id]
  );
  if (!row) return null;
  // Dual-read: có media_id → đọc từ MinIO, không → BYTEA cũ.
  if (row.media_id) {
    const m = await getMediaBuffer(row.media_id);
    if (m) return { filename: row.filename, mime: row.mime || m.mimeType, content: m.buffer };
  }
  if (!row.content) return null;
  return { filename: row.filename, mime: row.mime, content: row.content };
}
