import { NextRequest, NextResponse } from 'next/server';
import { listHrAuditFeed, HrEntityType } from '@/lib/services/hrAuditService';
import { canManageContracts } from '@/lib/services/contractPermissionService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/hr-audit — lịch sử xử lý TOÀN MODULE Quản Lý Hồ Sơ (tab "Lịch sử").
 * Query: entityType, action, search, limit, offset.
 * Đây là vết kiểm toán nhân sự → chỉ người quản lý hồ sơ (hr.edit) mới xem được toàn bộ.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const activeCompany = request.headers.get('x-current-user-company') || undefined;
    if (!(await canManageContracts(userId, 'edit', activeCompany))) {
      return NextResponse.json({ error: 'Không có quyền xem lịch sử toàn module' }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const data = await listHrAuditFeed({
      entityType: (sp.get('entityType') as HrEntityType | 'all') || 'all',
      action: sp.get('action') || 'all',
      search: sp.get('search') || undefined,
      limit: Number(sp.get('limit')) || 50,
      offset: Number(sp.get('offset')) || 0,
    });

    return NextResponse.json({ success: true, ...data });
  } catch (err) {
    console.error('GET /api/hr-audit error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
