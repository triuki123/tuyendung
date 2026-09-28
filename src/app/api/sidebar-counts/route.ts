import { queryOne } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getContractVisibility } from '@/lib/services/contractPermissionService';
import { getCompanyMemberUserIds, getEffectiveContext } from '@/lib/services/userCompanyService';

export interface SidebarCounts {
  duyetYeuCau: number;            // leave + overtime + adjustment pending
  tickets: number;                 // open/in_progress tickets
  tasks: number;                   // tasks assigned to me, not done
  roomBookings: number;            // pending bookings (admin)
  onboarding: number;              // pending onboarding submissions (admin/hr)
  offboarding: number;             // pending offboarding processes (admin/hr)
  requisitionsPendingApproval: number; // requisitions chờ duyệt (admin)
  hrPending: number;               // tổng badge Nguồn Nhân Lực = onboarding + offboarding + requisitionsPendingApproval
  users: number;                   // pending user approvals (super_admin)
  recruitment: number;             // requisitions status=pending (admin/manager)
  myContracts: number;             // contracts pending_signing for me
  hrDocReplace: number;            // badge Quản Lý Hồ Sơ: đổi hồ sơ pending + hợp đồng nháp + đánh giá đang chờ (admin)
  notifications: number;           // thông báo chưa đọc (tất cả user) → badge Trung Tâm Thông Báo
}

/** Chạy query COUNT, trả về số nguyên, không throw — lỗi in ra console và trả 0. */
async function safeCount(label: string, sql: string, params: unknown[] = []): Promise<number> {
  try {
    const r = await queryOne<{ cnt: string }>(sql, params);
    return Number(r?.cnt || 0);
  } catch (err) {
    console.error(`[sidebar-counts] ${label} error:`, err);
    return 0;
  }
}

