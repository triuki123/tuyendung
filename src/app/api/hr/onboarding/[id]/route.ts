import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import * as onboarding from '@/lib/services/onboardingService';

export const dynamic = 'force-dynamic';

/** GET /api/hr/onboarding/:id — chi tiết bài nộp + hồ sơ đính kèm (nháp) */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (
      !checkUnitAccess(request, 'hr-onboarding', 'view') &&
      !checkUnitAccess(request, 'users', 'approve')
    ) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const submission = await onboarding.getSubmission(params.id);
    if (!submission) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    const attachments = await onboarding.listSubmissionAttachments(params.id);
    return NextResponse.json({ success: true, data: { ...submission, attachments } });
  } catch (err) {
    console.error('GET /api/hr/onboarding/:id error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * PUT /api/hr/onboarding/:id — Tuyển dụng chuẩn hóa thông tin
 * Body: { data: {...}, candidate_name? }
 */
import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const PUT = withRecruitmentUpdate(PUTHandler, 'Onboarding', '/nguon-nhan-luc/onboarding');
async function PUTHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkUnitAccess(request, 'hr-onboarding', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const body = await request.json();
    if (!body.data || typeof body.data !== 'object') {
      return NextResponse.json({ error: 'Thiếu dữ liệu' }, { status: 400 });
    }
    const updated = await onboarding.updateSubmissionData(params.id, body.data, body.candidate_name);
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error('PUT /api/hr/onboarding/:id error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi server' },
      { status: 500 }
    );
  }
}
