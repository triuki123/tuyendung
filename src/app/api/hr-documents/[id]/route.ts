import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/hrDocumentService';
import {
  canManageContracts,
  canViewEmployeeData,
} from '@/lib/services/contractPermissionService';
import { checkBmhsGate } from '@/lib/services/bmhsService';
import { logHrRecord } from '@/lib/services/hrAuditService';

export const dynamic = 'force-dynamic';

/** GET /api/hr-documents/[id] — tải nội dung hồ sơ (BYTEA). */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const activeCompany = request.headers.get('x-current-user-company') || undefined;
    const file = await svc.getHrDocumentContent(params.id);
    if (!file) return NextResponse.json({ error: 'Không tìm thấy tệp' }, { status: 404 });
    if (!(await canViewEmployeeData(userId, file.employee_id, activeCompany))) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    // Cổng Bảo Mật Hồ Sơ (BMHS): hồ sơ đã khóa → cần vé mở khóa (nhập mật khẩu).
    const gate = await checkBmhsGate(userId, file.employee_id, request.headers.get('x-bmhs-token'));
    if (!gate.allowed) {
      return NextResponse.json({ error: 'Hồ sơ được bảo mật — cần nhập mật khẩu', requireBmhs: true, employeeId: file.employee_id }, { status: 403 });
    }

    const disposition = request.nextUrl.searchParams.get('download') === '1' ? 'attachment' : 'inline';
    return new NextResponse(new Uint8Array(file.content), {
      status: 200,
      headers: {
        'Content-Type': file.mime_type || 'application/octet-stream',
        'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(file.file_name)}`,
      },
    });
  } catch (err) {
    console.error('GET /api/hr-documents/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE — chủ hồ sơ hoặc C&B (hr.edit) được xóa. */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const activeCompany = request.headers.get('x-current-user-company') || undefined;
    const ownerId = await svc.getHrDocumentOwner(params.id);
    if (!ownerId) return NextResponse.json({ error: 'Không tìm thấy tệp' }, { status: 404 });

    const isSelf = ownerId.toLowerCase() === userId.toLowerCase();
    if (!isSelf && !(await canManageContracts(userId, 'edit', activeCompany))) {
      return NextResponse.json({ error: 'Không có quyền xóa hồ sơ này' }, { status: 403 });
    }

    await svc.softDeleteHrDocument(params.id);

    await logHrRecord({
      entityType: 'hr_document', entityId: params.id, action: 'delete',
      details: 'Xóa tài liệu hồ sơ',
      performedBy: userId,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/hr-documents/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
