import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import * as pool from '@/lib/services/hrPoolService';

export const dynamic = 'force-dynamic';

/** POST /api/hr/cv/:id/applications — liên kết CV với yêu cầu tuyển dụng */
import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const POST = withRecruitmentUpdate(POSTHandler, 'Kho ứng viên', '/nguon-nhan-luc/kho-ung-vien');
async function POSTHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkUnitAccess(request, 'hr-cv', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const body = await request.json();
    const requisitionId = (body.requisition_id as string)?.trim();
    if (!requisitionId) return NextResponse.json({ error: 'Thiếu yêu cầu tuyển dụng' }, { status: 400 });
    const data = await pool.linkRequisition(
      params.id, requisitionId,
      typeof body.note === 'string' ? body.note : null,
      request.headers.get('x-current-user-id')
    );
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('POST /api/hr/cv/:id/applications error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE /api/hr/cv/:id/applications?application_id= — gỡ liên kết */
export const DELETE = withRecruitmentUpdate(DELETEHandler, 'Kho ứng viên', '/nguon-nhan-luc/kho-ung-vien');
async function DELETEHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkUnitAccess(request, 'hr-cv', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const appId = request.nextUrl.searchParams.get('application_id');
    if (!appId) return NextResponse.json({ error: 'Thiếu application_id' }, { status: 400 });
    const ok = await pool.unlinkRequisition(params.id, appId);
    if (!ok) return NextResponse.json({ error: 'Không tìm thấy liên kết' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/hr/cv/:id/applications error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
