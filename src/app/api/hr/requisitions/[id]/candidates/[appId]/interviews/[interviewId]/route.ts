import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { getApplication } from '@/lib/services/applicationService';
import { getInterview, updateInterviewStatus } from '@/lib/services/interviewService';

export const dynamic = 'force-dynamic';

function canView(request: NextRequest): boolean {
  const role = request.headers.get('x-current-user-role') || '';
  return (
    role === 'manager' || role === 'admin' || role === 'super_admin' ||
    checkUnitAccess(request, 'recruitment-order', 'view') ||
    checkUnitAccess(request, 'hr-requisitions', 'view') ||
    checkUnitAccess(request, 'hr-cv', 'view')
  );
}

/** PUT — đổi trạng thái lịch phỏng vấn: done (hoàn tất) | cancelled (huỷ). */
import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const PUT = withRecruitmentUpdate(PUTHandler, 'Yêu cầu tuyển dụng', '/nguon-nhan-luc/yeu-cau-tuyen-dung');
async function PUTHandler(request: NextRequest, { params }: { params: { id: string; appId: string; interviewId: string } }) {
  try {
    if (!canView(request)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const app = await getApplication(params.appId, params.id);
    if (!app) return NextResponse.json({ error: 'Không tìm thấy ứng viên trong yêu cầu này' }, { status: 404 });

    const itv = await getInterview(params.interviewId);
    if (!itv || itv.application_id !== params.appId) {
      return NextResponse.json({ error: 'Không tìm thấy lịch phỏng vấn' }, { status: 404 });
    }

    const body = await request.json();
    const status = body.status;
    if (status !== 'done' && status !== 'cancelled') {
      return NextResponse.json({ error: 'status phải là done hoặc cancelled' }, { status: 400 });
    }
    const updated = await updateInterviewStatus(params.interviewId, status);
    if (!updated) return NextResponse.json({ error: 'Lịch đã xử lý hoặc không tồn tại' }, { status: 409 });
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error('PUT interview error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
