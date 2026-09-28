/**
 * overtimeService.ts
 * Quản lý tăng ca (Overtime) của nhân sự.
 *
 * Hai khung giờ:
 *  - Khung Tối (evening): 17:30 – 22:00
 *  - Khung Đêm (night)  : 22:00 – 07:00 ngày hôm sau
 */

import { query, queryOne, execute } from '@/lib/db';
// Re-export utils để API routes không cần import 2 nơi
export { calculateOvertimeBrackets, fmtOTHours, type OvertimeBrackets } from '@/lib/utils/overtimeUtils';

// ─── Types ─────────────────────────────────────────────────────────────────

export type OvertimeStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface AttendanceOvertime {
  id: string;
  user_id: string;
  work_date: string;
  start_time: string;   // HH:MM
  end_time: string;     // HH:MM
  evening_hours: number;
  night_hours: number;
  reason: string | null;
  status: OvertimeStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  user_name?: string | null;
  reviewer_name?: string | null;
}

// ─── DB Operations ──────────────────────────────────────────────────────────

/** Lấy tất cả tăng ca của user trong tháng */
export async function getUserOvertimes(
  userId: string,
  month?: number,
  year?: number,
  startDate?: string,
  endDate?: string,
): Promise<AttendanceOvertime[]> {
  const conds: string[] = ['o.user_id = $1'];
  const params: unknown[] = [userId];
  let i = 2;
  if (month) { conds.push(`EXTRACT(MONTH FROM o.work_date) = $${i++}`); params.push(month); }
  if (year)  { conds.push(`EXTRACT(YEAR  FROM o.work_date) = $${i++}`); params.push(year); }
  if (startDate) { conds.push(`o.work_date >= $${i++}::date`); params.push(startDate); }
  if (endDate)   { conds.push(`o.work_date <= $${i++}::date`); params.push(endDate); }

  return query<AttendanceOvertime>(
    `SELECT o.*,
       u.name AS user_name,
       r.name AS reviewer_name
     FROM attendance_overtime o
     LEFT JOIN users u ON u.id::text = o.user_id
     LEFT JOIN users r ON r.id::text = o.reviewed_by
     WHERE ${conds.join(' AND ')}
     ORDER BY o.work_date DESC`,
    params
  );
}

/** Lấy tăng ca của user cho 1 ngày cụ thể */
export async function getOvertimeByDate(
  userId: string,
  workDate: string
): Promise<AttendanceOvertime | null> {
  return queryOne<AttendanceOvertime>(
    `SELECT o.*,
       u.name AS user_name,
       r.name AS reviewer_name
     FROM attendance_overtime o
     LEFT JOIN users u ON u.id::text = o.user_id
     LEFT JOIN users r ON r.id::text = o.reviewed_by
     WHERE o.user_id = $1 AND o.work_date = $2::date
     LIMIT 1`,
    [userId, workDate]
  );
}

/** Lấy 1 bản ghi tăng ca theo ID */
export async function getOvertimeById(id: string): Promise<AttendanceOvertime | null> {
  return queryOne<AttendanceOvertime>(
    `SELECT o.*,
       u.name AS user_name,
       r.name AS reviewer_name
     FROM attendance_overtime o
     LEFT JOIN users u ON u.id::text = o.user_id
     LEFT JOIN users r ON r.id::text = o.reviewed_by
     WHERE o.id = $1`,
    [id]
  );
}

/** Tạo / cập nhật khai báo tăng ca */
export async function createOrUpdateOvertime(data: {
  user_id: string;
  work_date: string;
  start_time: string;
  end_time: string;
  evening_hours: number;
  night_hours: number;
  reason?: string;
}): Promise<AttendanceOvertime> {
  return queryOne<AttendanceOvertime>(
    `INSERT INTO attendance_overtime
       (user_id, work_date, start_time, end_time, evening_hours, night_hours, reason)
     VALUES ($1, $2::date, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, work_date)
     DO UPDATE SET
       start_time    = EXCLUDED.start_time,
       end_time      = EXCLUDED.end_time,
       evening_hours = EXCLUDED.evening_hours,
       night_hours   = EXCLUDED.night_hours,
       reason        = EXCLUDED.reason,
       status        = 'pending',
       reviewed_by   = NULL,
       reviewed_at   = NULL,
       review_note   = NULL,
       updated_at    = NOW()
     WHERE attendance_overtime.status IN ('rejected', 'cancelled')
     RETURNING *`,
    [
      data.user_id,
      data.work_date,
      data.start_time,
      data.end_time,
      data.evening_hours,
      data.night_hours,
      data.reason ?? null,
    ]
  ) as Promise<AttendanceOvertime>;
}

/** Duyệt / từ chối tăng ca */
export async function reviewOvertime(
  id: string,
  reviewerId: string,
  action: 'approved' | 'rejected',
  reviewNote?: string
): Promise<AttendanceOvertime | null> {
  return queryOne<AttendanceOvertime>(
    `UPDATE attendance_overtime
     SET status      = $2,
         reviewed_by = $3,
         reviewed_at = NOW(),
         review_note = $4,
         updated_at  = NOW()
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [id, action, reviewerId, reviewNote ?? null]
  );
}

/** Nhân viên hủy khai báo của mình */
export async function cancelOvertime(id: string, userId: string): Promise<boolean> {
  const n = await execute(
    `UPDATE attendance_overtime
     SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
    [id, userId]
  );
  return n > 0;
}

