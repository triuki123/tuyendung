import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import * as offboarding from '@/lib/services/offboardingService';

export const dynamic = 'force-dynamic';

/** DELETE /api/hr/offboarding/[id]/attachments/[docId] — xoá (mềm) 1 tệp đính kèm. */
import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const DELETE = withRecruitmentUpdate(DELETEHandler, 'Offboarding', '/nguon-nhan-luc/offboarding');
async function DELETEHandler(request: NextRequest, { params }: { params: { id: string; docId: string } }) {
  try {
    if (!checkUnitAccess(request, 'hr-offboarding', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const ok = await offboarding.deleteProcessAttachment(params.id, params.docId);
    if (!ok) return NextResponse.json({ error: 'Tệp không tồn tại' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('DELETE /api/hr/offboarding attachment error:', err);
    return NextResponse.json({ error: err?.message || 'Lỗi server' }, { status: 400 });
  }
}
