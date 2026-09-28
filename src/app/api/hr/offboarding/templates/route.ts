import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import * as offboarding from '@/lib/services/offboardingService';

export const dynamic = 'force-dynamic';

/** GET /api/hr/offboarding/templates — cấu hình checklist nghỉ việc. */
export async function GET(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'hr-offboarding', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const data = await offboarding.listTemplates();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/hr/offboarding/templates error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST /api/hr/offboarding/templates — thêm đầu mục checklist. */
import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const POST = withRecruitmentUpdate(POSTHandler, 'Offboarding', '/nguon-nhan-luc/offboarding');
async function POSTHandler(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'hr-offboarding', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const body = await request.json();
    if (!body.title?.trim()) {
      return NextResponse.json({ error: 'Thiếu tên đầu mục' }, { status: 400 });
    }
    const data = await offboarding.createTemplate({
      title: body.title,
      description: body.description,
      category: body.category,
      required: body.required,
    });
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error('POST /api/hr/offboarding/templates error:', err);
    return NextResponse.json({ error: err?.message || 'Lỗi server' }, { status: 400 });
  }
}
