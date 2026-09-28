import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireRole } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['user', 'manager', 'admin'];

/** GET /api/role-permission-templates — chỉ quản trị viên được xem ma trận RBAC. */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, ['super_admin']);
    if ('response' in auth) return auth.response;

    const rows = await query<{ role: string; module_permissions: object; updated_at: string }>(
      `SELECT role, module_permissions, updated_at
         FROM role_permission_templates
        WHERE role = ANY($1)
        ORDER BY role`,
      [ALLOWED_ROLES]
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/role-permission-templates error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
