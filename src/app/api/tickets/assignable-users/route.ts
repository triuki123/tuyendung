import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getEffectiveContext } from '@/lib/services/userCompanyService';

// GET /api/tickets/assignable-users?tagId=<org_tag_id>
// Tra ve danh sach nhan su CO THE duoc giao ticket.
//   - Co tagId: chi nhung nguoi thuoc don vi (cong ty/phong ban/bo phan) mang tag do.
//   - Khong tagId: tat ca nhan su dang hoat dong trong cong ty hien tai.
// Scope theo activeCompany: admin/super_admin => toan bo; cac role khac => theo company.
export async function GET(req: NextRequest) {
  try {
    const currentUserId = req.headers.get('x-current-user-id');
    if (!currentUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const activeCompany = req.headers.get('x-current-user-company');
    const ctx = await getEffectiveContext(currentUserId, activeCompany);
    const role = ctx?.role ?? 'user';

    const tagId = req.nextUrl.searchParams.get('tagId');

    if (!tagId) {
      // super_admin không bị giới hạn công ty; các role khác scope theo activeCompany
      const params_arr: string[] = [];
      let whereExtra = '';
      if (role !== 'super_admin' && activeCompany) {
        whereExtra = ` AND (u.company_id::text = $1 OR u.id::text IN (
          SELECT user_id::text FROM user_company_memberships WHERE company_id::text = $1 AND is_active = TRUE
        ))`;
        params_arr.push(activeCompany);
      }

      const all = await query(
        `SELECT u.id, u.name, u.email, u.department, u.position, u.avatar,
                CONCAT_WS(' · ', pos.name, sd.name, d.name) as job_title
           FROM users u
          LEFT JOIN public.positions pos ON pos.id::text = u.position_id::text
          LEFT JOIN public.sub_departments sd ON sd.id::text = u.sub_department_id::text
          LEFT JOIN public.departments d ON d.id::text = u.department_id::text
          WHERE u.status = 'active'${whereExtra}
          ORDER BY u.name ASC`,
        params_arr
      );
      return NextResponse.json(all);
    }

    const rows = await query(
      `SELECT DISTINCT u.id, u.name, u.email, u.department, u.position, u.avatar,
                       CONCAT_WS(' · ', pos.name, sd.name, d.name) as job_title
         FROM users u
        LEFT JOIN public.positions pos ON pos.id::text = u.position_id::text
        LEFT JOIN public.sub_departments sd ON sd.id::text = u.sub_department_id::text
        LEFT JOIN public.departments d ON d.id::text = u.department_id::text
        WHERE u.status = 'active'
          AND (
            u.company_id::text IN (
              SELECT company_id::text FROM org_tag_assignments
               WHERE tag_id = $1 AND company_id IS NOT NULL
            )
            OR u.department_id::text IN (
              SELECT department_id::text FROM org_tag_assignments
               WHERE tag_id = $1 AND department_id IS NOT NULL
            )
            OR u.sub_department_id::text IN (
              SELECT sub_department_id::text FROM org_tag_assignments
               WHERE tag_id = $1 AND sub_department_id IS NOT NULL
            )
          )
        ORDER BY u.name ASC`,
      [tagId]
    );
    return NextResponse.json(rows);
  } catch (error: any) {
    console.error('GET /api/tickets/assignable-users error:', error);
    return NextResponse.json({ error: error.message || 'Lỗi server' }, { status: 500 });
  }
}
