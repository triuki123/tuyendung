/**
 * Phạm vi NHÌN THẤY yêu cầu tuyển dụng — dùng chung cho
 * GET /api/hr/requisitions (danh sách) và /api/hr/requisitions/[id] (bản ghi).
 *
 * Trước đây manager bị lọc theo CÂY NGƯỜI (owner_id/created_by phải nằm trong cấp dưới),
 * nên trưởng phòng KHÔNG thấy yêu cầu của chính phòng mình khi người tạo không phải
 * cấp dưới trực tiếp (vd HR tạo hộ) — xem bug "TTS kế toán / Phòng Kế Toán".
 * Nay phạm vi = ĐƠN VỊ mình phụ trách HOẶC cây cấp dưới, và bộ phận Tuyển Dụng
 * (có 'hr-requisitions' → view) thì không bị lọc theo cây người nữa.
 */
import { query } from '@/lib/db';
import { getOrgSubtreeUserIds } from '@/lib/services/attendanceService';

/** Phần thông tin của một yêu cầu cần để quyết định hiển thị. */
export interface RequisitionScopeTarget {
  department_id?: string | null;
  sub_department_id?: string | null;
  owner_id?: string | null;
  created_by?: string | null;
  requested_by?: string | null;
}

export interface RequisitionScope {
  /** Không lọc thêm — super_admin, admin, hoặc người của bộ phận Tuyển Dụng. */
  unrestricted: boolean;
  /** Bản thân + toàn bộ cấp dưới (cây org_assignments.manager_id). */
  userIds: Set<string>;
  /** Phòng ban manager phụ trách (head_id) hoặc đang được phân công. */
  departmentIds: Set<string>;
  /** Bộ phận (sub-department) manager phụ trách hoặc đang được phân công. */
  subDepartmentIds: Set<string>;
}

const norm = (v: string | null | undefined): string => (v ? String(v).trim().toLowerCase() : '');

/**
 * Các đơn vị mà một người được coi là phụ trách: đứng đầu (departments.head_id /
 * sub_departments.head_id) HOẶC đang có phân công active trong org_assignments.
 */
async function getManagedOrgUnitIds(
  userId: string,
  companyId: string | null
): Promise<{ departmentIds: Set<string>; subDepartmentIds: Set<string> }> {
  const uid = norm(userId);
  const rows = await query<{ kind: string; unit_id: string | null }>(
    `SELECT 'dept' AS kind, d.id::text AS unit_id
       FROM departments d
      WHERE lower(d.head_id::text) = $1
        AND ($2::uuid IS NULL OR d.company_id = $2::uuid)
     UNION
     SELECT 'sub', sd.id::text
       FROM sub_departments sd
       LEFT JOIN departments d2 ON d2.id = sd.department_id
      WHERE lower(sd.head_id::text) = $1
        AND ($2::uuid IS NULL OR d2.company_id = $2::uuid)
     UNION
     SELECT 'dept', oa.department_id::text
       FROM org_assignments oa
      WHERE lower(oa.user_id::text) = $1 AND oa.is_active
        AND oa.department_id IS NOT NULL
        AND ($2::uuid IS NULL OR oa.company_id = $2::uuid)
     UNION
     SELECT 'sub', oa.sub_department_id::text
       FROM org_assignments oa
      WHERE lower(oa.user_id::text) = $1 AND oa.is_active
        AND oa.sub_department_id IS NOT NULL
        AND ($2::uuid IS NULL OR oa.company_id = $2::uuid)`,
    [uid, companyId || null]
  );

  const departmentIds = new Set<string>();
  const subDepartmentIds = new Set<string>();
  for (const r of rows) {
    const id = norm(r.unit_id);
    if (!id) continue;
    (r.kind === 'sub' ? subDepartmentIds : departmentIds).add(id);
  }
  return { departmentIds, subDepartmentIds };
}

/**
 * Dựng phạm vi nhìn thấy theo vai trò hiệu lực.
 * @param hasHrRequisitionsView có quyền 'hr-requisitions' → view (bộ phận Tuyển Dụng tiếp nhận).
 */
export async function buildRequisitionScope(
  userId: string,
  role: string,
  companyId: string | null,
  hasHrRequisitionsView: boolean
): Promise<RequisitionScope> {
  const empty = { userIds: new Set<string>(), departmentIds: new Set<string>(), subDepartmentIds: new Set<string>() };

  // super_admin/admin xem toàn bộ phạm vi công ty (scope công ty siết ở tầng gọi).
  // Bộ phận Tuyển Dụng phải thấy yêu cầu của MỌI phòng ban thì mới tiếp nhận được.
  if (role === 'super_admin' || role === 'admin' || hasHrRequisitionsView) {
    return { unrestricted: true, ...empty };
  }

  if (role === 'manager') {
    const [subtree, units] = await Promise.all([
      getOrgSubtreeUserIds(userId, companyId),
      getManagedOrgUnitIds(userId, companyId),
    ]);
    return {
      unrestricted: false,
      userIds: new Set([norm(userId), ...subtree.map(norm)]),
      departmentIds: units.departmentIds,
      subDepartmentIds: units.subDepartmentIds,
    };
  }

  // user thường: chỉ yêu cầu do mình tạo / mình đứng tên.
  return { unrestricted: false, ...empty, userIds: new Set([norm(userId)]) };
}

/** Một yêu cầu có nằm trong phạm vi nhìn thấy không. */
export function isRequisitionVisible(scope: RequisitionScope, item: RequisitionScopeTarget): boolean {
  if (scope.unrestricted) return true;

  const dept = norm(item.department_id);
  const subDept = norm(item.sub_department_id);
  if (dept && scope.departmentIds.has(dept)) return true;
  if (subDept && scope.subDepartmentIds.has(subDept)) return true;

  return (
    scope.userIds.has(norm(item.created_by)) ||
    scope.userIds.has(norm(item.requested_by)) ||
    scope.userIds.has(norm(item.owner_id))
  );
}
