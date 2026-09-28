import { NextRequest, NextResponse } from 'next/server';
import { listHrRecordAudit, HrEntityType } from '@/lib/services/hrAuditService';

export const dynamic = 'force-dynamic';

const VALID_TYPES: HrEntityType[] = ['contract', 'evaluation', 'hr_document'];

/**
 * GET /api/hr-audit/{entityType}/{entityId} — lịch sử xử lý tác vụ của 1 bản ghi
 * trong module Quản Lý Hồ Sơ (Hợp đồng / Đánh giá / Hồ sơ).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { entityType: string; entityId: string } }
) {
  try {
    if (!request.headers.get('x-current-user-id')) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    }

    const entityType = params.entityType as HrEntityType;
    if (!VALID_TYPES.includes(entityType)) {
      return NextResponse.json({ error: 'Loại bản ghi không hợp lệ' }, { status: 400 });
    }
    if (!params.entityId) {
      return NextResponse.json({ error: 'Thiếu mã bản ghi' }, { status: 400 });
    }

    const data = await listHrRecordAudit(entityType, params.entityId);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/hr-audit error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
