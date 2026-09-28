import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import * as pool from '@/lib/services/hrPoolService';
import { getApplication } from '@/lib/services/applicationService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/hr/requisitions/:id/candidates/:appId/cv
 * Xem nhanh/tải file CV cho NGƯỜI YÊU CẦU (không cần quyền hr-cv riêng — chỉ cần
 * xem được yêu cầu tuyển dụng). Chỉ phục vụ CV thuộc đúng application của yêu cầu này.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string; appId: string } }) {
  try {
    const role = request.headers.get('x-current-user-role') || '';
    const allowed =
      role === 'manager' || role === 'admin' || role === 'super_admin' ||
      checkUnitAccess(request, 'recruitment-order', 'view') ||
      checkUnitAccess(request, 'hr-requisitions', 'view') ||
      checkUnitAccess(request, 'hr-cv', 'view');
    if (!allowed) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

    const app = await getApplication(params.appId, params.id);
    if (!app) return NextResponse.json({ error: 'Không tìm thấy ứng viên trong yêu cầu này' }, { status: 404 });

    const doc = await pool.getCvContent(app.cv_id);
    if (!doc) return NextResponse.json({ error: 'Không tìm thấy tệp' }, { status: 404 });
    return new NextResponse(doc.content as any, {
      headers: {
        'Content-Type': doc.mime_type || 'application/octet-stream',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(doc.file_name)}`,
      },
    });
  } catch (err) {
    console.error('GET /api/hr/requisitions/:id/candidates/:appId/cv error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
