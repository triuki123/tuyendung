import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getVisibleCompanyIds, resolveDefaultCompanyId } from '@/lib/services/userCompanyService';

export const dynamic = 'force-dynamic';

/**
 * Cây nhân sự companies → company_level_staff → departments → sub_departments
 * (Phase 4.5 — org-structure-overhaul-plan.md):
 *  - Nguồn chính: org_assignments (phân công active). Người KIÊM NHIỆM xuất hiện
 *    ở MỌI đơn vị họ có phân công active.
 *  - Fallback: user cũ (users.company_id/department_id/sub_department_id) CHƯA có
 *    phân công active tại công ty đó vẫn hiển thị như trước — union, dedupe,
 *    không rơi người so với dữ liệu hiện tại.
 *  - Shape cũ GIỮ NGUYÊN, chỉ THÊM field trên mỗi staff entry:
 *    `org_role` ('head'|'deputy'|'assistant'|'member') và `is_concurrent`
 *    (true với các mục không phải phân công chính).
 */

type OrgRole = 'head' | 'deputy' | 'assistant' | 'member';

const ORG_ROLE_PRIORITY: Record<string, number> = { head: 0, deputy: 1, assistant: 2, member: 3 };

export async function GET(request: NextRequest) {
  try {
    // Chuyển sang công ty phụ = THOÁT VAI ở công ty chính: cơ cấu nhân sự chỉ của công ty
    // ĐANG CHỌN. Trước đây route gộp MỌI công ty user thuộc về → đứng ở công ty con vẫn
    // thấy lẫn nhân sự công ty mẹ.
    // super_admin (allowed = null) giữ đặc quyền xem toàn hệ thống.
    const allowed = await getVisibleCompanyIds(request.headers.get('x-current-user-id'));
    const activeCompanyId = resolveDefaultCompanyId(
      allowed,
      request.headers.get('x-current-user-company')
    );
    const scoped = allowed !== null;
    if (scoped && !activeCompanyId) {
      return NextResponse.json({ companies: [] });
    }
    const params: unknown[] = scoped ? [[activeCompanyId]] : [];
    const AND = (col: string) => (scoped ? `AND ${col} = ANY($1::uuid[])` : '');
    const WHERE = (col: string) => (scoped ? `WHERE ${col} = ANY($1::uuid[])` : '');

    const companies = await query<{ id: string; name: string; head_id: string | null }>(
      `SELECT id, name, head_id
       FROM companies
       WHERE is_active = true ${AND('id')}
       ORDER BY name`,
      params
    );

    const departments = await query<{
      id: string;
      name: string;
      company_id: string;
      parent_department_id: string | null;
      head_id: string | null;
    }>(
      `SELECT id, name, company_id, parent_department_id, head_id::text AS head_id
       FROM departments
       WHERE is_active = true ${AND('company_id')}`,
      params
    );

    const subDepts = await query<{
      id: string;
      name: string;
      department_id: string;
      head_id: string | null;
    }>(
      `SELECT sd.id, sd.name, sd.department_id, sd.head_id::text AS head_id
       FROM sub_departments sd
       INNER JOIN departments d ON d.id = sd.department_id
       WHERE sd.is_active = true ${AND('d.company_id')}`,
      params
    );

    const userColumns = `id, name, email, job_title_id, position_id::text AS position_id, position,
              company_id, department_id, sub_department_id, manager_id, status`;

    const users = await query<{
      id: string;
      name: string;
      email: string;
      job_title_id: string | null;
      position_id: string | null;
      position: string | null;
      company_id: string | null;
      department_id: string | null;
      sub_department_id: string | null;
      manager_id: string | null;
      status: string;
    }>(
      `SELECT ${userColumns}
       FROM users
       WHERE status = 'active'
       ${AND('company_id')}
       LIMIT 1000`,
      params
    );

    // Phân công tổ chức active (org_assignments) — nguồn chính của cây nhân sự
    const assignments = await query<{
      user_id: string;
      company_id: string;
      department_id: string | null;
      sub_department_id: string | null;
      position_id: string | null;
      org_role: OrgRole;
      is_primary: boolean;
      manager_id: string | null;
    }>(
      `SELECT oa.user_id::text AS user_id, oa.company_id::text AS company_id,
              oa.department_id::text AS department_id,
              oa.sub_department_id::text AS sub_department_id,
              oa.position_id::text AS position_id,
              oa.org_role, oa.is_primary,
              oa.manager_id::text AS manager_id
         FROM org_assignments oa
         INNER JOIN users au ON au.id = oa.user_id AND au.status = 'active'
        WHERE oa.is_active = true ${AND('oa.company_id')}`,
      params
    );

    const jobTitles = await query<{ id: string; title: string }>(
      `SELECT id, title FROM job_titles ${WHERE('company_id')}`,
      params
    );

    const positions = await query<{ id: string; name: string }>(
      `SELECT id::text AS id, name FROM positions ${WHERE('company_id')}`,
      params
    );

    const jobTitleMap = new Map(jobTitles.map((jt) => [jt.id, jt.title]));
    const positionMap = new Map(positions.map((p) => [p.id, p.name]));
    const userMap = new Map(users.map((u) => [u.id, u]));

    // Kiêm nhiệm đa công ty: user có phân công tại công ty scoped nhưng company_id chính
    // ở công ty khác → chưa nằm trong `users` (query bị scope) → nạp bổ sung theo id.
    const missingUserIds = Array.from(
      new Set(assignments.map((a) => a.user_id).filter((id) => !userMap.has(id)))
    );
    if (missingUserIds.length > 0) {
      const extraUsers = await query<typeof users[number]>(
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

    // Tên quản lý có thể là người ở CÔNG TY KHÁC (hoặc ngoài phạm vi scope) → nạp riêng
    // tên theo id, KHÔNG đẩy vào `users`/`userMap` (đó là nguồn của danh sách staff,
    // thêm người vào sẽ làm họ mọc ra trong cây tổ chức).
    const managerNameById = new Map<string, string>();
    const managerIds = Array.from(
      new Set(
        [
          ...assignments.map((a) => a.manager_id),
          ...users.map((u) => u.manager_id),
        ].filter((id): id is string => !!id)
      )
    );
    if (managerIds.length > 0) {
      const managers = await query<{ id: string; name: string }>(
        `SELECT id::text AS id, name FROM users WHERE id::text = ANY($1::text[])`,
        [managerIds]
      );
      for (const m of managers) managerNameById.set(m.id, m.name);
    }

    // Chức danh khi thiếu position của phân công cũng rơi về position_id trên users
    // (kiêm nhiệm có thể mang chức danh riêng của phân công đó).
    //
    // QUẢN LÝ THEO PHÂN CÔNG: mỗi phân công có manager_id riêng cho ĐÚNG công ty đó.
    // users.manager_id chỉ là quản lý ở công ty chính — chỉ dùng khi user chưa có
    // phân công (fallback dữ liệu cũ). Nhờ vậy một người làm Giám Đốc ở công ty phụ
    // không còn bị dính "Quản lý: <sếp ở công ty chính>".
    const toStaff = (
      user: typeof users[number],
      opts?: {
        positionId?: string | null;
        orgRole?: OrgRole;
        isConcurrent?: boolean;
        assignment?: Assignment;
      }
    ) => {
      const managerId = opts?.assignment ? opts.assignment.manager_id : user.manager_id;
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        job_title:
          positionMap.get((opts?.positionId || user.position_id) as string) ||
          positionMap.get(user.position_id as string) ||
          (user.position && user.position.trim()) ||
          jobTitleMap.get(user.job_title_id as string) ||
          'Chưa có chức danh',
        manager_id: managerId,
        manager_name: managerId ? managerNameById.get(managerId) || null : null,
        // Field MỚI (additive — shape cũ giữ nguyên):
        org_role: (opts?.orgRole || 'member') as OrgRole,
        is_concurrent: opts?.isConcurrent === true,
      };
    };

    type Assignment = typeof assignments[number];

    /**
     * Danh sách staff của 1 đơn vị = phân công active tại đơn vị (dedupe theo user,
     * ưu tiên phân công chính rồi vai trò cao hơn) UNION user cũ khớp cột thô
     * nhưng CHƯA có phân công active nào tại công ty (fallback không rơi người).
     */
    /**
     * Phân công "đánh dấu vai trò" thuần tuý: org_role head/deputy/assistant,
     * KHÔNG có chức danh riêng, và user còn phân công khác cùng công ty
     * (vai trò thật của họ nằm ở đó). Giữ vai trò trong đơn vị mình thuộc là
     * MỘT công việc — KHÔNG phải "Kiêm nhiệm".
     */
    const isRoleMarker = (a: Assignment, companyAssignments: Assignment[]) =>
      ['head', 'deputy', 'assistant'].includes(a.org_role) &&
      !a.position_id &&
      // cùng mảng gốc → so sánh identity là đủ để nhận "phân công khác của cùng user"
      companyAssignments.some((x) => x.user_id === a.user_id && x !== a);

    /**
     * Riêng marker TRƯỞNG bị loại hẳn khỏi danh sách staff (vương miện trên đơn vị
     * đã thể hiện); marker Phó/Trợ lý vẫn hiển thị trong danh sách (đó là nơi duy nhất
     * thể hiện vai trò của họ) nhưng không mang nhãn kiêm nhiệm.
     */
    const isHeadMarker = (a: Assignment, companyAssignments: Assignment[]) =>
      a.org_role === 'head' && isRoleMarker(a, companyAssignments);

    const collectStaff = (
      unitAssignments: Assignment[],
      legacyUsers: typeof users,
      assignedAtCompany: Set<string>,
      companyAssignments: Assignment[]
    ) => {
      const picked = new Map<string, { a?: Assignment; user: typeof users[number] }>();
      for (const a of unitAssignments) {
        if (isHeadMarker(a, companyAssignments)) continue;
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
        if (assignedAtCompany.has(u.id) || picked.has(u.id)) continue;
        picked.set(u.id, { user: u });
      }
      return Array.from(picked.values()).map(({ a, user }) =>
        toStaff(
          user,
          a
            ? {
                positionId: a.position_id,
                orgRole: a.org_role,
                // Marker vai trò (Phó/Trợ lý của đơn vị mình thuộc) không phải kiêm nhiệm
                isConcurrent: !a.is_primary && !isRoleMarker(a, companyAssignments),
                assignment: a,
              }
            : undefined
        )
      );
    };

    // ĐÃ GỠ heuristic "đoán trưởng theo số người báo cáo" (2026-07-04): nó tạo
    // vương miện ẢO cho đơn vị chưa gán trưởng thật → người dùng tưởng đã gán,
    // trong khi Bảng Công (chỉ tin dữ liệu khai báo) nói ngược lại. Đơn vị chưa
    // gán trưởng giờ hiển thị TRỐNG — danh sách cần gán nằm ở trang Sức Khoẻ Tổ Chức.

    /** Head từ org_assignments (org_role='head' tại đúng đơn vị, ưu tiên primary). */
    const headFromAssignments = (unitAssignments: Assignment[], companyAssignments: Assignment[]) => {
      const heads = unitAssignments
        .filter((a) => a.org_role === 'head' && userMap.has(a.user_id))
        .sort((x, y) => Number(y.is_primary) - Number(x.is_primary));
      if (heads.length === 0) return null;
      const a = heads[0];
      return toStaff(userMap.get(a.user_id)!, {
        positionId: a.position_id,
        orgRole: 'head',
        // Phân công đánh dấu trưởng (không chức danh riêng) KHÔNG phải kiêm nhiệm —
        // làm trưởng đơn vị mình thuộc là một công việc, badge chỉ dành cho vai trò thứ hai thật.
        isConcurrent: !a.is_primary && !isHeadMarker(a, companyAssignments),
        assignment: a,
      });
    };

    const resolveHead = (
      unitLevelAssignments: Assignment[],
      headId: string | null,
      _members: typeof users,
      companyAssignments: Assignment[]
    ) => {
      const fromAssignment = headFromAssignments(unitLevelAssignments, companyAssignments);
      if (fromAssignment) return fromAssignment;
      if (headId) {
        const user = userMap.get(headId);
        if (user) return toStaff(user);
      }
      // Không suy đoán — chưa gán trưởng thì trả null (hiển thị trống)
      return null;
    };

    const structure = {
      companies: companies.map((company) => {
        const companyAssignments = assignments.filter((a) => a.company_id === company.id);
        const assignedAtCompany = new Set(companyAssignments.map((a) => a.user_id));
        const legacyCompanyUsers = users.filter((u) => u.company_id === company.id);

        // Tổng distinct: user có phân công tại công ty ∪ user cũ chưa có phân công
        const totalIds = new Set<string>();
        for (const id of assignedAtCompany) if (userMap.has(id)) totalIds.add(id);
        for (const u of legacyCompanyUsers) if (!assignedAtCompany.has(u.id)) totalIds.add(u.id);

        // Cấp công ty: phân công department_id NULL (tường minh) ∪ user cũ department null
        const companyLevelAssignments = companyAssignments.filter((a) => !a.department_id);
        const legacyCompanyLevel = legacyCompanyUsers.filter((u) => !u.department_id);
        const companyLevelStaff = collectStaff(
          companyLevelAssignments,
          legacyCompanyLevel,
          assignedAtCompany,
          companyAssignments
        );

        // Danh sách user cho heuristic findHead (giữ hành vi cũ + user kiêm nhiệm)
        const companyMemberUsers = users.filter(
          (u) => u.company_id === company.id || assignedAtCompany.has(u.id)
        );

        const companyDepts = departments.filter((d) => d.company_id === company.id);

        return {
          id: company.id,
          name: company.name,
          total_users: totalIds.size,
          company_level_users: companyLevelStaff.length,
          company_level_staff: companyLevelStaff,
          head: resolveHead(companyLevelAssignments, company.head_id, companyMemberUsers, companyAssignments),
          departments: companyDepts.map((dept) => {
            const deptAssignments = companyAssignments.filter(
              (a) => a.department_id === dept.id
            );
            const deptLevelAssignments = deptAssignments.filter((a) => !a.sub_department_id);
            const legacyDeptUsers = legacyCompanyUsers.filter(
              (u) => u.department_id === dept.id
            );
            const legacyDeptLevel = legacyDeptUsers.filter((u) => !u.sub_department_id);

            const deptTotalIds = new Set<string>();
            for (const a of deptAssignments) if (userMap.has(a.user_id)) deptTotalIds.add(a.user_id);
            for (const u of legacyDeptUsers)
              if (!assignedAtCompany.has(u.id)) deptTotalIds.add(u.id);

            const deptLevelStaff = collectStaff(
              deptLevelAssignments,
              legacyDeptLevel,
              assignedAtCompany,
              companyAssignments
            );

            const deptSubDepts = subDepts.filter((sd) => sd.department_id === dept.id);

            return {
              id: dept.id,
              name: dept.name,
              total_users: deptTotalIds.size,
              department_level_users: deptLevelStaff.length,
              department_level_staff: deptLevelStaff,
              head: resolveHead(deptLevelAssignments, dept.head_id, legacyDeptUsers, companyAssignments),
              sub_departments: deptSubDepts.map((subDept) => {
                const subAssignments = deptAssignments.filter(
                  (a) => a.sub_department_id === subDept.id
                );
                const legacySubUsers = legacyDeptUsers.filter(
                  (u) => u.sub_department_id === subDept.id
                );
                const subStaff = collectStaff(subAssignments, legacySubUsers, assignedAtCompany, companyAssignments);

                return {
                  id: subDept.id,
                  name: subDept.name,
                  total_users: subStaff.length,
                  staff: subStaff,
                  head: resolveHead(subAssignments, subDept.head_id, legacySubUsers, companyAssignments),
                };
              }),
            };
          }),
        };
      }),
    };

    return NextResponse.json(structure);
  } catch (error) {
    console.error('Personnel structure fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch personnel structure' },
      { status: 500 }
    );
  }
}
