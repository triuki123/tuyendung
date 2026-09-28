import { NextRequest, NextResponse } from 'next/server';
import { approveRequisition } from '@/lib/services/requisitionService';
import { queryOne } from '@/lib/db';
import { getRequisitionById } from '@/lib/services/requisitionService';
import { getEffectiveContext } from '@/lib/services/userCompanyService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/hr/requisitions/:id/approve
 * Chỉ tài khoản thỏa MỘT trong hai mới được phê duyệt:
 *   - role = 'super_admin' (chủ hệ thống, luôn qua), HOẶC
 *   - role = 'admin' VÀ được cấp quyền 'approve' (Phê duyệt) trong module 'hr-requisitions'.
 * Quyền đọc thẳng từ DB theo userId — không tin header (chống spoof).
 */
import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const POST = withRecruitmentUpdate(POSTHandler, 'Yêu cầu tuyển dụng', '/nguon-nhan-luc/yeu-cau-tuyen-dung');
async function POSTHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id') || null;
    if (!userId) {
      return NextResponse.json({ error: 'Thiếu thông tin người dùng' }, { status: 401 });
    }

    const u = await queryOne<{ role: string; has_approve: boolean }>(
      `SELECT role,
              (module_permissions->'hr-requisitions' @> '"approve"') AS has_approve
         FROM users
        WHERE id::text = $1 AND status = 'active'`,
      [userId]
    );
    if (!u) {
      return NextResponse.json({ error: 'Tài khoản không hợp lệ' }, { status: 403 });
    }

    const allowed = u.role === 'super_admin' || (u.role === 'admin' && u.has_approve);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Bạn cần Role Admin và quyền "Phê duyệt" trong Yêu Cầu Tuyển Dụng (xử lý) để duyệt' },
        { status: 403 }
      );
    }

    const activeCompany = request.headers.get('x-current-user-company');
    const effective = userId ? await getEffectiveContext(userId, activeCompany || null) : null;
    const req = await getRequisitionById(params.id);
    if (!req) {
      return NextResponse.json({ error: 'Khong tim thay yeu cau' }, { status: 404 });
    }
    if (effective?.role === 'admin' && effective.company_id !== req.company_id) {
      return NextResponse.json({ error: 'Khong co quyen duyet yeu cau nay' }, { status: 403 });
    }

    const data = await approveRequisition(params.id, userId);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('POST /api/hr/requisitions/:id/approve error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Lỗi server' }, { status: 500 });
  }
}
