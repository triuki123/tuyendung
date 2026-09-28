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

// PUT /api/ticket-categories/[id] — cap nhat danh muc (Super Admin only).
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const guard = await assertSuperAdmin(body.updated_by);
    if (guard) return guard;

    const updateData: Record<string, any> = {};
    if (body.name) updateData.name = String(body.name).trim();
    if (body.parent_id !== undefined) updateData.parent_id = body.parent_id || null;
    if (body.request_type !== undefined) updateData.request_type = body.request_type || null;
    if (body.default_unit_tag_id !== undefined) updateData.default_unit_tag_id = body.default_unit_tag_id || null;
    if (body.custom_fields !== undefined) {
      updateData.custom_fields = Array.isArray(body.custom_fields) ? JSON.stringify(body.custom_fields) : '[]';
    }
    if (typeof body.sort_order === 'number') updateData.sort_order = body.sort_order;
    if (typeof body.is_active === 'boolean') updateData.is_active = body.is_active;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Không có trường nào để cập nhật' }, { status: 400 });
    }

    const { text, params: qParams } = buildUpdateById('ticket_categories', params.id, updateData);
    const row = await queryOne(text, qParams);
    return NextResponse.json(row);
  } catch (error: any) {
    console.error('PUT /api/ticket-categories/[id] error:', error);
    return NextResponse.json({ error: error.message || 'Lỗi server' }, { status: 500 });
  }
}

// DELETE /api/ticket-categories/[id]
//   - Mặc định: soft-delete (lưu trữ — set is_active = false).
//   - ?hard=1: xóa vĩnh viễn. Chặn nếu còn danh mục con (sẽ bị xóa theo do CASCADE)
//     hoặc ticket đang dùng — trừ khi force=1.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    const guard = await assertSuperAdmin(body.deleted_by);
    if (guard) return guard;

    const hard = req.nextUrl.searchParams.get('hard') === '1';
    if (!hard) {
      const { text, params: qParams } = buildUpdateById('ticket_categories', params.id, { is_active: false });
      const row = await queryOne(text, qParams);
      return NextResponse.json(row);
    }

    // Hard-delete: kiểm tra danh mục con (FK ON DELETE CASCADE) + ticket đang dùng (category_id).
    const cat = await queryOne<{ id: string }>('SELECT id FROM ticket_categories WHERE id = $1', [params.id]);
    if (!cat) return NextResponse.json({ error: 'Danh mục không tồn tại' }, { status: 404 });

    const force = req.nextUrl.searchParams.get('force') === '1';
    const childRow = await queryOne<{ n: string }>('SELECT COUNT(*) AS n FROM ticket_categories WHERE parent_id = $1', [params.id]);
    const ticketRow = await queryOne<{ n: string }>('SELECT COUNT(*) AS n FROM tickets WHERE category_id::text = $1::text', [params.id]);
    const childCount = Number(childRow?.n || 0);
    const ticketCount = Number(ticketRow?.n || 0);

    if ((childCount > 0 || ticketCount > 0) && !force) {
      const parts = [];
      if (childCount > 0) parts.push(`${childCount} danh mục con (sẽ bị xóa theo)`);
      if (ticketCount > 0) parts.push(`${ticketCount} ticket (sẽ mất tham chiếu)`);
      return NextResponse.json(
        {
          error: `Đang có ${parts.join(' và ')}. Xóa vĩnh viễn sẽ ảnh hưởng tới chúng.`,
          inUse: true,
          childCount,
          ticketCount,
        },
        { status: 409 }
      );
    }

    // CASCADE tự xóa danh mục con.
    await execute('DELETE FROM ticket_categories WHERE id = $1', [params.id]);
    return NextResponse.json({ success: true, deleted: true, id: params.id });
  } catch (error: any) {
    console.error('DELETE /api/ticket-categories/[id] error:', error);
    return NextResponse.json({ error: error.message || 'Lỗi server' }, { status: 500 });
  }
}
