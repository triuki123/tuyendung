import { NextRequest, NextResponse } from 'next/server';
import { getActorWithPerms, type Actor } from '@/lib/apiAuth';
import { canAccess } from '@/lib/permissions';
import type { PermissionAction } from '@/lib/modules';
import { canManageWarehouse } from '@/lib/services/warehouseService';

/**
 * Guard cho API admin của module Warehouse — RBAC NGHIÊM NGẶT:
 * 1. Phải có quyền RBAC module 'warehouse' với action tương ứng
 *    (KHÔNG bypass super_admin — không tick là chặn, theo yêu cầu).
 * 2. Phạm vi kho: super_admin (đã có tick) thấy mọi kho; người khác phải
 *    nằm trong warehouse_managers của kho đó.
 *
 * Đây là NƠI DUY NHẤT quyết định quyền — mọi route admin phải đi qua guard này
 * (hoặc requireWarehouseConfigurer / requireWarehousePermission bên dưới) và
 * KHÔNG tự kiểm role riêng.
 */
export async function requireWarehouseManager(
  req: NextRequest,
  warehouseId: string | null,
  action: PermissionAction = 'view'
): Promise<{ actor: Actor } | { response: NextResponse }> {
  const actor = await getActorWithPerms(req);
  if (!actor) {
    return { response: NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 }) };
  }
  if (!canAccess(actor.perms, 'warehouse', action)) {
    return { response: NextResponse.json({ error: 'Bạn chưa được cấp quyền Kho / Xưởng' }, { status: 403 }) };
  }
  if (!warehouseId) {
    return { response: NextResponse.json({ error: 'Thiếu warehouseId' }, { status: 400 }) };
  }
  const ok = await canManageWarehouse(actor.id, actor.role, warehouseId);
  if (!ok) {
    return { response: NextResponse.json({ error: 'Bạn không phải quản lý kho này' }, { status: 403 }) };
  }
  return { actor };
}

/**
 * Guard CẤU HÌNH kho (GPS/ca/sản phẩm/email/cờ ứng lương/quản lý).
 *
 * Trước đây chặn cứng `role === 'super_admin'`. Đã BỎ: quyền quyết định bây giờ
 * hoàn toàn nằm ở RBAC (tick quyền Sửa module 'warehouse') + phạm vi kho, đúng
 * quy ước "không hardcode role" của dự án. Muốn cho ai cấu hình kho thì cấp
 * quyền qua trang Phân Quyền và gán họ làm quản lý kho — không cần sửa code.
 *
 * Giữ tên riêng (thay vì gọi thẳng requireWarehouseManager) để chỗ gọi vẫn đọc
 * ra ý "đây là thao tác cấu hình", và nếu sau này cần siết lại thì siết một chỗ.
 */
export async function requireWarehouseConfigurer(
  req: NextRequest,
  warehouseId: string | null,
  action: PermissionAction = 'edit'
): Promise<{ actor: Actor } | { response: NextResponse }> {
  return requireWarehouseManager(req, warehouseId, action);
}

/** Guard mức module (không cần kho cụ thể) — cho danh sách kho / tổng quan. */
export async function requireWarehousePermission(
  req: NextRequest,
  action: PermissionAction = 'view'
): Promise<{ actor: Actor & { role: string } } | { response: NextResponse }> {
  const actor = await getActorWithPerms(req);
  if (!actor) {
    return { response: NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 }) };
  }
  if (!canAccess(actor.perms, 'warehouse', action)) {
    return { response: NextResponse.json({ error: 'Bạn chưa được cấp quyền Kho / Xưởng' }, { status: 403 }) };
  }
  return { actor };
}
