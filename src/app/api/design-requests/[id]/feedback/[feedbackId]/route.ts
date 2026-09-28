import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { queryOne } from '@/lib/db';
import { getEffectiveContext } from '@/lib/services/userCompanyService';

export const dynamic = 'force-dynamic';

// PATCH — đổi trạng thái xử lý feedback (open/resolved).
export async function PATCH(request: NextRequest, { params }: { params: { id: string; feedbackId: string } }) {
  try {
    if (!checkUnitAccess(request, 'design-requests', 'edit')) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const ctx = await getEffectiveContext(userId, request.headers.get('x-current-user-company'));
    if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const owns = await queryOne<{ id: string }>(
      `SELECT id FROM design_requests WHERE id = $1 AND ($2::text IS NULL OR company_id = $2)`,
      [params.id, ctx.role === 'super_admin' ? null : ctx.company_id]
    );
    if (!owns) return NextResponse.json({ error: 'Không tìm thấy yêu cầu' }, { status: 404 });
    const body = await request.json();
    if (!body.status || !['open', 'resolved'].includes(body.status)) return NextResponse.json({ error: 'Trạng thái không hợp lệ' }, { status: 400 });
    const row = await queryOne(
      `UPDATE design_request_feedback SET status=$3 WHERE id=$1 AND design_request_id=$2 RETURNING *`,
      [params.feedbackId, params.id, body.status]
    );
    if (!row) return NextResponse.json({ error: 'Không tìm thấy feedback' }, { status: 404 });
    return NextResponse.json({ success: true, data: row });
  } catch (err) {
    console.error('PATCH feedback error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