export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-current-user-id');
  const activeCompany = request.headers.get('x-current-user-company');

  if (!userId) return NextResponse.json({ counts: {} });

  const effective = await getEffectiveContext(userId, activeCompany || null);
  const userRole = effective?.role || request.headers.get('x-current-user-role') || '';
  const isAdmin = userRole === 'super_admin' || userRole === 'admin';
  const isManager = userRole === 'manager';
  const isSuperAdmin = userRole === 'super_admin';
  const isScopedAdmin = userRole === 'admin';
  const companyUserIds = isScopedAdmin && effective?.company_id
    ? await getCompanyMemberUserIds(effective.company_id)
    : [];
  const companyUsersParam = companyUserIds.length ? companyUserIds : ['__none__'];
  // Phase 4 cải tổ cơ cấu: cấp dưới trực tiếp từ org_assignments (hợp nhất kiêm nhiệm),
  // fallback users.manager_id cho user chưa có phân công.
  const managerFilter = `AND user_id::text IN (
    SELECT oa.user_id::text FROM org_assignments oa WHERE oa.manager_id::text = $1 AND oa.is_active
    UNION
    SELECT u.id::text FROM users u WHERE u.manager_id::text = $1
      AND NOT EXISTS (SELECT 1 FROM org_assignments x WHERE x.user_id = u.id AND x.is_active)
  )`;
  // Lọc phạm vi Duyệt Công (nghỉ phép/tăng ca/bù công): manager→đội, admin→công ty
  // đang làm việc, super_admin→toàn bộ. Trước đây admin không lọc → thấy công ty khác.
  const congFilter = isManager
    ? managerFilter
    : isScopedAdmin
      ? `AND user_id::text = ANY($1::text[])`
      : '';
  const congParams: unknown[] = isManager
    ? [userId]
    : isScopedAdmin
      ? [companyUsersParam]
      : [];

  const [
    pendingLeave,
    pendingOvertime,
    pendingAdj,
    pendingExpenses,
    tickets,
    tasks,
    roomBookings,
    onboarding,
    offboarding,
    requisitionsPendingApproval,
    pendingUsers,
    recruitment,
    myContracts,
    hrDocReplace,
    unreadNotifications,
  ] = await Promise.all([
    // Duyệt Yêu Cầu — chỉ admin/manager
    (isAdmin || isManager)
      ? safeCount(
          'leave',
          `SELECT COUNT(*) AS cnt FROM leave_requests WHERE status = 'pending' ${congFilter}`,
          congParams
        )
      : Promise.resolve(0),
    (isAdmin || isManager)
      ? safeCount(
          'overtime',
          `SELECT COUNT(*) AS cnt FROM attendance_overtime WHERE status = 'pending' ${congFilter}`,
          congParams
        )
      : Promise.resolve(0),
    (isAdmin || isManager)
      ? safeCount(
          'adj',
          `SELECT COUNT(*) AS cnt FROM attendance_adjustments WHERE status = 'pending' ${congFilter}`,
          congParams
        )
      : Promise.resolve(0),

    // Duyệt Chi Phí — đích danh người đến lượt duyệt (mọi user, không giới hạn role)
    (async () => {
      const { countPendingApprovals } = await import('@/lib/services/expenseService');
      return countPendingApprovals(userId).catch((err) => {
        console.error('[sidebar-counts] pendingExpenses error:', err);
        return 0;
      });
    })(),

    // Tickets — tất cả user
    safeCount(
      'tickets',
      isAdmin
        ? isScopedAdmin
          ? `SELECT COUNT(*) AS cnt FROM tickets WHERE status IN ('open','in_progress') AND (created_by::text = ANY($1::text[]) OR assigned_to::text = ANY($1::text[]))`
          : `SELECT COUNT(*) AS cnt FROM tickets WHERE status IN ('open','in_progress')`
        : `SELECT COUNT(*) AS cnt FROM tickets WHERE status IN ('open','in_progress') AND (created_by::text = $1 OR assigned_to::text = $1)`,
      isAdmin ? (isScopedAdmin ? [companyUsersParam] : []) : [userId]
    ),

    // Tasks — tất cả user, tasks assigned to me
    safeCount(
      'tasks',
      `SELECT COUNT(*) AS cnt FROM tasks WHERE assigned_to::text = $1 AND status IN ('todo','in_progress') AND (archived_at IS NULL OR archived_at > NOW())`,
      [userId]
    ),

    // Room Bookings — admin only
    isAdmin
      ? safeCount(
          'roomBookings',
          isScopedAdmin
            ? `SELECT COUNT(*) AS cnt FROM room_bookings WHERE status = 'pending' AND requested_by::text = ANY($1::text[])`
            : `SELECT COUNT(*) AS cnt FROM room_bookings WHERE status = 'pending'`,
          isScopedAdmin ? [companyUsersParam] : []
        )
      : Promise.resolve(0),

    // Onboarding — admin only. CHỈ đếm submission của biểu mẫu onboarding,
    // loại biểu mẫu thường (form_type='general') vốn cũng lưu chung bảng này.
    isAdmin
      ? safeCount('onboarding', `${isScopedAdmin
          ? `SELECT COUNT(*) AS cnt FROM onboarding_submissions
           WHERE company_id::text = $1
             AND status IN ('submitted','sent_to_admin')
             AND (form_id IS NULL OR form_id IN (SELECT id FROM form_templates WHERE form_type = 'onboarding'))`
          : `SELECT COUNT(*) AS cnt FROM onboarding_submissions
           WHERE status IN ('submitted','sent_to_admin')
             AND (form_id IS NULL OR form_id IN (SELECT id FROM form_templates WHERE form_type = 'onboarding'))`}`,
          isScopedAdmin ? [effective?.company_id || '__none__'] : [])
      : Promise.resolve(0),

    // Offboarding — admin only (process đang chờ xử lý)
    isAdmin
      ? safeCount(
          'offboarding',
          isScopedAdmin
            ? `SELECT COUNT(*) AS cnt FROM offboarding_processes WHERE status IN ('pending','in_progress') AND company_id::text = $1`
            : `SELECT COUNT(*) AS cnt FROM offboarding_processes WHERE status IN ('pending','in_progress')`,
          isScopedAdmin ? [effective?.company_id || '__none__'] : []
        )
      : Promise.resolve(0),

    // Yêu Cầu Tuyển Dụng chờ phê duyệt — admin only
    isAdmin
      ? safeCount(
          'requisitionsPendingApproval',
          isScopedAdmin
            ? `SELECT COUNT(*) AS cnt FROM requisitions WHERE company_id::text = $1 AND status = 'pending_approval' AND deleted_at IS NULL`
            : `SELECT COUNT(*) AS cnt FROM requisitions WHERE status = 'pending_approval' AND deleted_at IS NULL`,
          isScopedAdmin ? [effective?.company_id || '__none__'] : []
        )
      : Promise.resolve(0),

    // Users pending — super_admin only
    isSuperAdmin
      ? safeCount('users', `SELECT COUNT(*) AS cnt FROM users WHERE status = 'pending'`)
      : Promise.resolve(0),

    // Yêu Cầu Tuyển Dụng — requisitions chờ mở (admin/manager)
    (isAdmin || isManager)
      ? safeCount(
          'recruitment',
          isScopedAdmin
            ? `SELECT COUNT(*) AS cnt FROM requisitions WHERE company_id::text = $1 AND status = 'pending' AND deleted_at IS NULL`
            : `SELECT COUNT(*) AS cnt FROM requisitions WHERE status = 'pending' AND deleted_at IS NULL`,
          isScopedAdmin ? [effective?.company_id || '__none__'] : []
        )
      : Promise.resolve(0),

    // Hợp đồng & Hồ sơ — hợp đồng cần ký (tất cả user)
    safeCount(
      'myContracts',
      `SELECT COUNT(*) AS cnt FROM contracts WHERE employee_id = $1 AND status = 'pending_signing'`,
      [userId]
    ),

    // Quản Lý Hồ Sơ — yêu cầu đổi hồ sơ pending + hợp đồng nháp + đánh giá đang chờ (admin)
    isAdmin
      ? (async () => {
          const visibility = await getContractVisibility(userId!);
          const ids = visibility.all ? null : (visibility.allowedEmployeeIds ?? []);
          if (ids !== null && ids.length === 0) return 0;
          const empParam = ids ? [ids] : [];
          const empFilter = ids ? 'AND LOWER(employee_id) = ANY($1)' : '';
          const [docReplace, draftContracts, pendingEvaluations] = await Promise.all([
            safeCount('hrDocReplace',
              `SELECT COUNT(*) AS cnt
               FROM hr_document_replace_requests r
               JOIN hr_documents d ON d.id = r.original_doc_id
               WHERE r.status = 'pending'
               ${ids ? 'AND LOWER(d.employee_id) = ANY($1)' : ''}`,
              empParam),
            safeCount('draftContracts',
              `SELECT COUNT(*) AS cnt FROM contracts WHERE status = 'draft' ${empFilter}`,
              empParam),
            safeCount('pendingEvaluations',
              `SELECT COUNT(*) AS cnt FROM evaluations WHERE status NOT IN ('passed', 'failed') ${empFilter}`,
              empParam),
          ]);
          return docReplace + draftContracts + pendingEvaluations;
        })()
      : Promise.resolve(0),

    // Thông báo chưa đọc — tất cả user (badge Trung Tâm Thông Báo)
    safeCount(
      'notifications',
      `SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = $1 AND read = false`,
      [userId]
    ),
  ]);

  const counts: SidebarCounts = {
    duyetYeuCau: pendingLeave + pendingOvertime + pendingAdj + pendingExpenses,
    tickets,
    tasks,
    roomBookings,
    onboarding,
    offboarding,
    requisitionsPendingApproval,
    hrPending: onboarding + offboarding + requisitionsPendingApproval,
    users: pendingUsers,
    recruitment,
    myContracts,
    hrDocReplace,
    notifications: unreadNotifications,
  };

  return NextResponse.json({ counts });
}
