import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import * as offboarding from '@/lib/services/offboardingService';

export const dynamic = 'force-dynamic';

/** PUT /api/hr/offboarding/templates/[id] — sửa đầu mục (title/description/category/enabled/required/sort_order). */
import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const PUT = withRecruitmentUpdate(PUTHandler, 'Offboarding', '/nguon-nhan-luc/offboarding');
async function PUTHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkUnitAccess(request, 'hr-offboarding', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const body = await request.json();
    const data = await offboarding.updateTemplate(params.id, body);
    if (!data) return NextResponse.json({ error: 'Đầu mục không tồn tại' }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error('PUT /api/hr/offboarding/templates/[id] error:', err);
    return NextResponse.json({ error: err?.message || 'Lỗi server' }, { status: 400 });
  }
}

/** DELETE /api/hr/offboarding/templates/[id] — xóa đầu mục (đầu mục hệ thống chỉ tắt được). */
export const DELETE = withRecruitmentUpdate(DELETEHandler, 'Offboarding', '/nguon-nhan-luc/offboarding');
async function DELETEHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkUnitAccess(request, 'hr-offboarding', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    await offboarding.deleteTemplate(params.id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('DELETE /api/hr/offboarding/templates/[id] error:', err);
    return NextResponse.json({ error: err?.message || 'Lỗi server' }, { status: 400 });
  }
}
