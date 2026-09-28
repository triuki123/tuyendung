import { NextRequest, NextResponse } from 'next/server';
import { checkModuleAccess } from '@/lib/api-permissions';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/hr/recruiters — danh sách nhân sự bộ phận Tuyển Dụng (sub_department
 * "Tuyển Dụng" thuộc Phòng Hành Chính Nhân Sự / FADO Group). Dùng cho dropdown
 * "Người phụ trách" của Yêu Cầu Tuyển Dụng — gói gọn đúng người làm tuyển dụng.
 */
export async function GET(request: NextRequest) {
  try {
    if (!checkModuleAccess(request, 'hr-resources', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const data = await query<{ id: string; name: string }>(
      `SELECT u.id::text AS id, u.name
         FROM users u
         JOIN sub_departments sd ON sd.id::text = NULLIF(u.sub_department_id::text, '')
        WHERE u.status = 'active' AND sd.name ILIKE '%tuyển dụng%'
        ORDER BY u.name`
    );
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/hr/recruiters error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
