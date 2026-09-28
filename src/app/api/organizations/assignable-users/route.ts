/**
 * GET /api/organizations/assignable-users?company_id=...
 * Danh sách user ĐÃ CÓ PHÂN CÔNG active tại công ty — nguồn duy nhất cho các
 * dropdown gán Trưởng/Phó đơn vị (quy tắc "Phân công trước, gán chức sau").
 * Ai chưa được phân công tại công ty sẽ KHÔNG xuất hiện.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { checkUnitAccess } from '@/lib/api-permissions';
import { getVisibleCompanyIds } from '@/lib/services/userCompanyService';

export async function GET(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'organization', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('company_id');
    if (!companyId) {
      return NextResponse.json({ error: 'Thiếu company_id' }, { status: 400 });
    }
    // Không phải super_admin → chỉ liệt kê user của công ty MÌNH THUỘC VỀ.
    const allowed = await getVisibleCompanyIds(request.headers.get('x-current-user-id'));
    if (allowed !== null && !allowed.includes(companyId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const rows = await query<any>(
      `SELECT DISTINCT ON (u.id)
              u.id::text AS id, u.name, u.email, u.avatar,
              pos.name AS position_name,
              d.name AS department_name
         FROM org_assignments oa
         JOIN users u ON u.id = oa.user_id AND u.status = 'active'
         LEFT JOIN positions pos ON pos.id = oa.position_id
         LEFT JOIN departments d ON d.id = oa.department_id
        WHERE oa.company_id::text = $1 AND oa.is_active
        ORDER BY u.id, oa.is_primary DESC`,
      [companyId]
    );
    rows.sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi'));
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/organizations/assignable-users error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
