import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/hrDocumentReplaceService';
import * as docSvc from '@/lib/services/hrDocumentService';
import { canViewEmployeeData } from '@/lib/services/contractPermissionService';

export const dynamic = 'force-dynamic';
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** POST /api/hr-documents/[id]/replace-request — nhân viên gửi yêu cầu đổi hồ sơ. */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const activeCompany = request.headers.get('x-current-user-company') || undefined;
    const doc = await docSvc.getHrDocumentOwner(params.id);
    if (!doc) return NextResponse.json({ error: 'Hồ sơ không tồn tại' }, { status: 404 });

    // Chỉ chủ sở hữu mới được gửi yêu cầu đổi (hoặc C&B)
    if (!(await canViewEmployeeData(userId, doc, activeCompany))) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Thiếu tệp mới' }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'Tệp vượt quá 10MB' }, { status: 413 });
    }

    const title = (form.get('title') as string) || null;
    const buffer = Buffer.from(await file.arrayBuffer());

    const data = await svc.createReplaceRequest({
      originalDocId: params.id,
      newFileName: file.name,
      newTitle: title,
      newMimeType: file.type || null,
      newSizeBytes: file.size,
      newContent: buffer,
      requestedBy: userId,
    });

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error('POST /api/hr-documents/[id]/replace-request error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
