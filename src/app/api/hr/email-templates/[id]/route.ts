import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { getTemplate, updateTemplate, deleteTemplate } from '@/lib/services/emailTemplateService';

export const dynamic = 'force-dynamic';

function canEdit(request: NextRequest): boolean {
  const role = request.headers.get('x-current-user-role') || '';
  return role === 'admin' || role === 'super_admin' || checkUnitAccess(request, 'hr-cv', 'edit');
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const role = request.headers.get('x-current-user-role') || '';
    const ok = role === 'admin' || role === 'super_admin' ||
      checkUnitAccess(request, 'hr-cv', 'view') || checkUnitAccess(request, 'hr-requisitions', 'view');
    if (!ok) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const tpl = await getTemplate(params.id);
    if (!tpl) return NextResponse.json({ error: 'Không tìm thấy mẫu' }, { status: 404 });
    return NextResponse.json({ success: true, data: tpl });
  } catch (err) {
    console.error('GET email-template error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const PUT = withRecruitmentUpdate(PUTHandler, 'Mẫu email', '/nguon-nhan-luc/email-tuyen-dung');
async function PUTHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!canEdit(request)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const body = await request.json();
    const updated = await updateTemplate(params.id, {
      name: body.name, category: body.category, subject: body.subject,
      bodyHtml: body.body_html, isActive: body.is_active,
    });
    if (!updated) return NextResponse.json({ error: 'Không tìm thấy mẫu' }, { status: 404 });
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error('PUT email-template error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export const DELETE = withRecruitmentUpdate(DELETEHandler, 'Mẫu email', '/nguon-nhan-luc/email-tuyen-dung');
async function DELETEHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!canEdit(request)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const ok = await deleteTemplate(params.id);
    if (!ok) return NextResponse.json({ error: 'Không tìm thấy mẫu' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE email-template error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
