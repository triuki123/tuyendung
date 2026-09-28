import { NextRequest, NextResponse } from 'next/server';
import { getTemplate, render } from '@/lib/services/emailCenterService';
import { getEmailCenterActions } from '../_perm';

export const dynamic = 'force-dynamic';

/** POST /api/email-center/preview — render subject+html preview cho 1 bộ variables. */
export async function POST(request: NextRequest) {
  try {
    const acts = getEmailCenterActions(request);
    if (acts === null) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const body = await request.json();
    const t = await getTemplate(String(body?.templateId || ''));
    if (!t) return NextResponse.json({ error: 'Template không tồn tại' }, { status: 404 });
    if (!acts.includes(t.category) && !acts.includes('manage')) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const vars = body?.variables || {};
    // subjectOverride (nếu có) thay cho subject_tpl của template — vẫn render {{biến}} bình thường.
    const subjectTpl = typeof body?.subjectOverride === 'string' && body.subjectOverride.trim()
      ? body.subjectOverride : t.subject_tpl;
    return NextResponse.json({ success: true, data: { subject: render(subjectTpl, vars), html: render(t.body_html_tpl, vars) } });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Lỗi' }, { status: 500 });
  }
}
