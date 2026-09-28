import { query } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveContext } from '@/lib/services/userCompanyService';

/**
 * GET /api/assets/by-code/{code}
 * Lấy 1 tài sản theo mã (không phân biệt hoa thường) kèm TÊN loại/công ty/phòng ban/bộ phận.
 * Phục vụ quét QR → mở thẳng "Lý lịch tài sản" mà không cần vào trang quản lý.
 */
export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  try {
    const userId = req.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const activeCompany = req.headers.get('x-current-user-company');
    const ctx = await getEffectiveContext(userId, activeCompany);
    const role = ctx?.role ?? 'user';

    const code = decodeURIComponent(params.code || '').trim();
    if (!code) return NextResponse.json({ error: 'Thiếu mã tài sản' }, { status: 400 });

    const rows = await query(
      `SELECT a.*,
         ac.name AS category_name,
         co.name AS company_name,
         d.name  AS department_name,
         sd.name AS sub_department_name
       FROM assets a
       LEFT JOIN asset_categories ac ON ac.id::text = a.category::text
       LEFT JOIN companies co        ON co.id::text = a.company_id::text
       LEFT JOIN departments d       ON d.id::text  = a.department_id::text
       LEFT JOIN sub_departments sd  ON sd.id::text = a.sub_department_id::text
       WHERE lower(a.code) = lower($1)
       LIMIT 1`,
      [code]
    );

    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return NextResponse.json({ error: 'Không tìm thấy tài sản' }, { status: 404 });

    // Kiểm tra company scope (NULL = backward compat; super_admin thấy tất cả)
    if (role !== 'super_admin' && row.company_id && activeCompany && row.company_id !== activeCompany) {
      return NextResponse.json({ error: 'Không tìm thấy tài sản' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: row });
  } catch (error) {
    console.error('GET /api/assets/by-code error:', error);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
