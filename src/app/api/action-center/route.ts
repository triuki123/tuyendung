import { NextRequest, NextResponse } from 'next/server';
import { getActionCenter } from '@/lib/services/actionCenterService';
import { getEffectiveContext } from '@/lib/services/userCompanyService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/action-center — "Cần Xử Lý" HAI LĂNG KÍNH:
 * - mine: việc ĐÍCH DANH chờ tôi (chống nhũng nhiễu).
 * - team: việc trong phạm vi tôi quản/có quyền (capability view).
 * Mỗi nhóm kèm đếm theo công ty + theo loại. Vai trò suy từ getEffectiveContext (không tin role header).
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    // Vai trò toàn cục: super_admin thì xét toàn hệ thống (không phụ thuộc switcher).
    const ctx = await getEffectiveContext(userId, null).catch(() => null);
    const globalRole = ctx?.role || request.headers.get('x-current-user-role') || 'user';

    const { mine, team } = await getActionCenter(userId, globalRole);

    return NextResponse.json({ success: true, mine, team });
  } catch (err) {
    console.error('GET /api/action-center error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
