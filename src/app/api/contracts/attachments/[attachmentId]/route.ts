import { NextRequest, NextResponse } from 'next/server';
import * as attach from '@/lib/services/contractAttachmentsService';
import * as contractService from '@/lib/services/contractService';
import {
  canManageContracts,
  canViewEmployeeData,
} from '@/lib/services/contractPermissionService';
import { checkBmhsGate } from '@/lib/services/bmhsService';
import { logHrRecord } from '@/lib/services/hrAuditService';

export const dynamic = 'force-dynamic';

/** GET — tải nội dung file (BYTEA). ?download=1 → attachment. */
export async function GET(request: NextRequest, { params }: { params: { attachmentId: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const file = await attach.getContractAttachmentContent(params.attachmentId);
    if (!file) return NextResponse.json({ error: 'Không tìm thấy tệp' }, { status: 404 });

    const contract = await contractService.getContractById(file.contract_id);
    if (!contract || !(await canViewEmployeeData(userId, contract.employee_id))) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    // Cổng Bảo Mật Hồ Sơ (BMHS): hồ sơ đã khóa → cần vé mở khóa (nhập mật khẩu).
    const gate = await checkBmhsGate(userId, contract.employee_id, request.headers.get('x-bmhs-token'));
    if (!gate.allowed) {
      return NextResponse.json({ error: 'Hồ sơ được bảo mật — cần nhập mật khẩu', requireBmhs: true, employeeId: contract.employee_id }, { status: 403 });
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
    console.error('GET contract attachment download error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE — xóa mềm (cần quyền hr.edit). */
export async function DELETE(request: NextRequest, { params }: { params: { attachmentId: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!(await canManageContracts(userId, 'edit'))) {
      return NextResponse.json({ error: 'Không có quyền xóa tệp' }, { status: 403 });
    }
    // Đọc metadata TRƯỚC khi xóa để biết tệp thuộc hợp đồng nào (ghi lịch sử vào đúng bản ghi).
    const meta = await attach.getContractAttachmentMeta(params.attachmentId);

    const ok = await attach.softDeleteContractAttachment(params.attachmentId);
    if (!ok) return NextResponse.json({ error: 'Không tìm thấy tệp' }, { status: 404 });

    if (meta) {
      await logHrRecord({
        entityType: 'contract', entityId: meta.contract_id, action: 'detach',
        details: `Gỡ tệp đính kèm: ${meta.file_name}`,
        performedBy: userId,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE contract attachment error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
