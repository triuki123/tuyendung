import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { query, execute } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const role = request.headers.get('x-current-user-role') || '';
    if (!['super_admin', 'admin', 'manager'].includes(role) && !checkUnitAccess(request, 'hr-offboarding', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const rows = await query<{ user_id: string; name: string; avatar: string | null; department_name: string | null }>(
      `SELECT r.user_id::text AS user_id, u.name, u.avatar, d.name AS department_name
       FROM offboarding_notify_recipients r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN departments d ON d.id::text = u.department_id::text
       ORDER BY u.name`
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/hr/offboarding/notify-recipients error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'hr-offboarding', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const { user_id } = await request.json();
    if (!user_id) return NextResponse.json({ error: 'Thiếu user_id' }, { status: 400 });
    await execute(
      `INSERT INTO offboarding_notify_recipients (user_id) VALUES ($1::uuid) ON CONFLICT (user_id) DO NOTHING`,
      [user_id]
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/hr/offboarding/notify-recipients error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'hr-offboarding', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const { user_id } = await request.json();
    if (!user_id) return NextResponse.json({ error: 'Thiếu user_id' }, { status: 400 });
    await execute(`DELETE FROM offboarding_notify_recipients WHERE user_id = $1::uuid`, [user_id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/hr/offboarding/notify-recipients error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
