import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/hrDocumentReplaceService';
import { canManageContracts, getContractVisibility } from '@/lib/services/contractPermissionService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/hr-documents/replace-requests
 *   ?scope=pending  → C&B: tất cả yêu cầu đang chờ duyệt
 *   ?scope=mine     → nhân viên: yêu cầu do chính họ gửi
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const scope = request.nextUrl.searchParams.get('scope') || 'mine';

    const activeCompany = request.headers.get('x-current-user-company') || undefined;

    if (scope === 'pending') {
      if (!(await canManageContracts(userId, 'view', activeCompany))) {
        return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
      }
      const visibility = await getContractVisibility(userId, activeCompany);
      const data = await svc.listPendingRequests();
      const scoped = visibility.all
        ? data
        : data.filter((item) =>
            item.employee_id ? (visibility.allowedEmployeeIds ?? []).includes(String(item.employee_id).toLowerCase()) : false
          );
      return NextResponse.json({ success: true, data: scoped });
    }

    // scope === 'mine'
    const data = await svc.listRequestsByUser(userId);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/hr-documents/replace-requests error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
