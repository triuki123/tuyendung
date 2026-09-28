import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import * as onboarding from '@/lib/services/onboardingService';

export const dynamic = 'force-dynamic';

/** POST /api/hr/onboarding/:id/confirm — Tuyển dụng xác nhận thông tin đã chuẩn hóa */
import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const POST = withRecruitmentUpdate(POSTHandler, 'Onboarding', '/nguon-nhan-luc/onboarding');
async function POSTHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkUnitAccess(request, 'hr-onboarding', 'approve')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const userId = request.headers.get('x-current-user-id') || '';
    const data = await onboarding.confirmSubmission(params.id, userId);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('POST /api/hr/onboarding/:id/confirm error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi server' },
      { status: 500 }
    );
  }
}
