import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import * as onboarding from '@/lib/services/onboardingService';
import { getEffectiveContext } from '@/lib/services/userCompanyService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/hr/onboarding/:id/approve — QTV duyệt: tạo user chính thức
 * Body: { working_email, password, role?, employment_type_id?, employment_type?, manager_id? }
 */
import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const POST = withRecruitmentUpdate(POSTHandler, 'Onboarding', '/nguon-nhan-luc/onboarding');
async function POSTHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const adminId = request.headers.get('x-current-user-id') || '';
    const activeCompany = request.headers.get('x-current-user-company') || undefined;

    // Lấy role thực từ DB theo công ty active thay vì tin vào header
    const ctx = adminId ? await getEffectiveContext(adminId, activeCompany) : null;
    const role = ctx?.role || '';

    if (role !== 'super_admin' && role !== 'admin' && !checkUnitAccess(request, 'users', 'approve')) {
      return NextResponse.json({ error: 'Không có quyền duyệt người dùng' }, { status: 403 });
    }

    const body = await request.json();

    const result = await onboarding.approveSubmission(params.id, adminId, {
      workingEmail: body.working_email,
      password: body.password,
      role: role === 'super_admin' ? body.role : 'user',
      employment_type_id: body.employment_type_id || undefined,
      employment_type: body.employment_type || undefined,
      manager_id: body.manager_id || undefined,
    });

    return NextResponse.json({ success: true, data: result.submission, user_id: result.userId });
  } catch (err) {
    console.error('POST /api/hr/onboarding/:id/approve error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi server' },
      { status: 500 }
    );
  }
}
