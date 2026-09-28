import { NextRequest, NextResponse } from 'next/server';
import { queryOne, buildUpdateById, execute } from '@/lib/db';

async function assertSuperAdmin(userId?: string): Promise<NextResponse | null> {
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized: thiếu user id' }, { status: 401 });
  }
  const user = await queryOne<{ role: string }>('SELECT role FROM users WHERE id = $1', [userId]);
  if (!user || user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden: Chỉ Super Admin được thao tác' }, { status: 403 });
  }
  return null;
}

// PUT /api/ticket-request-types/[id] — cap nhat (Super Admin only).
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const guard = await assertSuperAdmin(body.updated_by);
    if (guard) return guard;

    const updateData: Record<string, any> = {};
    if (body.name) updateData.name = String(body.name).trim();
    if (body.code) updateData.code = String(body.code).trim();
    if (typeof body.sort_order === 'number') updateData.sort_order = body.sort_order;
    if (typeof body.is_active === 'boolean') updateData.is_active = body.is_active;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Không có trường nào để cập nhật' }, { status: 400 });
    }

    const { text, params: qParams } = buildUpdateById('ticket_request_types', params.id, updateData);
    const row = await queryOne(text, qParams);
    return NextResponse.json(row);
  } catch (error: any) {
    console.error('PUT /api/ticket-request-types/[id] error:', error);
    return NextResponse.json({ error: error.message || 'Lỗi server' }, { status: 500 });
  }
}

// DELETE /api/ticket-request-types/[id]
//   - Mặc định: soft-delete (lưu trữ — set is_active = false).
//   - ?hard=1: xóa vĩnh viễn. Chặn nếu còn ticket/danh mục đang dùng (trừ khi force=1).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    const guard = await assertSuperAdmin(body.deleted_by);
    if (guard) return guard;

    const hard = req.nextUrl.searchParams.get('hard') === '1';
    if (!hard) {
      const { text, params: qParams } = buildUpdateById('ticket_request_types', params.id, { is_active: false });
      const row = await queryOne(text, qParams);
      return NextResponse.json(row);
    }

    // Hard-delete: lấy code để kiểm tra ràng buộc (tickets/categories lưu theo code).
    const rt = await queryOne<{ code: string }>('SELECT code FROM ticket_request_types WHERE id = $1', [params.id]);
    if (!rt) return NextResponse.json({ error: 'Loại yêu cầu không tồn tại' }, { status: 404 });

    const force = req.nextUrl.searchParams.get('force') === '1';
    const ticketCount = await queryOne<{ n: string }>('SELECT COUNT(*) AS n FROM tickets WHERE request_type = $1', [rt.code]);
    const catCount = await queryOne<{ n: string }>('SELECT COUNT(*) AS n FROM ticket_categories WHERE request_type = $1', [rt.code]);
    const tCount = Number(ticketCount?.n || 0);
    const cCount = Number(catCount?.n || 0);

    if ((tCount > 0 || cCount > 0) && !force) {
      const parts = [];
      if (tCount > 0) parts.push(`${tCount} ticket`);
      if (cCount > 0) parts.push(`${cCount} danh mục`);
      return NextResponse.json(
        {
          error: `Đang có ${parts.join(' và ')} dùng loại yêu cầu này. Xóa vĩnh viễn sẽ khiến chúng mất tham chiếu.`,
          inUse: true,
          ticketCount: tCount,
          categoryCount: cCount,
        },
        { status: 409 }
      );
    }

    await execute('DELETE FROM ticket_request_types WHERE id = $1', [params.id]);
    return NextResponse.json({ success: true, deleted: true, id: params.id });
  } catch (error: any) {
    console.error('DELETE /api/ticket-request-types/[id] error:', error);
    return NextResponse.json({ error: error.message || 'Lỗi server' }, { status: 500 });
  }
}
