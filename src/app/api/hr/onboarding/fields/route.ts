import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import * as onboarding from '@/lib/services/onboardingService';

export const dynamic = 'force-dynamic';

/** GET /api/hr/onboarding/fields — cấu hình field của biểu mẫu Onboarding cố định */
export async function GET(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'hr-onboarding', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const data = await onboarding.listFormFields(onboarding.ONBOARDING_FORM_ID, false);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/hr/onboarding/fields error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * PUT /api/hr/onboarding/fields — cập nhật hàng loạt cấu hình field Onboarding
 * Body: { updates: [{ id, enabled?, required?, label?, help_text?, sort_order? }] }
 */
import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const PUT = withRecruitmentUpdate(PUTHandler, 'Onboarding', '/nguon-nhan-luc/onboarding');
async function PUTHandler(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'hr-onboarding', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const body = await request.json();
    if (!Array.isArray(body.updates) || body.updates.length === 0) {
      return NextResponse.json({ error: 'Thiếu danh sách cập nhật' }, { status: 400 });
    }
    await onboarding.updateFormFields(body.updates);
    const data = await onboarding.listFormFields(onboarding.ONBOARDING_FORM_ID, false);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('PUT /api/hr/onboarding/fields error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
