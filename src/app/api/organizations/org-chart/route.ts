import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getVisibleCompanyIds, resolveDefaultCompanyId } from '@/lib/services/userCompanyService';

export const dynamic = 'force-dynamic';

/**
 * Sơ đồ tổ chức (Phase 4.5 — org-structure-overhaul-plan.md):
 *  - head_name/head_avatar: ƯU TIÊN org_assignments (org_role='head' của đúng đơn vị,
 *    phân công active, ưu tiên is_primary), FALLBACK cột head_id denormalized như cũ.
 *    Áp dụng cho CẢ 3 cấp: công ty (department_id NULL) → phòng ban → bộ phận.
 *  - member_count: đếm DISTINCT user theo phân công active của đơn vị (gồm kiêm nhiệm),
 *    CỘNG fallback user cũ khớp users.department_id nhưng CHƯA có bất kỳ phân công active
 *    nào — bảo đảm không giảm count so với trước với dữ liệu hiện tại.
 *  - members (ADDITIVE): danh sách thành viên TRỰC THUỘC đúng cấp đơn vị
 *    (company-level: department NULL; department-level: đúng dept + sub NULL; sub: đúng sub).
 *    Nguồn org_assignments active + fallback user cũ chưa có phân công (không rơi người).
 *    Dedupe theo user (ưu tiên primary rồi vai trò cao hơn). `is_concurrent` = !is_primary
 *    VÀ KHÔNG phải marker vai trò — logic copy từ structure/personnel/route.ts cho nhất quán.
 *    Head đã hiển thị trên card nên bị LOẠI khỏi members (không lặp).
 *  - KHÔNG suy đoán trưởng: chưa gán thì head_name = null (hiển thị trống).
 */

type OrgRole = 'head' | 'deputy' | 'assistant' | 'member';

const ORG_ROLE_PRIORITY: Record<string, number> = { head: 0, deputy: 1, assistant: 2, member: 3 };

interface MemberEntry {
  id: string;
  name: string;
  avatar: string | null;
  position_name: string | null;
  org_role: OrgRole;
  is_concurrent: boolean;
  rank?: number | null;
}

interface UserRow {
  id: string;
  name: string;
  avatar: string | null;
  position_id: string | null;
  position: string | null;
  company_id: string | null;
  department_id: string | null;
  sub_department_id: string | null;
}

interface AssignmentRow {
  user_id: string;
  company_id: string;
  department_id: string | null;
  sub_department_id: string | null;
  position_id: string | null;
  org_role: OrgRole;
  is_primary: boolean;
}

