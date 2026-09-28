import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import * as offboarding from '@/lib/services/offboardingService';

export const dynamic = 'force-dynamic';

/** GET /api/hr/offboarding/[id]/attachments/[docId]/content — tải/xem tệp đính kèm. */
export async function GET(request: NextRequest, { params }: { params: { id: string; docId: string } }) {
  try {
    if (!checkUnitAccess(request, 'hr-offboarding', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const doc = await offboarding.getProcessAttachmentContent(params.id, params.docId);
    if (!doc) return NextResponse.json({ error: 'Tệp không tồn tại' }, { status: 404 });

    return new NextResponse(doc.content as any, {
      headers: {
        'Content-Type': doc.mime_type || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${encodeURIComponent(doc.file_name)}"`,
      },
    });
  } catch (err: any) {
    console.error('GET /api/hr/offboarding attachment content error:', err);
    return NextResponse.json({ error: err?.message || 'Lỗi server' }, { status: 500 });
  }
}
