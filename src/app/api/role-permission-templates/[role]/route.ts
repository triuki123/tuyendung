import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['user', 'manager', 'admin'];

/** GET /api/role-permission-templates/[role] */
export async function GET(request: NextRequest, { params }: { params: { role: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const { role } = params;
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Role không hợp lệ' }, { status: 400 });
    }

    const row = await queryOne<{ role: string; module_permissions: object; updated_at: string }>(
      `SELECT role, module_permissions, updated_at FROM role_permission_templates WHERE role = $1`,
      [role]
    );

    return NextResponse.json({ success: true, data: row ?? { role, module_permissions: {} } });
  } catch (err) {
    console.error('GET /api/role-permission-templates/[role] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** PUT /api/role-permission-templates/[role] — lưu template */
export async function PUT(request: NextRequest, { params }: { params: { role: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    const userRole = request.headers.get('x-current-user-role');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (userRole !== 'super_admin') {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }

    const { role } = params;
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Role không hợp lệ' }, { status: 400 });
    }

    const body = await request.json();
    const { module_permissions } = body;
    if (!module_permissions || typeof module_permissions !== 'object') {
      return NextResponse.json({ error: 'module_permissions không hợp lệ' }, { status: 400 });
    }

    await execute(
      `INSERT INTO role_permission_templates (role, module_permissions, updated_at, updated_by)
       VALUES ($1, $2, NOW(), $3)
       ON CONFLICT (role) DO UPDATE
         SET module_permissions = EXCLUDED.module_permissions,
             updated_at         = NOW(),
             updated_by         = EXCLUDED.updated_by`,
      [role, JSON.stringify(module_permissions), userId]
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT /api/role-permission-templates/[role] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * POST /api/role-permission-templates/[role]/apply-all
 * Lưu template rồi GHI ĐÈ quyền cho MỌI user đang có role này.
 * Trả về số user đã cập nhật.
 */
export async function POST(request: NextRequest, { params }: { params: { role: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    const userRole = request.headers.get('x-current-user-role');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (userRole !== 'super_admin') {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }

    const { role } = params;
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Role không hợp lệ' }, { status: 400 });
    }

    const body = await request.json();
    const { module_permissions } = body;
    if (!module_permissions || typeof module_permissions !== 'object') {
      return NextResponse.json({ error: 'module_permissions không hợp lệ' }, { status: 400 });
    }

    const permsJson = JSON.stringify(module_permissions);

    // 1. Lưu lại template để mẫu vai trò khớp với thứ vừa áp dụng.
    await execute(
      `INSERT INTO role_permission_templates (role, module_permissions, updated_at, updated_by)
       VALUES ($1, $2, NOW(), $3)
       ON CONFLICT (role) DO UPDATE
         SET module_permissions = EXCLUDED.module_permissions,
             updated_at         = NOW(),
             updated_by         = EXCLUDED.updated_by`,
      [role, permsJson, userId]
    );

    // 2. Ghi đè quyền cho mọi user đang có role này.
    const count = await execute(
      `UPDATE users SET module_permissions = $1 WHERE role = $2`,
      [permsJson, role]
    );

    return NextResponse.json({ success: true, count });
  } catch (err) {
    console.error('POST /api/role-permission-templates/[role] apply-all error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
