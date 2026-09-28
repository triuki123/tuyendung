import { NextRequest, NextResponse } from 'next/server';
import * as attach from '@/lib/services/contractAttachmentsService';
import * as contractService from '@/lib/services/contractService';
import {
  canManageContracts,
  canViewEmployeeData,
} from '@/lib/services/contractPermissionService';
import { logHrRecord } from '@/lib/services/hrAuditService';

export const dynamic = 'force-dynamic';
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

/** GET — danh sách metadata file đính kèm. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const contract = await contractService.getContractById(params.id);
    if (!contract) return NextResponse.json({ error: 'Không tìm thấy hợp đồng' }, { status: 404 });
    if (!(await canViewEmployeeData(userId, contract.employee_id))) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }

    const rows = await attach.listContractAttachments(params.id);
    return NextResponse.json({ success: true, attachments: rows });
  } catch (err) {
    console.error('GET contract attachments error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST — upload file (multipart/form-data, field "files"). Cần quyền hr.edit. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!(await canManageContracts(userId, 'edit'))) {
      return NextResponse.json({ error: 'Không có quyền đính kèm' }, { status: 403 });
    }

    const form = await request.formData();
    const files = form.getAll('files').filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: 'Không có tệp nào' }, { status: 400 });
    }

    const saved: any[] = [];
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: `Tệp "${file.name}" vượt quá 10MB` }, { status: 413 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const row = await attach.createContractAttachment({
        contractId: params.id,
        fileName: file.name,
        mimeType: file.type || null,
        sizeBytes: file.size,
        buffer,
        uploadedBy: userId,
      });
      saved.push(row);
    }

    await logHrRecord({
      entityType: 'contract', entityId: params.id, action: 'attach',
      details: `Đính kèm ${saved.length} tệp: ${files.map((f) => f.name).join(', ')}`,
      performedBy: userId,
    });

    return NextResponse.json({ success: true, attachments: saved }, { status: 201 });
  } catch (err) {
    console.error('POST contract attachments error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
