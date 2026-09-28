import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/hrDocumentReplaceService';
import { canManageContracts } from '@/lib/services/contractPermissionService';
import { logHrRecord } from '@/lib/services/hrAuditService';

export const dynamic = 'force-dynamic';

/** POST /api/hr-documents/replace-requests/[reqId]/approve — C&B duyệt yêu cầu. */
export async function POST(
  request: NextRequest,
  { params }: { params: { reqId: string } }
) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const activeCompany = request.headers.get('x-current-user-company') || undefined;
    if (!(await canManageContracts(userId, 'edit', activeCompany))) {
      return NextResponse.json({ error: 'Không có quyền duyệt' }, { status: 403 });
    }

    const data = await svc.approveRequest(params.reqId, userId);

    await logHrRecord({
      entityType: 'hr_document', entityId: data.original_doc_id, action: 'replace_approve',
      details: `Duyệt thay thế tài liệu → ${data.new_file_name}`,
      performedBy: userId,
    });

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error('POST replace-requests/[reqId]/approve error:', err);
    const status = err.message?.includes('không tồn tại') ? 400 : 500;
    return NextResponse.json({ error: err.message || 'Lỗi server' }, { status });
  }
}
