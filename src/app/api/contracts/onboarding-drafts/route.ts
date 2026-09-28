import { NextRequest, NextResponse } from 'next/server';
import { runOnboardingDraftsForEmployee } from '@/lib/services/onboardingContractDraftService';
import { canManageContracts } from '@/lib/services/contractPermissionService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/contracts/onboarding-drafts — tạo NGAY các bản nháp HĐ onboarding cho 1 nhân sự
 * (nút thủ công ở Onboarding), không chờ scheduler. Idempotent: loại đã có thì bỏ qua.
 * Body: { employee_id }. Cần quyền hr.create.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!(await canManageContracts(userId, 'create'))) {
      return NextResponse.json({ error: 'Không có quyền tạo hợp đồng' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const employeeId = String(body.employee_id || '').trim();
    if (!employeeId) return NextResponse.json({ error: 'Thiếu nhân viên' }, { status: 400 });

    const result = await runOnboardingDraftsForEmployee(employeeId);
    if (result.hires === 0) {
      return NextResponse.json({ error: 'Không tìm thấy nhân sự đang hoạt động' }, { status: 404 });
    }
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('POST /api/contracts/onboarding-drafts error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
