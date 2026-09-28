import { NextRequest, NextResponse } from 'next/server';
import { requireLegal } from '@/lib/legal/legalGuard';
import { listLegalAudit, type LegalEntityType } from '@/lib/services/legalAuditService';

export const dynamic = 'force-dynamic';

const VALID: LegalEntityType[] = ['document', 'contract', 'authorization', 'seal_log', 'compliance_item'];

/** GET: lịch sử xử lý của 1 bản ghi pháp chế */
export async function GET(
  request: NextRequest,
  { params }: { params: { entityType: string; entityId: string } }
) {
  try {
    const guard = await requireLegal(request, 'view');
    if ('response' in guard) return guard.response;
    if (!VALID.includes(params.entityType as LegalEntityType)) {
      return NextResponse.json({ error: 'Loại bản ghi không hợp lệ' }, { status: 400 });
    }
    const rows = await listLegalAudit(params.entityType as LegalEntityType, params.entityId);
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/legal/audit error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
