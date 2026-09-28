import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/kpiUnitAssignmentService';
import { resolveKpiScope } from '@/lib/services/kpiCompanyContext';

export const dynamic = 'force-dynamic';

/** POST — người duyệt ở tầng ĐANG chờ xử lý phiếu đơn vị. Tầng cuối cùng thì chốt điểm chính thức luôn. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const body = await request.json();
    const ctx = await resolveKpiScope(request, userId, body.company_id || null);
    if (!ctx?.company_id) return NextResponse.json({ error: 'Không xác định được công ty' }, { status: 400 });
    if (!Array.isArray(body.items)) return NextResponse.json({ error: 'Thiếu items' }, { status: 400 });

    const updated = await svc.approveUnitTier(params.id, ctx.company_id, userId, body.items, body.note);
    if (!updated) return NextResponse.json({ error: 'Không tìm thấy phiếu hoặc chưa tới lượt bạn duyệt' }, { status: 404 });
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error('POST /api/kpi/unit-assignments/[id]/approve error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
