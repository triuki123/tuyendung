import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/hrDocumentReplaceService';
import { canManageContracts } from '@/lib/services/contractPermissionService';
import { logHrRecord } from '@/lib/services/hrAuditService';

export const dynamic = 'force-dynamic';

/** POST /api/hr-documents/replace-requests/[reqId]/reject — C&B từ chối yêu cầu. */
export async function POST(
  request: NextRequest,
  { params }: { params: { reqId: string } }
) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const activeCompany = request.headers.get('x-current-user-company') || undefined;
    if (!(await canManageContracts(userId, 'edit', activeCompany))) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const note: string | undefined = body.note || undefined;

    const data = await svc.rejectRequest(params.reqId, userId, note);

    await logHrRecord({
      entityType: 'hr_document', entityId: data.original_doc_id, action: 'replace_reject',
      details: `Từ chối thay thế tài liệu${note ? ` · Lý do: ${note}` : ''}`,
      performedBy: userId,
    });

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error('POST replace-requests/[reqId]/reject error:', err);
    const status = err.message?.includes('không tồn tại') ? 400 : 500;
    return NextResponse.json({ error: err.message || 'Lỗi server' }, { status });
  }
}
