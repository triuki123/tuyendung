import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import * as offboarding from '@/lib/services/offboardingService';

export const dynamic = 'force-dynamic';

/** GET /api/hr/offboarding/[id]/attachments — danh sách hồ sơ nghỉ việc đính kèm. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkUnitAccess(request, 'hr-offboarding', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const data = await offboarding.listProcessAttachments(params.id);
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error('GET /api/hr/offboarding attachments error:', err);
    return NextResponse.json({ error: err?.message || 'Lỗi server' }, { status: 500 });
  }
}

/** POST /api/hr/offboarding/[id]/attachments — upload 1 hồ sơ (multipart, field "file"). */
import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const POST = withRecruitmentUpdate(POSTHandler, 'Offboarding', '/nguon-nhan-luc/offboarding');
async function POSTHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkUnitAccess(request, 'hr-offboarding', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const form = await request.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Thiếu tệp' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadedBy = request.headers.get('x-current-user-id');
    const data = await offboarding.addProcessAttachment(
      params.id,
      { fileName: file.name, mimeType: file.type || null, buffer },
      uploadedBy
    );
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error('POST /api/hr/offboarding attachments error:', err);
    return NextResponse.json({ error: err?.message || 'Lỗi server' }, { status: 400 });
  }
}
