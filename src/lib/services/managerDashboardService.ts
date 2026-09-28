/**
 * Số liệu Dashboard cho role 'manager' — TẤT CẢ scope theo ĐỘI (cấp dưới trực tiếp).
 * Cơ cấu tổ chức mới: cấp dưới trực tiếp đọc từ org_assignments (manager_id, is_active,
 * DISTINCT user_id — người kiêm nhiệm chỉ đếm 1 lần); fallback users.manager_id cho
 * user CHƯA có phân công nào — không đổi hành vi (dual-write đang đồng bộ 2 nguồn).
 * Mọi truy vấn dùng tham số $1 = managerId (an toàn injection).
 */
import { query, queryOne } from '@/lib/db';

export interface ManagerDashboard {
  team: {
    headcount: number;       // quân số cấp dưới đang active
    checkedInToday: number;  // số người đã chấm công hôm nay (app hoặc máy) — dùng tính vắng
    onLeaveToday: number;    // số người nghỉ phép (đã duyệt) hôm nay
    absentToday: number;     // vắng = quân số - đã chấm - nghỉ phép (>=0)
    tasksDueToday: number;   // số task của cấp dưới đến hạn hôm nay (chưa xong)
    ticketsToday: number;    // số ticket của cấp dưới tạo trong hôm nay
  };
  approvals: {
    leave: number;
    overtime: number;
    adjustment: number;
    total: number;
  };
  work: {
    teamTicketsOpen: number;
    teamTasksOpen: number;
  };
}

// Subquery cấp dưới active dùng chung:
// - Nhánh 1: cấp dưới TRỰC TIẾP theo org_assignments (JOIN users lọc status='active').
// - Nhánh 2 (fallback): users.manager_id cho user chưa có phân công active nào.
// UNION tự khử trùng lặp (DISTINCT).
const SUB = `(
  SELECT oa.user_id::text
    FROM org_assignments oa
    JOIN users u ON u.id::text = oa.user_id::text AND u.status = 'active'
   WHERE oa.manager_id::text = $1 AND oa.is_active
  UNION
  SELECT u2.id::text
    FROM users u2
   WHERE u2.manager_id::text = $1 AND u2.status = 'active'
     AND NOT EXISTS (
       SELECT 1 FROM org_assignments oa2
        WHERE oa2.user_id::text = u2.id::text AND oa2.is_active
     )
)`;
const VN_TODAY = `(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`;

async function cnt(sql: string, managerId: string): Promise<number> {
  try {
    const r = await queryOne<{ cnt: string }>(sql, [managerId]);
    return Number(r?.cnt || 0);
  } catch (err) {
    console.error('[managerDashboard] query error:', err);
    return 0;
  }
}

export async function getManagerDashboard(managerId: string): Promise<ManagerDashboard> {
  const [
    headcount, checkedIn, onLeave, tasksDue, ticketsToday,
    leave, overtime, adjustment,
    teamTickets, teamTasks,
  ] = await Promise.all([
    // Quân số = số cấp dưới trực tiếp (org_assignments + fallback users.manager_id)
    cnt(`SELECT COUNT(*) AS cnt FROM ${SUB} sub`, managerId),

    // Đã chấm công hôm nay = app records UNION máy (qua mapping sống), theo giờ VN
    cnt(
      `SELECT COUNT(DISTINCT uid) AS cnt FROM (
         SELECT user_id::text AS uid FROM attendance_records
          WHERE type = 'app' AND user_id::text IN ${SUB}
            AND DATE(recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = ${VN_TODAY}
         UNION
         SELECT m.user_id::text AS uid FROM device_punches dp
           JOIN attendance_machine_mappings m
             ON m.machine_id = dp.machine_id AND m.employee_code = dp.employee_code
            AND dp.punch_time >= m.effective_from
            AND (m.effective_to IS NULL OR dp.punch_time < m.effective_to)
          WHERE m.user_id::text IN ${SUB}
            AND DATE(dp.punch_time AT TIME ZONE 'Asia/Ho_Chi_Minh') = ${VN_TODAY}
       ) x`,
      managerId
    ),

    // Nghỉ phép đã duyệt bao trùm hôm nay
    cnt(
      `SELECT COUNT(DISTINCT user_id::text) AS cnt FROM leave_requests
        WHERE status = 'approved' AND user_id::text IN ${SUB}
          AND ${VN_TODAY} BETWEEN start_date AND end_date`,
      managerId
    ),

    // Task của cấp dưới đến hạn HÔM NAY, chưa hoàn thành
    cnt(
      `SELECT COUNT(*) AS cnt FROM tasks
        WHERE status IN ('todo','in_progress') AND assigned_to::text IN ${SUB}
          AND NULLIF(due_date::text, '') IS NOT NULL
          AND NULLIF(due_date::text, '')::date = ${VN_TODAY}
          AND (archived_at IS NULL OR archived_at > NOW())`,
      managerId
    ),

    // Ticket của cấp dưới TẠO trong hôm nay (giờ VN)
    cnt(
      `SELECT COUNT(*) AS cnt FROM tickets
        WHERE assigned_to::text IN ${SUB}
          AND DATE(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = ${VN_TODAY}`,
      managerId
    ),

    // Chờ duyệt — đơn của cấp dưới
    cnt(`SELECT COUNT(*) AS cnt FROM leave_requests WHERE status = 'pending' AND user_id::text IN ${SUB}`, managerId),
    cnt(`SELECT COUNT(*) AS cnt FROM attendance_overtime WHERE status = 'pending' AND user_id::text IN ${SUB}`, managerId),
    cnt(`SELECT COUNT(*) AS cnt FROM attendance_adjustments WHERE status = 'pending' AND user_id::text IN ${SUB}`, managerId),

    // Việc của nhóm đang mở
    cnt(`SELECT COUNT(*) AS cnt FROM tickets WHERE status IN ('open','in_progress') AND assigned_to::text IN ${SUB}`, managerId),
    cnt(`SELECT COUNT(*) AS cnt FROM tasks WHERE status IN ('todo','in_progress') AND assigned_to::text IN ${SUB} AND (archived_at IS NULL OR archived_at > NOW())`, managerId),
  ]);

  const absent = Math.max(0, headcount - checkedIn - onLeave);

  return {
    team: { headcount, checkedInToday: checkedIn, onLeaveToday: onLeave, absentToday: absent, tasksDueToday: tasksDue, ticketsToday },
    approvals: { leave, overtime, adjustment, total: leave + overtime + adjustment },
    work: { teamTicketsOpen: teamTickets, teamTasksOpen: teamTasks },
  };
}
