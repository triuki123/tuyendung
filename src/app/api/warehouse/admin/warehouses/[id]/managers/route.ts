import { NextRequest, NextResponse } from 'next/server';
import { requireWarehouseConfigurer } from '@/lib/warehouse/adminGuard';
import { queryOne } from '@/lib/db';
import { addManager, removeManager } from '@/lib/services/warehouseService';

export const dynamic = 'force-dynamic';

/**
 * Gán / gỡ quản lý kho — quyền RBAC Sửa module 'warehouse' (đã bỏ rào super_admin).
 *
 * ⚠️ BẮT BUỘC dùng requireWarehouseConfigurer (có kiểm PHẠM VI KHO), KHÔNG dùng
 * requireWarehousePermission (chỉ kiểm quyền ở mức module). Trước đây route này
 * chỉ kiểm mức module và dựa vào rào super_admin để chặn. Bỏ rào đó mà giữ guard
 * cũ thì bất kỳ ai có quyền Sửa đều TỰ GÁN MÌNH làm quản lý MỌI kho — leo thang
 * quyền ra toàn hệ thống. Nay: chỉ gán/gỡ được trên kho mình đang quản lý.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const guard = await requireWarehouseConfigurer(request, params.id, 'edit');
    if ('response' in guard) return guard.response;
    const { email } = await request.json();
    if (!email) return NextResponse.json({ error: 'Nhập email' }, { status: 400 });
    const user = await queryOne<{ id: string; name: string }>(
      `SELECT id, name FROM users WHERE LOWER(email) = LOWER($1)`, [String(email).trim()]
    );
    if (!user) return NextResponse.json({ error: 'Không tìm thấy user với email này' }, { status: 404 });
    await addManager(params.id, user.id);
    return NextResponse.json({ success: true, data: { user_id: user.id, name: user.name } });
  } catch (err) {
    console.error('POST /api/warehouse/admin/warehouses/[id]/managers error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE: gỡ quản lý (?userId=) */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const guard = await requireWarehouseConfigurer(request, params.id, 'edit');
    if ('response' in guard) return guard.response;
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'Thiếu userId' }, { status: 400 });

    // Phạm vi kho giờ DỰA HOÀN TOÀN vào warehouse_managers (đã bỏ vế công ty chủ quản):
    // gỡ người cuối cùng là khoá mọi người khỏi kho, chỉ super_admin cứu được.
    // Chặn lại — muốn thay người cuối thì THÊM người mới trước rồi mới gỡ.
    if (guard.actor.role !== 'super_admin') {
      const remaining = await queryOne<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM warehouse_managers WHERE warehouse_id = $1 AND user_id <> $2::uuid`,
        [params.id, userId]
      );
      if ((remaining?.n ?? 0) === 0) {
        return NextResponse.json(
          { error: 'Không thể gỡ người quản lý cuối cùng của kho — thêm người thay thế trước' },
          { status: 400 }
        );
      }
    }

    await removeManager(params.id, userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/warehouse/admin/warehouses/[id]/managers error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
