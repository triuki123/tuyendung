/**
 * Ủy quyền DUYỆT CÔNG vượt cây sơ đồ — áp cho CẢ 3 luồng: nghỉ phép, bù công (lẻ + lô),
 * tăng ca. Một lần gán "A duyệt cho B" là A duyệt được mọi loại đơn công của B.
 *
 * Mặc định người duyệt là quản lý trực tiếp theo cây (org_assignments.manager_id).
 * Bảng leave_approver_delegations cho phép GIAO thêm quyền duyệt của một số nhân sự
 * cho một người khác — kể cả người đó không nằm trên nhánh cây phía trên.
 * (Tên bảng giữ tiền tố leave_ vì lịch sử — mig 293 ra đời cho nghỉ phép trước.)
 *
 * Nguyên tắc: BỔ SUNG, không thay thế. Quản lý theo cây vẫn duyệt & nhận thông báo;
 * người được ủy quyền duyệt THÊM. Xem [[leave-module-overview]].
 */
import { query, queryOne, execute } from '@/lib/db';
import { randomUUID } from 'crypto';

export interface LeaveDelegation {
  id: string;
  approver_user_id: string;
  approver_name: string | null;
  approver_email: string | null;
  target_user_id: string;
  target_name: string | null;
  target_email: string | null;
  target_company_name: string | null;
  company_id: string | null;
  note: string | null;
  created_at: string;
}

/**
 * Danh sách ủy quyền (cho UI Admin). Lọc theo công ty đang chọn: chỉ các dòng mà NGƯỜI
 * ĐƯỢC DUYỆT CHO (target) thuộc công ty đó, hoặc dòng company_id khớp. Admin super → tất cả.
 */
export async function listDelegations(companyId?: string | null): Promise<LeaveDelegation[]> {
  const scoped = !!companyId;
  return query<LeaveDelegation>(
    `SELECT d.id,
            d.approver_user_id::text AS approver_user_id,
            au.name  AS approver_name,
            au.email AS approver_email,
            d.target_user_id::text AS target_user_id,
            tu.name  AS target_name,
            tu.email AS target_email,
            tc.name  AS target_company_name,
            d.company_id::text AS company_id,
            d.note,
            d.created_at
       FROM leave_approver_delegations d
       LEFT JOIN users au ON au.id = d.approver_user_id
       LEFT JOIN users tu ON tu.id = d.target_user_id
       LEFT JOIN companies tc ON tc.id::text = tu.company_id::text
      WHERE d.is_active
        ${scoped ? `AND (d.company_id::text = $1 OR tu.company_id::text = $1)` : ''}
      ORDER BY au.name, tu.name`,
    scoped ? [companyId] : []
  );
}

