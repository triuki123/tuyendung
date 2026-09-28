import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/hrDocumentReplaceService';
import { canManageContracts, canViewEmployeeData } from '@/lib/services/contractPermissionService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/hr-documents/replace-requests/[reqId]/file
 * Phục vụ nội dung tệp MỚI trong yêu cầu đổi (để preview/download).
 * Quyền: C&B (canView) hoặc chính người gửi yêu cầu.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { reqId: string } }
) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const activeCompany = request.headers.get('x-current-user-company') || undefined;
    const req = await svc.getRequest(params.reqId);
    if (!req) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });

    const isSelf = req.requested_by.toLowerCase() === userId.toLowerCase();
    const isCB = await canManageContracts(userId, 'view', activeCompany);
    if (!isSelf && !isCB) {
      // Cũng cho phép nếu là quản lý của người gửi
      const canView = req.employee_id ? await canViewEmployeeData(userId, req.employee_id, activeCompany) : false;
      if (!canView) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }

    const file = await svc.getNewFileContent(params.reqId);
    if (!file) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });

    const isDownload = request.nextUrl.searchParams.get('download') === '1';
    const disposition = isDownload
      ? `attachment; filename="${encodeURIComponent(file.file_name)}"`
      : `inline; filename="${encodeURIComponent(file.file_name)}"`;

    return new NextResponse(new Uint8Array(file.content), {
      headers: {
        'Content-Type': file.mime_type || 'application/octet-stream',
        'Content-Disposition': disposition,
        'Cache-Control': 'private, no-cache',
      },
    });
  } catch (err) {
    console.error('GET replace-requests/[reqId]/file error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
