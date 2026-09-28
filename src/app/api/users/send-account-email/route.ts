import { NextRequest, NextResponse } from 'next/server';
import { sendRecruitmentEmail } from '@/lib/services/recruitmentEmailService';
import { renderTemplate } from '@/lib/services/emailTemplateService';

export const dynamic = 'force-dynamic';

/** Chỉ QTV (người có quyền Duyệt Người Dùng) mới được gửi email cấp tài khoản. */
function canSend(request: NextRequest): boolean {
  const role = request.headers.get('x-current-user-role') || '';
  return role === 'admin' || role === 'super_admin';
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** Các biến cho phép điền vào mẫu "Email cấp tài khoản cho nhân sự mới". */
const ALLOWED_VARS = new Set([
  'ung_vien', 'cong_ty', 'nguoi_gui',
  'assetflow_user', 'assetflow_pass', 'zimbra_user', 'zimbra_pass',
]);

/**
 * POST — gửi "Email cấp tài khoản cho nhân sự mới" sau khi QTV duyệt người dùng.
 * Body: { to, cc?, subject, body_html, template_id?, vars: { assetflow_user, ... } }.
 * Tái dùng SMTP + log của email tuyển dụng (hr_recruitment_emails, cv_id = null).
 */
export async function POST(request: NextRequest) {
  try {
    if (!canSend(request)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const b = await request.json();

    const to = typeof b.to === 'string' ? b.to.trim() : '';
    if (!to || !EMAIL_RE.test(to)) {
      return NextResponse.json({ error: 'Email người nhận không hợp lệ' }, { status: 400 });
    }
    const cc = typeof b.cc === 'string'
      ? b.cc.split(/[,;\n]+/).map((s: string) => s.trim()).filter((s: string) => s)
      : [];
    const invalidCc = cc.filter((e: string) => !EMAIL_RE.test(e));
    if (invalidCc.length > 0) {
      return NextResponse.json({ error: `Email CC không hợp lệ: ${invalidCc.join(', ')}` }, { status: 400 });
    }
    if (!b.subject?.trim() || !b.body_html?.trim()) {
      return NextResponse.json({ error: 'Thiếu tiêu đề hoặc nội dung' }, { status: 400 });
    }

    const vars: Record<string, string> = {};
    if (b.vars && typeof b.vars === 'object') {
      for (const [k, v] of Object.entries(b.vars as Record<string, unknown>)) {
        if (ALLOWED_VARS.has(k) && typeof v === 'string') vars[k] = v.trim();
      }
    }

    const subject = renderTemplate(b.subject, vars);
    const html = renderTemplate(b.body_html, vars);
    const senderId = request.headers.get('x-current-user-id');

    try {
      await sendRecruitmentEmail({
        to, cc, subject, html,
        templateId: typeof b.template_id === 'string' ? b.template_id : null,
        sentBy: senderId,
      });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Gửi email thất bại' }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/users/send-account-email error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
