import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { toggleRequisitionFollow } from '@/lib/services/requisitionService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/hr/requisitions/:id/follow — bật/tắt theo dõi cho CHÍNH người đang đăng nhập.
 * Chỉ cần quyền 'view' (theo dõi không phải hành vi sửa nghiệp vụ).
 */
import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const POST = withRecruitmentUpdate(POSTHandler, 'Yêu cầu tuyển dụng', '/nguon-nhan-luc/yeu-cau-tuyen-dung');
async function POSTHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const canView =
      checkUnitAccess(request, 'recruitment-order', 'view') ||
      checkUnitAccess(request, 'hr-requisitions', 'view');
    if (!canView) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const { requisition, following } = await toggleRequisitionFollow(params.id, userId);
    return NextResponse.json({ success: true, data: requisition, following });
  } catch (err) {
    console.error('POST /api/hr/requisitions/:id/follow error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Lỗi server' }, { status: 500 });
  }
}
