import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/hrDocumentService';
import {
  canManageContracts,
  canViewEmployeeData,
  getContractVisibility,
} from '@/lib/services/contractPermissionService';
import { checkBmhsGate } from '@/lib/services/bmhsService';
import { logHrRecord } from '@/lib/services/hrAuditService';

export const dynamic = 'force-dynamic';
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

/** GET /api/hr-documents — hồ sơ nhân sự.
 *  ?employee_id=xxx  → hồ sơ 1 nhân viên (mặc định chính mình)
 *  ?all=1            → tất cả (chỉ HR admin); kết hợp ?doc_type_id=xxx để lọc
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const activeCompany = request.headers.get('x-current-user-company') || undefined;
    const sp = request.nextUrl.searchParams;
    const allMode = sp.get('all') === '1';

    if (allMode) {
      if (!(await canManageContracts(userId, 'view', activeCompany))) {
        return NextResponse.json({ error: 'Không có quyền xem toàn bộ hồ sơ' }, { status: 403 });
      }
      const visibility = await getContractVisibility(userId, activeCompany);
      const data = await svc.listAllHrDocuments({
        docTypeId: sp.get('doc_type_id') || undefined,
        employeeIds: visibility.all ? undefined : (visibility.allowedEmployeeIds ?? []),
      });
      return NextResponse.json({ success: true, data });
    }

    const employeeId = sp.get('employee_id') || userId;
    if (!(await canViewEmployeeData(userId, employeeId, activeCompany))) {
      return NextResponse.json({ error: 'Không có quyền xem hồ sơ này' }, { status: 403 });
    }
    // Cổng BMHS: xem hồ sơ (tài liệu) của 1 nhân sự đã khóa → cần nhập mật khẩu.
    const gate = await checkBmhsGate(userId, employeeId, request.headers.get('x-bmhs-token'));
    if (!gate.allowed) {
      return NextResponse.json({ error: 'Hồ sơ được bảo mật — cần nhập mật khẩu', requireBmhs: true, employeeId }, { status: 403 });
    }

    const data = await svc.listHrDocuments(employeeId);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/hr-documents error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * POST /api/hr-documents — upload hồ sơ (multipart/form-data).
 * Trường: files, employee_id, doc_type_id, title.
 * Nhân viên tự upload hồ sơ của mình; C&B (hr.edit) upload cho bất kỳ ai.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const activeCompany = request.headers.get('x-current-user-company') || undefined;
    const form = await request.formData();
    const employeeId = (form.get('employee_id') as string) || userId;
    const docTypeId = (form.get('doc_type_id') as string) || null;
    const title = (form.get('title') as string) || null;
    const files = form.getAll('files').filter((f): f is File => f instanceof File);

    const isSelf = employeeId.toLowerCase() === userId.toLowerCase();
    if (!isSelf && !(await canManageContracts(userId, 'edit', activeCompany))) {
      return NextResponse.json({ error: 'Không có quyền upload hồ sơ cho người khác' }, { status: 403 });
    }
    if (files.length === 0) {
      return NextResponse.json({ error: 'Không có tệp nào' }, { status: 400 });
    }

    const saved: any[] = [];
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: `Tệp "${file.name}" vượt quá 10MB` }, { status: 413 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const row = await svc.createHrDocument({
        employeeId,
        docTypeId,
        title,
        fileName: file.name,
        mimeType: file.type || null,
        sizeBytes: file.size,
        buffer,
        uploadedBy: userId,
      });
      saved.push(row);

      // Mỗi tệp là 1 bản ghi hồ sơ riêng → ghi lịch sử cho từng bản ghi.
      await logHrRecord({
        entityType: 'hr_document', entityId: row.id, action: 'create',
        details: `Tải lên tài liệu: ${file.name}`,
        performedBy: userId,
      });
    }

    return NextResponse.json({ success: true, data: saved }, { status: 201 });
  } catch (err) {
    console.error('POST /api/hr-documents error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
