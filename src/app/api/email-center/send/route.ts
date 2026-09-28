import { NextRequest, NextResponse } from 'next/server';
import { getTemplate, sendEmail, render, type AttachmentInput } from '@/lib/services/emailCenterService';
import { getEmailCenterActions } from '../_perm';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/email-center/send
 * Body (multipart/form-data):
 *   templateId: string
 *   recipients: JSON string [{to, cc?, bcc?, variables}]  (mỗi phần tử = 1 email cá nhân hóa)
 *   attachments: file[]   (dùng chung cho toàn bộ recipients)
 * Trả về: { sent: n, failed: n, results: [{to, status, error?}] }
 */
export async function POST(request: NextRequest) {
  try {
    const acts = getEmailCenterActions(request);
    if (acts === null) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const form = await request.formData();
    const templateId = String(form.get('templateId') || '');
    const senderId = String(form.get('senderId') || '') || null;
    const subjectOverrideRaw = String(form.get('subjectOverride') || '').trim();
    const recipientsRaw = String(form.get('recipients') || '[]');
    let recipients: Array<{ to: string; cc?: string; bcc?: string; variables: Record<string, any>; subject?: string; html?: string }>;
    try { recipients = JSON.parse(recipientsRaw); } catch { return NextResponse.json({ error: 'recipients không hợp lệ' }, { status: 400 }); }
    if (!Array.isArray(recipients) || recipients.length === 0) return NextResponse.json({ error: 'Thiếu người nhận' }, { status: 400 });

    const t = await getTemplate(templateId);
    if (!t) return NextResponse.json({ error: 'Template không tồn tại' }, { status: 404 });
    if (!acts.includes(t.category)) return NextResponse.json({ error: 'Không có quyền gửi loại email này' }, { status: 403 });

    // Đính kèm
    const files = form.getAll('attachments') as File[];
    const attachments: AttachmentInput[] = [];
    for (const f of files) {
      if (!f || typeof (f as any).arrayBuffer !== 'function') continue;
      const buf = Buffer.from(await (f as File).arrayBuffer());
      attachments.push({ filename: (f as File).name, mime: (f as File).type || 'application/octet-stream', content: buf });
    }

    const sentBy = request.headers.get('x-current-user-id');
    const results: any[] = [];
    let sent = 0, failed = 0;
    for (const r of recipients) {
      const vars = r.variables || {};
      // Ưu tiên: subject đã sửa tay ở Xem trước > ô Tiêu đề tùy chỉnh (render biến) > subject_tpl.
      const subjectTpl = subjectOverrideRaw || t.subject_tpl;
      const subject = (typeof r.subject === 'string' && r.subject.trim()) ? r.subject : render(subjectTpl, vars);
      const html = (typeof r.html === 'string' && r.html.trim()) ? r.html : render(t.body_html_tpl, vars);
      try {
        await sendEmail({
          templateId: t.id.startsWith('hr_') ? null : t.id, category: t.category, senderId: senderId || t.default_sender_id || null,
          to: r.to, cc: r.cc || null, bcc: r.bcc || null,
          subject, html, variables: vars, attachments, sentBy,
        });
        sent++;
        results.push({ to: r.to, status: 'sent' });
      } catch (err: any) {
        failed++;
        results.push({ to: r.to, status: 'failed', error: err?.message || 'lỗi' });
      }
    }
    return NextResponse.json({ success: true, sent, failed, results });
  } catch (err: any) {
    console.error('POST /api/email-center/send error:', err);
    return NextResponse.json({ error: err?.message || 'Lỗi server' }, { status: 500 });
  }
}