export async function GET(request: NextRequest) {
  const requestedCompanyId = request.nextUrl.searchParams.get('companyId');

  try {
    // Chuyển sang công ty phụ = THOÁT VAI ở công ty chính: sơ đồ phải là của công ty
    // ĐANG CHỌN trên switcher, không phải công ty chính.
    //
    // Trước đây route mặc định về allowed[0] (= công ty chính) khi client không truyền
    // companyId → Giám Đốc công ty con đứng ở công ty con vẫn chỉ thấy sơ đồ công ty mẹ.
    //
    // super_admin (allowed = null) giữ nguyên đặc quyền xem toàn hệ thống.
    const allowed = await getVisibleCompanyIds(request.headers.get('x-current-user-id'));
    const activeCompanyId = request.headers.get('x-current-user-company');

    if (requestedCompanyId && allowed !== null && !allowed.includes(requestedCompanyId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const defaultCompanyId = resolveDefaultCompanyId(allowed, activeCompanyId);
    const effectiveCompanyId = requestedCompanyId ?? defaultCompanyId;

    if (allowed !== null && !effectiveCompanyId) {
      return NextResponse.json({ companies: [], departments: [], subDepartments: [] });
    }

    // null = không lọc (chỉ super_admin không chỉ định công ty)
    const companyIds: string[] | null = effectiveCompanyId ? [effectiveCompanyId] : null;

    const scoped = companyIds !== null;
    const params: unknown[] = scoped ? [companyIds] : [];
    /** Điều kiện lọc công ty — dùng chung cho mọi query bên dưới. */
    const inScope = (col: string) => (scoped ? `AND ${col} = ANY($1::uuid[])` : '');

    const companies = await query<{
      id: string; name: string; logo_url: string | null; group_id: string | null;
      head_name: string | null; head_avatar: string | null; head_user_id: string | null;
      head_job_title: string | null; head_rank: number | null;
      member_count: number;
      is_head_concurrent: boolean;
    }>(
      `SELECT
        c.id::text, c.name, c.group_id, COALESCE(c.logo_urls->>'full_dark', c.logo_url) AS logo_url,
        CASE WHEN ah.user_id IS NOT NULL THEN ah.name ELSE u.name END AS head_name,
        CASE WHEN ah.user_id IS NOT NULL THEN ah.avatar ELSE u.avatar END AS head_avatar,
        CASE WHEN ah.user_id IS NOT NULL THEN ah.user_id::text ELSE u.id::text END AS head_user_id,
        CASE WHEN ah.user_id IS NOT NULL THEN ah.head_job_title ELSE up.name END AS head_job_title,
        CASE WHEN ah.user_id IS NOT NULL THEN ah.head_rank ELSE up.rank END AS head_rank,
        (SELECT COUNT(DISTINCT mid)::int FROM (
           SELECT oa.user_id AS mid
             FROM org_assignments oa
             JOIN users au ON au.id = oa.user_id AND au.status = 'active'
            WHERE oa.company_id::text = c.id::text AND oa.is_active
           UNION
           SELECT u2.id AS mid
             FROM users u2
            WHERE u2.company_id::text = c.id::text AND u2.status = 'active'
              AND NOT EXISTS (
                SELECT 1 FROM org_assignments oa2
                 WHERE oa2.user_id = u2.id AND oa2.is_active
              )
         ) members) AS member_count,
        COALESCE(ah.user_id IS NOT NULL AND NOT ah.is_primary, false) AS is_head_concurrent
      FROM companies c
      LEFT JOIN LATERAL (
        SELECT hu.id AS user_id, hu.name, hu.avatar, oa.is_primary,
               hp.name AS head_job_title, hp.rank AS head_rank
          FROM org_assignments oa
          JOIN users hu ON hu.id = oa.user_id AND hu.status = 'active'
          LEFT JOIN positions hp ON hp.id::text = COALESCE(oa.position_id::text, hu.position_id::text)
         WHERE oa.company_id::text = c.id::text AND oa.department_id IS NULL
           AND oa.org_role = 'head' AND oa.is_active
         ORDER BY oa.is_primary DESC, oa.created_at
         LIMIT 1
      ) ah ON true
      LEFT JOIN users u ON u.id::text = c.head_id AND u.status = 'active'
      LEFT JOIN positions up ON up.id::text = u.position_id::text
      WHERE c.is_active = true ${inScope('c.id')}
      ORDER BY c.name`,
      params
    );

    const departments = await query<{
      id: string; name: string; company_id: string;
      parent_department_id: string | null; head_name: string | null;
      head_avatar: string | null; head_user_id: string | null; head_job_title: string | null;
      head_rank: number | null;
      member_count: number;
      is_head_concurrent: boolean;
    }>(
      `SELECT
        d.id::text, d.name, d.company_id::text,
        d.parent_department_id::text,
        CASE WHEN ah.user_id IS NOT NULL THEN ah.name ELSE u.name END AS head_name,
        CASE WHEN ah.user_id IS NOT NULL THEN ah.avatar ELSE u.avatar END AS head_avatar,
        CASE WHEN ah.user_id IS NOT NULL THEN ah.user_id::text ELSE u.id::text END AS head_user_id,
        CASE WHEN ah.user_id IS NOT NULL THEN ah.head_job_title ELSE up.name END AS head_job_title,
        CASE WHEN ah.user_id IS NOT NULL THEN ah.head_rank ELSE up.rank END AS head_rank,
        COALESCE(ah.user_id IS NOT NULL AND NOT ah.is_primary, false) AS is_head_concurrent,
        (SELECT COUNT(DISTINCT mid)::int FROM (
           SELECT oa.user_id AS mid
             FROM org_assignments oa
             JOIN users au ON au.id = oa.user_id AND au.status = 'active'
            WHERE oa.department_id = d.id AND oa.is_active
           UNION
           SELECT u2.id AS mid
             FROM users u2
            WHERE u2.department_id = d.id AND u2.status = 'active'
              AND NOT EXISTS (
                SELECT 1 FROM org_assignments oa2
                 WHERE oa2.user_id = u2.id AND oa2.is_active
              )
         ) members) AS member_count
      FROM departments d
      LEFT JOIN LATERAL (
        SELECT hu.id AS user_id, hu.name, hu.avatar, oa.is_primary,
               hp.name AS head_job_title, hp.rank AS head_rank
          FROM org_assignments oa
          JOIN users hu ON hu.id = oa.user_id AND hu.status = 'active'
          LEFT JOIN positions hp ON hp.id::text = COALESCE(oa.position_id::text, hu.position_id::text)
         WHERE oa.department_id = d.id AND oa.sub_department_id IS NULL
           AND oa.org_role = 'head' AND oa.is_active
         ORDER BY oa.is_primary DESC, oa.created_at
         LIMIT 1
      ) ah ON true
      LEFT JOIN users u ON u.id = d.head_id
      LEFT JOIN positions up ON up.id::text = u.position_id::text
      WHERE d.is_active = true ${inScope('d.company_id')}
      ORDER BY d.display_order, d.name`,
      params
    );

    const subDepartments = await query<{
      id: string; name: string; department_id: string; parent_sub_department_id: string | null;
      head_name: string | null; head_avatar: string | null;
      head_user_id: string | null; head_job_title: string | null; head_rank: number | null;
      member_count: number;
      is_head_concurrent: boolean;
    }>(
      `SELECT
        sd.id::text, sd.name, sd.department_id::text, sd.parent_sub_department_id::text,
        CASE WHEN ah.user_id IS NOT NULL THEN ah.name ELSE u.name END AS head_name,
        CASE WHEN ah.user_id IS NOT NULL THEN ah.avatar ELSE u.avatar END AS head_avatar,
        CASE WHEN ah.user_id IS NOT NULL THEN ah.user_id::text ELSE u.id::text END AS head_user_id,
        CASE WHEN ah.user_id IS NOT NULL THEN ah.head_job_title ELSE up.name END AS head_job_title,
        CASE WHEN ah.user_id IS NOT NULL THEN ah.head_rank ELSE up.rank END AS head_rank,
        COALESCE(ah.user_id IS NOT NULL AND NOT ah.is_primary, false) AS is_head_concurrent,
        (SELECT COUNT(DISTINCT mid)::int FROM (
           SELECT oa.user_id AS mid
             FROM org_assignments oa
             JOIN users au ON au.id = oa.user_id AND au.status = 'active'
            WHERE oa.sub_department_id = sd.id AND oa.is_active
           UNION
           SELECT u2.id AS mid
             FROM users u2
            WHERE (u2.department_id = sd.id OR u2.sub_department_id = sd.id)
              AND u2.status = 'active'
              AND NOT EXISTS (
                SELECT 1 FROM org_assignments oa2
                 WHERE oa2.user_id = u2.id AND oa2.is_active
              )
         ) members) AS member_count
      FROM sub_departments sd
      LEFT JOIN LATERAL (
        SELECT hu.id AS user_id, hu.name, hu.avatar, oa.is_primary,
               hp.name AS head_job_title, hp.rank AS head_rank
          FROM org_assignments oa
          JOIN users hu ON hu.id = oa.user_id AND hu.status = 'active'
          LEFT JOIN positions hp ON hp.id::text = COALESCE(oa.position_id::text, hu.position_id::text)
         WHERE oa.sub_department_id = sd.id
           AND oa.org_role = 'head' AND oa.is_active
         ORDER BY oa.is_primary DESC, oa.created_at
         LIMIT 1
      ) ah ON true
      LEFT JOIN users u ON u.id = sd.head_id
      LEFT JOIN positions up ON up.id::text = u.position_id::text
      LEFT JOIN departments d ON d.id = sd.department_id
      WHERE sd.is_active = true ${inScope('d.company_id')}
      ORDER BY sd.display_order, sd.name`,
      params
    );

    // ── Members per node (ADDITIVE) ──────────────────────────────────────────
    const userColumns = `id::text AS id, name, avatar, position_id::text AS position_id,
              position, company_id::text AS company_id, department_id::text AS department_id,
              sub_department_id::text AS sub_department_id`;

    const users = await query<UserRow>(
      `SELECT ${userColumns}
       FROM users
       WHERE status = 'active' ${inScope('company_id')}
       LIMIT 2000`,
      params
    );

    const assignments = await query<AssignmentRow>(
      `SELECT oa.user_id::text AS user_id, oa.company_id::text AS company_id,
              oa.department_id::text AS department_id,
              oa.sub_department_id::text AS sub_department_id,
              oa.position_id::text AS position_id,
              oa.org_role, oa.is_primary
         FROM org_assignments oa
         INNER JOIN users au ON au.id = oa.user_id AND au.status = 'active'
        WHERE oa.is_active = true ${inScope('oa.company_id')}`,
      params
    );

    const positions = await query<{ id: string; name: string; rank: number | null }>(
      `SELECT id::text AS id, name, rank FROM positions
        WHERE true ${inScope('company_id')}`,
      params
    );

    const positionMap = new Map(positions.map((p) => [p.id, p.name]));
    const positionRankMap = new Map(positions.map((p) => [p.id, p.rank]));
    const userMap = new Map(users.map((u) => [u.id, u]));

    // Kiêm nhiệm đa công ty: user có phân công tại công ty scoped nhưng company_id chính
    // ở công ty khác → chưa nằm trong `users` (query bị scope) → nạp bổ sung theo id.
    const missingUserIds = Array.from(
      new Set(assignments.map((a) => a.user_id).filter((id) => !userMap.has(id)))
    );
    if (missingUserIds.length > 0) {
      const extraUsers = await query<UserRow>(
        `SELECT ${userColumns}
           FROM users
          WHERE status = 'active' AND id::text = ANY($1::text[])`,
        [missingUserIds]
      );
      for (const u of extraUsers) {
        users.push(u);
        userMap.set(u.id, u);
      }
    }

    /**
     * Phân công "đánh dấu vai trò" thuần tuý: org_role head/deputy/assistant,
     * KHÔNG có chức danh riêng, và user còn phân công khác cùng công ty
     * (vai trò thật của họ nằm ở đó). Giữ vai trò trong đơn vị mình thuộc là
     * MỘT công việc — KHÔNG phải "Kiêm nhiệm".
     * (Copy từ structure/personnel/route.ts cho nhất quán.)
     */
    const isRoleMarker = (a: AssignmentRow, companyAssignments: AssignmentRow[]) =>
      ['head', 'deputy', 'assistant'].includes(a.org_role) &&
      !a.position_id &&
      companyAssignments.some((x) => x.user_id === a.user_id && x !== a);

    const toMember = (user: UserRow, a?: AssignmentRow, companyAssignments?: AssignmentRow[]): MemberEntry => ({
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      position_name:
        positionMap.get((a?.position_id || user.position_id) as string) ||
        positionMap.get(user.position_id as string) ||
        (user.position && user.position.trim()) ||
        null,
      org_role: (a?.org_role || 'member') as OrgRole,
      is_concurrent:
        !!a && !a.is_primary && !(companyAssignments && isRoleMarker(a, companyAssignments)),
      rank:
        positionRankMap.get((a?.position_id || user.position_id) as string) ??
        positionRankMap.get(user.position_id as string) ??
        null,
    });

    /**
     * Thành viên của 1 đơn vị = phân công active tại ĐÚNG cấp đơn vị (dedupe theo user,
     * ưu tiên phân công chính rồi vai trò cao hơn) UNION user cũ khớp cột thô nhưng
     * CHƯA có phân công active nào tại công ty (fallback không rơi người).
     * `excludeUserId` = head đã hiện trên card → không lặp trong danh sách.
     */
    const collectMembers = (
      unitAssignments: AssignmentRow[],
      legacyUsers: UserRow[],
      assignedAtCompany: Set<string>,
      companyAssignments: AssignmentRow[],
      excludeUserId: string | null
    ): MemberEntry[] => {
      const picked = new Map<string, { a?: AssignmentRow; user: UserRow }>();
      for (const a of unitAssignments) {
        if (a.user_id === excludeUserId) continue;
        const user = userMap.get(a.user_id);
        if (!user) continue;
        const prev = picked.get(a.user_id)?.a;
        const better =
          !prev ||
          (a.is_primary && !prev.is_primary) ||
          (a.is_primary === prev.is_primary &&
            ORG_ROLE_PRIORITY[a.org_role] < ORG_ROLE_PRIORITY[prev.org_role]);
        if (better) picked.set(a.user_id, { a, user });
      }
      for (const u of legacyUsers) {
        if (u.id === excludeUserId) continue;
        if (assignedAtCompany.has(u.id) || picked.has(u.id)) continue;
        picked.set(u.id, { user: u });
      }
      return Array.from(picked.values())
        .map(({ a, user }) => toMember(user, a, companyAssignments))
        .sort(
          (x, y) =>
            ORG_ROLE_PRIORITY[x.org_role] - ORG_ROLE_PRIORITY[y.org_role] ||
            // Cùng vai trò → CẤP BẬC cao đứng trước (Nhân Viên trên Thực Tập Sinh).
            // Chưa gán cấp bậc = xuống cuối.
            (x.rank ?? 9999) - (y.rank ?? 9999) ||
            x.name.localeCompare(y.name, 'vi')
        );
    };

    // Index assignments theo công ty một lần cho nhanh
    const byCompany = new Map<string, AssignmentRow[]>();
    for (const a of assignments) {
      const arr = byCompany.get(a.company_id);
      if (arr) arr.push(a);
      else byCompany.set(a.company_id, [a]);
    }

    const companiesOut = companies.map((c) => {
      const companyAssignments = byCompany.get(c.id) || [];
      const assignedAtCompany = new Set(companyAssignments.map((a) => a.user_id));
      const legacyCompanyLevel = users.filter(
        (u) => u.company_id === c.id && !u.department_id
      );
      const companyLevelAssignments = companyAssignments.filter((a) => !a.department_id);
      const members = collectMembers(
        companyLevelAssignments,
        legacyCompanyLevel,
        assignedAtCompany,
        companyAssignments,
        c.head_user_id
      );

      // ĐỈNH công ty = người CẤP BẬC CAO NHẤT (rank nhỏ nhất) trong Ban Lãnh Đạo (gồm cả head
      // hiện tại). Còn lại xếp theo rank tăng dần. rank null coi như thấp nhất.
      const leadership: MemberEntry[] = [...members];
      if (c.head_user_id && c.head_name) {
        leadership.unshift({
          id: c.head_user_id, name: c.head_name, avatar: c.head_avatar,
          position_name: c.head_job_title, org_role: 'head',
          is_concurrent: c.is_head_concurrent, rank: c.head_rank,
        });
      }
      const rankVal = (m: MemberEntry) => (m.rank == null ? 9999 : m.rank);
      leadership.sort(
        (a, b) => rankVal(a) - rankVal(b) ||
          ORG_ROLE_PRIORITY[a.org_role] - ORG_ROLE_PRIORITY[b.org_role] ||
          a.name.localeCompare(b.name, 'vi')
      );
      const top = leadership[0];
      return {
        ...c,
        head_name: top?.name ?? c.head_name,
        head_avatar: top?.avatar ?? c.head_avatar,
        head_user_id: top?.id ?? c.head_user_id,
        head_job_title: top?.position_name ?? c.head_job_title,
        is_head_concurrent: top?.is_concurrent ?? c.is_head_concurrent,
        members: leadership.slice(1),
      };
    });

    const departmentsOut = departments.map((d) => {
      const companyAssignments = byCompany.get(d.company_id) || [];
      const assignedAtCompany = new Set(companyAssignments.map((a) => a.user_id));
      const deptLevelAssignments = companyAssignments.filter(
        (a) => a.department_id === d.id && !a.sub_department_id
      );
      const legacyDeptLevel = users.filter(
        (u) => u.company_id === d.company_id && u.department_id === d.id && !u.sub_department_id
      );
      return {
        ...d,
        members: collectMembers(
          deptLevelAssignments,
          legacyDeptLevel,
          assignedAtCompany,
          companyAssignments,
          d.head_user_id
        ),
      };
    });

    const deptCompanyMap = new Map(departments.map((d) => [d.id, d.company_id]));

    const subDepartmentsOut = subDepartments.map((sd) => {
      const companyId = deptCompanyMap.get(sd.department_id) || '';
      const companyAssignments = byCompany.get(companyId) || [];
      const assignedAtCompany = new Set(companyAssignments.map((a) => a.user_id));
      const subAssignments = companyAssignments.filter(
        (a) => a.sub_department_id === sd.id
      );
      const legacySubUsers = users.filter(
        (u) =>
          u.company_id === companyId &&
          (u.department_id === sd.id || u.sub_department_id === sd.id)
      );
      return {
        ...sd,
        members: collectMembers(
          subAssignments,
          legacySubUsers,
          assignedAtCompany,
          companyAssignments,
          sd.head_user_id
        ),
      };
    });

    // Nhóm/Tập đoàn (tầng trên công ty). Trả tất cả nhóm đang bật; layout chỉ vẽ nhóm có
    // công ty/nhóm con hiển thị.
    const groups = await query<{ id: string; name: string; parent_id: string | null }>(
      `SELECT id, name, parent_id FROM company_groups WHERE is_active = true
        ORDER BY display_order, name`
    );

    return NextResponse.json({
      companies: companiesOut,
      departments: departmentsOut,
      subDepartments: subDepartmentsOut,
      groups,
    });
  } catch (err) {
    console.error('GET /api/organizations/org-chart error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
