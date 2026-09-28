import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { listTemplates, createTemplate } from '@/lib/services/emailTemplateService';

export const dynamic = 'force-dynamic';

function canView(request: NextRequest): boolean {
  const role = request.headers.get('x-current-user-role') || '';
  return role === 'admin' || role === 'super_admin' ||
    checkUnitAccess(request, 'hr-cv', 'view') || checkUnitAccess(request, 'hr-requisitions', 'view');
}
function canEdit(request: NextRequest): boolean {
  const role = request.headers.get('x-current-user-role') || '';
  return role === 'admin' || role === 'super_admin' || checkUnitAccess(request, 'hr-cv', 'edit');
}

/** GET — danh sách mẫu email (?active=1 để chỉ lấy mẫu bật). */
export async function GET(request: NextRequest) {
  try {
    if (!canView(request)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const onlyActive = request.nextUrl.searchParams.get('active') === '1';
    return NextResponse.json({ success: true, data: await listTemplates(onlyActive) });
  } catch (err) {
    console.error('GET email-templates error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST — tạo mẫu mới. */
import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const POST = withRecruitmentUpdate(POSTHandler, 'Mẫu email', '/nguon-nhan-luc/email-tuyen-dung');
async function POSTHandler(request: NextRequest) {
  try {
    if (!canEdit(request)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const body = await request.json();
    if (!body.name?.trim() || !body.subject?.trim() || !body.body_html?.trim()) {
      return NextResponse.json({ error: 'Thiếu tên / tiêu đề / nội dung mẫu' }, { status: 400 });
    }
    const created = await createTemplate({
      name: body.name.trim(), category: body.category, subject: body.subject,
      bodyHtml: body.body_html, createdBy: request.headers.get('x-current-user-id'),
    });
    return NextResponse.json({ success: true, data: created });
  } catch (err) {
    console.error('POST email-templates error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
