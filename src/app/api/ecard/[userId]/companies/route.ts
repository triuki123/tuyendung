import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ecard/[userId]/companies — danh sách công ty user được gán
 * (dùng để chọn khi tạo biến thể hồ sơ năng lực Công Ty).
 * Kết hợp: company chính (users.company_id) + mọi org_assignments active.
 */
export async function GET(request: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const role = request.headers.get('x-current-user-role');
    if (role !== 'super_admin') return NextResponse.json({ error: 'Chỉ Super Admin' }, { status: 403 });

    const rows = await query<{ id: string; name: string }>(
      `SELECT DISTINCT c.id::text AS id, c.name
         FROM public.companies c
        WHERE c.id::text IN (
                SELECT u.company_id::text FROM public.users u WHERE u.id = $1 AND u.company_id IS NOT NULL
                UNION
                SELECT oa.company_id::text FROM public.org_assignments oa
                 WHERE oa.user_id = $1 AND oa.is_active AND oa.company_id IS NOT NULL
              )
        ORDER BY c.name`,
      [params.userId]
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/ecard/[userId]/companies error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
