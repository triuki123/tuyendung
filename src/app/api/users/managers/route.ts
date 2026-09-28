import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/users/managers?company_id=XXX
 * Returns all active users in a specific company for manager selection dropdown.
 * Used for populating manager dropdowns in user assignment forms (CRUD modal)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('company_id');

    if (!companyId) {
      return NextResponse.json(
        { error: 'company_id is required' },
        { status: 400 }
      );
    }

    console.log('[Managers API] Fetching managers for company_id:', companyId);

    // Người có thể làm quản lý tại công ty này = người LÀM VIỆC tại đây:
    //  - công ty chính (users.company_id = $1), HOẶC
    //  - kiêm nhiệm (có membership active ở $1 — Đa Công Ty).
    // Với người kiêm nhiệm, phòng ban/bộ phận/chức vụ tại công ty này nằm ở
    // membership → COALESCE(membership, users) để hiển thị đúng ngữ cảnh công ty $1.
    // CHỈ-THÊM: người công ty chính không có membership cho $1 nên luôn rơi về
    // users.* → hành vi công ty chính KHÔNG đổi.
    const rows = await query<{
      id: string;
      name: string;
      email: string;
      company_id: string;
      department_id: string | null;
      sub_department_id: string | null;
      job_title: string | null;
      dept_positions: Record<string, string> | null;
      head_departments: string[] | null;
      head_sub_departments: string[] | null;
    }>(
      `SELECT u.id, u.name, u.email, $1 AS company_id,
              COALESCE(m.department_id::text, u.department_id::text)         AS department_id,
              COALESCE(m.sub_department_id::text, u.sub_department_id::text) AS sub_department_id,
              COALESCE(pm.name, p.name)                                     AS job_title,
              -- Đơn vị mà người này GIỮ CHỨC TRƯỞNG/PHÓ (org_assignments.org_role).
              -- Dùng để đẩy đúng người quản lý của phòng ban/bộ phận lên đầu danh sách
              -- gợi ý, thay vì bắt người dùng tự dò trong toàn bộ nhân sự công ty.
              COALESCE((
                SELECT array_agg(DISTINCT oa.department_id::text)
                  FROM org_assignments oa
                 WHERE oa.user_id = u.id AND oa.company_id = $1 AND oa.is_active
                   AND oa.org_role IN ('head', 'deputy') AND oa.department_id IS NOT NULL
              ), ARRAY[]::text[])                                            AS head_departments,
              COALESCE((
                SELECT array_agg(DISTINCT oa.sub_department_id::text)
                  FROM org_assignments oa
                 WHERE oa.user_id = u.id AND oa.company_id = $1 AND oa.is_active
                   AND oa.org_role IN ('head', 'deputy') AND oa.sub_department_id IS NOT NULL
              ), ARRAY[]::text[])                                            AS head_sub_departments,
              -- Chức vụ theo TỪNG phòng ban (từ org_assignments) → nhãn bám ngữ cảnh phòng ban.
              COALESCE((
                SELECT jsonb_object_agg(oa.department_id::text, pos.name)
                  FROM org_assignments oa
                  JOIN positions pos ON pos.id = oa.position_id
                 WHERE oa.user_id = u.id AND oa.company_id = $1 AND oa.is_active
                   AND oa.department_id IS NOT NULL AND oa.position_id IS NOT NULL
              ), '{}'::jsonb)                                               AS dept_positions
       FROM users u
       LEFT JOIN user_company_memberships m
              ON m.user_id = u.id AND m.company_id = $1 AND m.is_active = true
       LEFT JOIN positions p  ON p.id::text  = u.position_id::text
       LEFT JOIN positions pm ON pm.id::text = m.position_id::text
       WHERE u.status = 'active'
         AND (u.company_id = $1 OR m.user_id IS NOT NULL)
       ORDER BY u.name`,
      [companyId]
    );

    console.log('[Managers API] Found', rows.length, 'managers for company:', companyId);

    // Trả về TOÀN BỘ thành viên công ty (không cắt bớt) kèm đơn vị của họ — client
    // dùng department_id/sub_department_id + head_* để NHÓM và xếp thứ tự gợi ý.
    // Cố ý không lọc ở server: quản lý trực tiếp đôi khi nằm ngoài phòng ban
    // (báo cáo chéo), lọc cứng sẽ làm không chọn được người đó.
    const formattedManagers = rows
      .filter(user => user.id && user.name)
      .map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        job_title: user.job_title || 'No Title',
        dept_positions: user.dept_positions || {},
        department_id: user.department_id,
        sub_department_id: user.sub_department_id,
        head_departments: user.head_departments || [],
        head_sub_departments: user.head_sub_departments || [],
        level: user.sub_department_id
          ? 'sub_department'
          : user.department_id
          ? 'department'
          : 'company',
      }));

    return NextResponse.json(formattedManagers);
  } catch (error) {
    console.error('Managers fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch managers' },
      { status: 500 }
    );
  }
}
