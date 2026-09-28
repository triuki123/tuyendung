import { NextRequest, NextResponse } from 'next/server';
import { canManageSolace, isSolaceSuperAdmin, SolaceUnit } from '@/lib/services/solacePermissionService';
import type { PermissionAction } from '@/lib/modules';

/**
 * Guard quyền vận hành quán SOLACE cho API route.
 * @returns { userId } nếu đủ quyền, hoặc NextResponse lỗi (401/403) để return luôn.
 */
export async function guardSolace(
  request: NextRequest, unit: SolaceUnit, action: PermissionAction
): Promise<{ userId: string } | NextResponse> {
  const userId = request.headers.get('x-current-user-id');
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ok = await canManageSolace(userId, unit, action);
  if (!ok) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
  return { userId };
}

/**
 * Guard CHỈ super_admin (dùng cho cấu hình quán — nhân viên/quản lý không được).
 * @returns { userId } nếu là super_admin, hoặc NextResponse lỗi (401/403).
 */
export async function guardSolaceSuperAdmin(
  request: NextRequest
): Promise<{ userId: string } | NextResponse> {
  const userId = request.headers.get('x-current-user-id');
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isSolaceSuperAdmin(userId))) {
    return NextResponse.json({ error: 'Chỉ Super Admin được phép cấu hình quán' }, { status: 403 });
  }
  return { userId };
}

/** Chỉ yêu cầu đã đăng nhập (cho GET đọc thực đơn dùng chung cả phần khách). */
export function requireLogin(request: NextRequest): { userId: string } | NextResponse {
  const userId = request.headers.get('x-current-user-id');
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return { userId };
}
