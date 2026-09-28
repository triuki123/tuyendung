import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import * as onboarding from '@/lib/services/onboardingService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/hr/onboarding/:id/reject — từ chối bài nộp (QTV hoặc Tuyển dụng)
 * Body: { reason }
 */
import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const POST = withRecruitmentUpdate(POSTHandler, 'Onboarding', '/nguon-nhan-luc/onboarding');
async function POSTHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (
      !checkUnitAccess(request, 'users', 'approve') &&
      !checkUnitAccess(request, 'hr-onboarding', 'approve')
    ) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const userId = request.headers.get('x-current-user-id') || '';
    const body = await request.json().catch(() => ({}));
    const data = await onboarding.rejectSubmission(params.id, userId, body.reason || '');
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('POST /api/hr/onboarding/:id/reject error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi server' },
      { status: 500 }
    );
  }
}