/** Quản lý/Admin hủy tăng ca đã duyệt. */
export async function revokeOvertime(id: string, cancelledBy: string): Promise<boolean> {
  const n = await execute(
    `UPDATE attendance_overtime SET status='cancelled', reviewed_by=$2, updated_at=NOW()
     WHERE id=$1 AND status='approved'`,
    [id, cancelledBy]
  );
  return n > 0;
}

/** Lấy tăng ca của nhân viên trực thuộc (cho Quản Lý Trực Tiếp) */
export async function getTeamOvertimes(
  managerId: string,
  filters?: { status?: OvertimeStatus; month?: number; year?: number; startDate?: string; endDate?: string; companyId?: string | null }
): Promise<AttendanceOvertime[]> {
  // Đa Công Ty: cấp dưới (đệ quy) trong công ty đang làm việc
  // ∪ nhân sự được ỦY QUYỀN duyệt cho người này (vượt cây sơ đồ).
  const { getOrgSubtreeUserIds } = await import('@/lib/services/attendanceService');
  const { getDelegatedTargetIds } = await import('@/lib/services/leaveDelegationService');
  const [subtree, delegated] = await Promise.all([
    getOrgSubtreeUserIds(managerId, filters?.companyId ?? null),
    getDelegatedTargetIds(managerId),
  ]);
  const scopeIds = [...new Set([...subtree, ...delegated])];
  if (scopeIds.length === 0) return [];

  const conds: string[] = ['o.user_id::text = ANY($1::text[])'];
  const params: unknown[] = [scopeIds];
  let i = 2;

  if (filters?.status) { conds.push(`o.status = $${i++}`); params.push(filters.status); }
  if (filters?.month)  { conds.push(`EXTRACT(MONTH FROM o.work_date) = $${i++}`); params.push(filters.month); }
  if (filters?.year)   { conds.push(`EXTRACT(YEAR  FROM o.work_date) = $${i++}`); params.push(filters.year); }
  if (filters?.startDate) { conds.push(`o.work_date >= $${i++}::date`); params.push(filters.startDate); }
  if (filters?.endDate)   { conds.push(`o.work_date <= $${i++}::date`); params.push(filters.endDate); }

  return query<AttendanceOvertime>(
    `SELECT o.*,
       u.name AS user_name,
       dpt.name AS dept_name, cmp.name AS company_name,
       r.name AS reviewer_name
     FROM attendance_overtime o
     JOIN users u ON u.id::text = o.user_id
     LEFT JOIN departments dpt ON dpt.id::text = u.department_id::text
     LEFT JOIN companies cmp ON cmp.id::text = COALESCE(u.company_id::text, dpt.company_id::text)
     LEFT JOIN users r ON r.id::text = o.reviewed_by
     WHERE ${conds.join(' AND ')}
     ORDER BY
       CASE o.status WHEN 'pending' THEN 0 ELSE 1 END,
       o.work_date DESC`,
    params
  );
}

/** Lấy tất cả tăng ca (admin xem toàn bộ; Đa Công Ty: lọc theo companyId). */
export async function getAllOvertimes(filters?: {
  status?: OvertimeStatus;
  month?: number;
  year?: number;
  startDate?: string;
  endDate?: string;
  companyId?: string | null;
}): Promise<AttendanceOvertime[]> {
  const conds: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (filters?.companyId) {
    const { getCompanyMemberUserIds } = await import('@/lib/services/userCompanyService');
    const memberIds = await getCompanyMemberUserIds(filters.companyId);
    if (memberIds.length === 0) return [];
    conds.push(`o.user_id::text = ANY($${i++}::text[])`);
    params.push(memberIds);
  }
  if (filters?.status) { conds.push(`o.status = $${i++}`); params.push(filters.status); }
  if (filters?.month)  { conds.push(`EXTRACT(MONTH FROM o.work_date) = $${i++}`); params.push(filters.month); }
  if (filters?.year)   { conds.push(`EXTRACT(YEAR  FROM o.work_date) = $${i++}`); params.push(filters.year); }
  if (filters?.startDate) { conds.push(`o.work_date >= $${i++}::date`); params.push(filters.startDate); }
  if (filters?.endDate)   { conds.push(`o.work_date <= $${i++}::date`); params.push(filters.endDate); }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  return query<AttendanceOvertime>(
    `SELECT o.*,
       u.name AS user_name,
       dpt.name AS dept_name, cmp.name AS company_name,
       r.name AS reviewer_name
     FROM attendance_overtime o
     LEFT JOIN users u ON u.id::text = o.user_id
     LEFT JOIN departments dpt ON dpt.id::text = u.department_id::text
     LEFT JOIN companies cmp ON cmp.id::text = COALESCE(u.company_id::text, dpt.company_id::text)
     LEFT JOIN users r ON r.id::text = o.reviewed_by
     ${where}
     ORDER BY
       CASE o.status WHEN 'pending' THEN 0 ELSE 1 END,
       o.work_date DESC`,
    params
  );
}
