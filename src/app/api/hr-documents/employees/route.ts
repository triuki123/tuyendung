import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getContractVisibility } from '@/lib/services/contractPermissionService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/hr-documents/employees?q=keyword
 * Tìm nhân viên để dùng trong EmployeePicker của module Quản lý hồ sơ.
 * Kết quả được giới hạn theo company của người dùng (admin chỉ thấy công ty mình).
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const activeCompany = request.headers.get('x-current-user-company') || undefined;
    const q = request.nextUrl.searchParams.get('q') ?? '';
    const kw = `%${q.trim().toLowerCase()}%`;

    const visibility = await getContractVisibility(userId, activeCompany);
    const ids = visibility.all ? null : (visibility.allowedEmployeeIds ?? []);

    if (ids !== null && ids.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const params: unknown[] = [q.trim(), kw];
    let scopeClause = '';
    if (ids) {
      params.push(ids);
      scopeClause = `AND id::text = ANY($${params.length})`;
    }

    const data = await query<{ id: string; name: string; email: string; avatar: string | null }>(
      `SELECT id::text AS id, name, email, avatar
       FROM users
       WHERE status = 'active'
         AND ($1 = '' OR LOWER(name) LIKE $2 OR LOWER(email) LIKE $2)
         ${scopeClause}
       ORDER BY name
       LIMIT 50`,
      params
    );

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/hr-documents/employees error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
