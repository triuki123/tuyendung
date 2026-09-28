import { queryOne } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveContext, getCompanyMemberUserIds } from '@/lib/services/userCompanyService';

export interface DashboardOverview {
  assets: { total: number; warnings: number };
  headcount: number;
  ticketsOpen: number;
  tasksOpen: number;
  approvalsPending: number;
  congPending: number;
  roomsPending: number;
  recruitmentPending: number;
}

async function safeCount(label: string, sql: string, params: unknown[] = []): Promise<number> {
  try {
    const r = await queryOne<{ cnt: string }>(sql, params);
    return Number(r?.cnt || 0);
  } catch (err) {
    console.error(`[dashboard/overview] ${label} error:`, err);
    return 0;
  }
}

export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-current-user-id');
  const userRole = request.headers.get('x-current-user-role');
  const activeCompany = request.headers.get('x-current-user-company');

  const effective = userId ? await getEffectiveContext(userId, activeCompany || null) : null;
  const role = effective?.role || userRole || '';
  const isAdmin = role === 'super_admin' || role === 'admin';
  const isManager = role === 'manager';
  const isScopedAdmin = role === 'admin';
  const companyId = isScopedAdmin ? effective?.company_id || '__none__' : undefined;
  const companyUserIds = isScopedAdmin && effective?.company_id
    ? await getCompanyMemberUserIds(effective.company_id)
    : [];

  const companyUsersParam = companyUserIds.length ? companyUserIds : ['__none__'];
  // Lọc phạm vi cho count Duyệt Công (nghỉ phép / tăng ca / bù công):
  //  - manager → đội của mình; admin → thành viên CÔNG TY đang làm việc;
  //  - super_admin → toàn bộ (không lọc). Trước đây admin không lọc → thấy công ty khác.
  // Phase 4 cải tổ cơ cấu: cấp dưới từ org_assignments (kiêm nhiệm), fallback cột cũ.
  const congFilter = isManager
    ? `AND user_id::text IN (
        SELECT oa.user_id::text FROM org_assignments oa WHERE oa.manager_id::text = $1 AND oa.is_active
        UNION
        SELECT u.id::text FROM users u WHERE u.manager_id::text = $1
          AND NOT EXISTS (SELECT 1 FROM org_assignments x WHERE x.user_id = u.id AND x.is_active)
      )`
    : isScopedAdmin
      ? `AND user_id::text = ANY($1::text[])`
      : '';
  const congParams: unknown[] = isManager
    ? (userId ? [userId] : [])
    : isScopedAdmin
      ? [companyUsersParam]
      : [];

  const [
    hardware, software, domains, emails,
    expiringDomains, expiringSoftware,
    headcount,
    ticketsOpen,
    tasksOpen,
    pendingLeave, pendingOvertime, pendingAdj, requisitionsPendingApproval,
    roomsPending,
    recruitmentPending,
  ] = await Promise.all([
    safeCount('hardware', isScopedAdmin ? `SELECT COUNT(*) AS cnt FROM assets WHERE company_id::text = $1` : `SELECT COUNT(*) AS cnt FROM assets`, isScopedAdmin ? [companyId] : []),
    safeCount('software', isScopedAdmin ? `SELECT COUNT(*) AS cnt FROM software WHERE company_id::text = $1` : `SELECT COUNT(*) AS cnt FROM software`, isScopedAdmin ? [companyId] : []),
    safeCount('domains', isScopedAdmin ? `SELECT COUNT(*) AS cnt FROM domains WHERE owner_company_id::text = $1` : `SELECT COUNT(*) AS cnt FROM domains`, isScopedAdmin ? [companyId] : []),
    safeCount('emails', isScopedAdmin ? `SELECT COUNT(*) AS cnt FROM email_accounts WHERE company_id::text = $1` : `SELECT COUNT(*) AS cnt FROM email_accounts`, isScopedAdmin ? [companyId] : []),
    safeCount('expDomains', isScopedAdmin ? `SELECT COUNT(*) AS cnt FROM domains WHERE owner_company_id::text = $1 AND status IN ('expiring','expired')` : `SELECT COUNT(*) AS cnt FROM domains WHERE status IN ('expiring','expired')`, isScopedAdmin ? [companyId] : []),
    safeCount('expSoftware', isScopedAdmin ? `SELECT COUNT(*) AS cnt FROM software WHERE company_id::text = $1 AND status IN ('expiring','expired')` : `SELECT COUNT(*) AS cnt FROM software WHERE status IN ('expiring','expired')`, isScopedAdmin ? [companyId] : []),
    safeCount('headcount', isScopedAdmin ? `SELECT COUNT(*) AS cnt FROM users WHERE status = 'active' AND company_id::text = $1` : `SELECT COUNT(*) AS cnt FROM users WHERE status = 'active'`, isScopedAdmin ? [companyId] : []),
    safeCount('ticketsOpen', isScopedAdmin ? `SELECT COUNT(*) AS cnt FROM tickets WHERE status IN ('open','in_progress') AND (requester_id::text = ANY($1::text[]) OR assigned_to::text = ANY($1::text[]))` : `SELECT COUNT(*) AS cnt FROM tickets WHERE status IN ('open','in_progress')`, isScopedAdmin ? [companyUsersParam] : []),
    safeCount('tasksOpen', isScopedAdmin ? `SELECT COUNT(*) AS cnt FROM tasks WHERE company_id::text = $1 AND status IN ('todo','in_progress') AND (archived_at IS NULL OR archived_at > NOW())` : `SELECT COUNT(*) AS cnt FROM tasks WHERE status IN ('todo','in_progress') AND (archived_at IS NULL OR archived_at > NOW())`, isScopedAdmin ? [companyId] : []),
    (isAdmin || isManager)
      ? safeCount('leave', `SELECT COUNT(*) AS cnt FROM leave_requests WHERE status = 'pending' ${congFilter}`, congParams)
      : Promise.resolve(0),
    (isAdmin || isManager)
      ? safeCount('overtime', `SELECT COUNT(*) AS cnt FROM attendance_overtime WHERE status = 'pending' ${congFilter}`, congParams)
      : Promise.resolve(0),
    (isAdmin || isManager)
      ? safeCount('adj', `SELECT COUNT(*) AS cnt FROM attendance_adjustments WHERE status = 'pending' ${congFilter}`, congParams)
      : Promise.resolve(0),
    isAdmin
      ? safeCount('reqApproval', isScopedAdmin ? `SELECT COUNT(*) AS cnt FROM requisitions WHERE company_id::text = $1 AND status = 'pending_approval' AND deleted_at IS NULL` : `SELECT COUNT(*) AS cnt FROM requisitions WHERE status = 'pending_approval' AND deleted_at IS NULL`, isScopedAdmin ? [companyId] : [])
      : Promise.resolve(0),
    isAdmin
      ? safeCount('roomsPending', isScopedAdmin ? `SELECT COUNT(*) AS cnt FROM room_bookings WHERE status = 'pending' AND requester_id::text = ANY($1::text[])` : `SELECT COUNT(*) AS cnt FROM room_bookings WHERE status = 'pending'`, isScopedAdmin ? [companyUsersParam] : [])
      : Promise.resolve(0),
    (isAdmin || isManager)
      ? safeCount('recruitment', isScopedAdmin ? `SELECT COUNT(*) AS cnt FROM requisitions WHERE company_id::text = $1 AND status = 'pending' AND deleted_at IS NULL` : `SELECT COUNT(*) AS cnt FROM requisitions WHERE status = 'pending' AND deleted_at IS NULL`, isScopedAdmin ? [companyId] : [])
      : Promise.resolve(0),
  ]);

  const overview: DashboardOverview = {
    assets: {
      total: hardware + software + domains + emails,
      warnings: expiringDomains + expiringSoftware,
    },
    headcount,
    ticketsOpen,
    tasksOpen,
    approvalsPending: pendingLeave + pendingOvertime + pendingAdj + requisitionsPendingApproval,
    congPending: pendingLeave + pendingOvertime + pendingAdj,
    roomsPending,
    recruitmentPending,
  };

  return NextResponse.json({ success: true, overview });
}
