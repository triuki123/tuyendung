import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { listRequisitionAudit } from '@/lib/services/requisitionAuditService';

export const dynamic = 'force-dynamic';

/** GET /api/hr/requisitions/:id/history — lịch sử xử lý của 1 yêu cầu tuyển dụng. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const canView =
      checkUnitAccess(request, 'recruitment-order', 'view') ||
      checkUnitAccess(request, 'hr-requisitions', 'view');
    if (!canView) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

    const data = await listRequisitionAudit(params.id);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/hr/requisitions/:id/history error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
