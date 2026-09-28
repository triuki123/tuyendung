import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { listCandidatesForRequisition } from '@/lib/services/hrPoolService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/hr/requisitions/:id/candidates
 * Danh sách ứng viên (rút gọn, KHÔNG kèm liên hệ) đã được bộ phận Tuyển Dụng
 * liên kết với yêu cầu này. Dành cho NGƯỜI YÊU CẦU theo dõi tiến độ.
 *
 * Quyền: ai xem được yêu cầu tuyển dụng thì xem được ứng viên của nó —
 *  manager/admin/super_admin, hoặc có quyền view của recruitment-order / hr-requisitions.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const role = request.headers.get('x-current-user-role') || '';
    const allowed =
      role === 'manager' || role === 'admin' || role === 'super_admin' ||
      checkUnitAccess(request, 'recruitment-order', 'view') ||
      checkUnitAccess(request, 'hr-requisitions', 'view') ||
      checkUnitAccess(request, 'hr-cv', 'view');
    if (!allowed) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const data = await listCandidatesForRequisition(params.id);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/hr/requisitions/:id/candidates error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
