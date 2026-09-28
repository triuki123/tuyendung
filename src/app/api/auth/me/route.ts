import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { getEffectiveRolePermissions } from '@/lib/modules';
import { normalizeRole } from '@/lib/rolePolicy';

/**
 * Trả user hiện tại theo phiên (cookie đã được middleware verify).
 * Dùng để client bootstrap localStorage sau khi đăng nhập SSO (callback là 302
 * redirect nên client không nhận JSON user như luồng login cũ).
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    // The focused workspace needs identity and permissions, not the personnel
    // service's attendance/organization dependency graph and profile fields.
    const user = process.env.NEXT_PUBLIC_RECRUITMENT_FOCUS === 'true'
      ? await queryOne<Record<string, any>>(
          `SELECT id, name, email, role, department, department_id, company_id,
                  module_permissions FROM users WHERE id = $1`, [userId],
        )
      : await (await import('@/lib/services/usersService')).getUserById(userId);
    if (!user) return NextResponse.json({ error: 'Người dùng không tồn tại' }, { status: 401 });

    const role = normalizeRole((user as any).role);
    // Ưu tiên quyền hiệu lực middleware đã resolve (đa công ty); fallback tính từ user.
    let perms: unknown = null;
    try { perms = JSON.parse(request.headers.get('x-user-permissions') || 'null'); } catch { perms = null; }
    const module_permissions = perms ?? getEffectiveRolePermissions(role, (user as any).module_permissions);

    const { password: _pw, ...safeUser } = user as Record<string, any>;
    return NextResponse.json({
      ...safeUser,
      role,
      module_permissions,
      session_id: request.headers.get('x-session-id'),
    });
  } catch (err) {
    console.error('GET /api/auth/me error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