/** Tạo (hoặc kích hoạt lại) một ủy quyền. Idempotent theo cặp (approver, target). */
export async function createDelegation(input: {
  approverUserId: string;
  targetUserId: string;
  companyId?: string | null;
  note?: string | null;
  createdBy?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  if (input.approverUserId === input.targetUserId) {
    return { ok: false, error: 'Không thể tự ủy quyền duyệt phép cho chính mình' };
  }
  // Đã có dòng active cho cặp này → coi như thành công (idempotent), chỉ cập nhật note/công ty.
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM leave_approver_delegations
      WHERE approver_user_id = $1 AND target_user_id = $2 AND is_active`,
    [input.approverUserId, input.targetUserId]
  );
  if (existing) {
    await execute(
      `UPDATE leave_approver_delegations
          SET note = $2, company_id = $3, updated_at = now()
        WHERE id = $1`,
      [existing.id, input.note ?? null, input.companyId ?? null]
    );
    return { ok: true };
  }
  await execute(
    `INSERT INTO leave_approver_delegations
       (id, approver_user_id, target_user_id, company_id, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [randomUUID(), input.approverUserId, input.targetUserId, input.companyId ?? null,
     input.note ?? null, input.createdBy ?? null]
  );
  return { ok: true };
}

/** Gỡ ủy quyền (xóa hẳn — bảng nhỏ, không cần soft-delete). */
export async function deleteDelegation(id: string): Promise<void> {
  await execute(`DELETE FROM leave_approver_delegations WHERE id = $1`, [id]);
}

/**
 * ID những người ĐƯỢC ỦY QUYỀN duyệt phép cho `targetUserId`.
 * Dùng khi user nộp đơn: gửi thông báo cho các approver này, và cho phép họ duyệt.
 */
export async function getDelegateApproverIds(targetUserId: string): Promise<string[]> {
  const rows = await query<{ approver_user_id: string }>(
    `SELECT approver_user_id::text AS approver_user_id
       FROM leave_approver_delegations
      WHERE target_user_id::text = $1 AND is_active`,
    [targetUserId.toLowerCase()]
  );
  return rows.map((r) => r.approver_user_id);
}

/**
 * ID những người mà `approverUserId` được ủy quyền duyệt phép cho (target).
 * Dùng cho thẻ "Cần Tôi Xử Lý" — hiện thêm đơn của các target này.
 */
export async function getDelegatedTargetIds(approverUserId: string): Promise<string[]> {
  const rows = await query<{ target_user_id: string }>(
    `SELECT target_user_id::text AS target_user_id
       FROM leave_approver_delegations
      WHERE approver_user_id::text = $1 AND is_active`,
    [approverUserId.toLowerCase()]
  );
  return rows.map((r) => r.target_user_id);
}

/** `approverUserId` có được ủy quyền duyệt cho `targetUserId` không? */
export async function canDelegateApprove(
  approverUserId: string,
  targetUserId: string
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM leave_approver_delegations
      WHERE approver_user_id::text = $1 AND target_user_id::text = $2 AND is_active
      LIMIT 1`,
    [approverUserId.toLowerCase(), targetUserId.toLowerCase()]
  );
  return !!row;
}

/**
 * CHỐT DUYỆT dùng chung cho mọi đơn công (nghỉ phép / bù công / tăng ca):
 * `reviewerId` được duyệt đơn của `employeeUserId` khi là một trong:
 *  1. Quản lý trực tiếp — users.manager_id (dữ liệu cũ), HOẶC
 *  2. Quản lý theo PHÂN CÔNG CHÍNH org_assignments tại công ty của nhân viên
 *     (cũng là người nhận thông báo — tránh cảnh "được báo nhưng không duyệt được"), HOẶC
 *  3. Người được ỦY QUYỀN duyệt cho nhân viên (vượt cây sơ đồ).
 * KHÔNG bao gồm admin — người gọi tự cộng điều kiện admin theo ngữ cảnh của route.
 */
export async function canActAsApproverFor(
  reviewerId: string,
  employeeUserId: string
): Promise<boolean> {
  const employee = await queryOne<{ manager_id: string | null; company_id: string | null }>(
    `SELECT manager_id, company_id::text AS company_id FROM users WHERE id::text = $1`,
    [employeeUserId]
  );
  if (employee?.manager_id && employee.manager_id === reviewerId) return true;

  if (employee?.company_id) {
    const { getPrimaryAssignment } = await import('@/lib/services/orgStructureService');
    const assignment = await getPrimaryAssignment(employeeUserId, employee.company_id);
    if (assignment?.manager_id && assignment.manager_id === reviewerId) return true;
  }

  return canDelegateApprove(reviewerId, employeeUserId);
}

/**
 * Danh sách NGƯỜI NHẬN THÔNG BÁO khi `employeeUserId` nộp một đơn công:
 * quản lý trực tiếp (users.manager_id, ưu tiên manager phân công chính) ∪ người được
 * ủy quyền. Loại trùng và loại chính người nộp (dữ liệu cũ có thể để manager = chính mình).
 */
export async function getApprovalRecipients(employeeUserId: string): Promise<string[]> {
  const employee = await queryOne<{ manager_id: string | null; company_id: string | null }>(
    `SELECT manager_id, company_id::text AS company_id FROM users WHERE id::text = $1`,
    [employeeUserId]
  );

  let managerId = employee?.manager_id ?? null;
  if (employee?.company_id) {
    const { getPrimaryAssignment } = await import('@/lib/services/orgStructureService');
    const assignment = await getPrimaryAssignment(employeeUserId, employee.company_id);
    if (assignment?.manager_id) managerId = assignment.manager_id;
  }

  const delegateIds = await getDelegateApproverIds(employeeUserId);
  const self = employeeUserId.toLowerCase();
  return [...new Set([managerId, ...delegateIds].filter((x): x is string => !!x))]
    .filter((id) => id.toLowerCase() !== self);
}
