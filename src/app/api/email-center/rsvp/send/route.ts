import { NextRequest, NextResponse } from 'next/server';
import { getTemplate, render } from '@/lib/services/emailCenterService';
import { sendRsvpBlast } from '@/lib/services/rsvpService';
import { getEmailCenterActions } from '../../_perm';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/email-center/rsvp/send — gửi đợt RSVP nội bộ qua Telegram.
 * Body JSON:
 *  { templateId, eventKey, eventTitle, personIds: string[], variables: {} }
 * Vars sẽ được áp cho toàn đợt (subject + body chung).
 */
export async function POST(request: NextRequest) {
  try {
    const acts = getEmailCenterActions(request);
    if (acts === null) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!acts.includes('internal') && !acts.includes('manage')) {
      return NextResponse.json({ error: 'Không có quyền gửi tab Nội Bộ' }, { status: 403 });
    }
    const body = await request.json();
    const templateId = String(body?.templateId || '');
    const personIds: string[] = Array.isArray(body?.personIds) ? body.personIds : [];
    const eventKey = String(body?.eventKey || '').trim();
    const eventTitle = String(body?.eventTitle || '').trim();
    const yesLabel = typeof body?.yesLabel === 'string' ? body.yesLabel : null;
    const noLabel = typeof body?.noLabel === 'string' ? body.noLabel : null;
    const content = typeof body?.content === 'string' ? body.content : null;
    const imageUrl = typeof body?.imageUrl === 'string' ? body.imageUrl : null;
    const vars = body?.variables || {};
    if (!templateId) return NextResponse.json({ error: 'Thiếu templateId' }, { status: 400 });
    if (!eventKey || !eventTitle) return NextResponse.json({ error: 'Thiếu eventKey/eventTitle' }, { status: 400 });
    if (personIds.length === 0) return NextResponse.json({ error: 'Chưa chọn người nhận' }, { status: 400 });

    const t = await getTemplate(templateId);
    if (!t) return NextResponse.json({ error: 'Template không tồn tại' }, { status: 404 });
    if (t.category !== 'internal') return NextResponse.json({ error: 'Chỉ template Nội Bộ mới hỗ trợ RSVP' }, { status: 400 });

    const subject = render(t.subject_tpl, vars);
    const html_body = render(t.body_html_tpl, vars);
    const sentBy = request.headers.get('x-current-user-id');

    const result = await sendRsvpBlast({
      event_key: eventKey,
      event_title: eventTitle || subject,
      template_id: t.id.startsWith('hr_') ? null : t.id,
      subject, html_body, personIds, sent_by: sentBy, yesLabel, noLabel, content, imageUrl,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error('POST /api/email-center/rsvp/send error:', err);
    return NextResponse.json({ error: err?.message || 'Lỗi server' }, { status: 500 });
  }
}
