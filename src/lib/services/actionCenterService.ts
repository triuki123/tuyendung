/**
 * Action Center — "Cần Xử Lý": inbox hợp nhất XUYÊN CÔNG TY + XUYÊN MODULE, HAI LĂNG KÍNH.
 *
 * - "Cần Tôi Xử Lý" (mine): việc ĐÍCH DANH định tuyến/giao cho tôi (approver được routing,
 *   assignee, người được hỏi). Chống nhũng nhiễu — không phụ thuộc role rộng.
 * - "Đội Ngũ Của Tôi" (team): việc trong PHẠM VI tôi quản/có quyền (cấp dưới, toàn công ty,
 *   toàn hệ thống tùy role). Đây là chỗ cho "capability view".
 *
 * ⚠️ CHỐNG-NHẦM-CÔNG-TY: mỗi item mang company_id/company_name theo bản ghi. Hành động duyệt
 * gọi đúng endpoint của từng bản ghi (record-driven), server tự kiểm quyền lại theo công ty.
 *
 * Thêm nguồn mới = viết 1 provider (listMine/listTeam) trả ActionItem chuẩn — KHÔNG phình file này.
 */
import { query } from '@/lib/db';
import { formatMoney } from '@/lib/format';
import { listExpenses } from './expenseService';
import { getTeamLeaves, getAllLeaves, getDirectReportLeaves } from './leaveRequestService';
import { getUserMemberships } from './userCompanyService';

export type ActionType = 'expense' | 'leave' | 'task' | 'ticket' | 'candidate';
/** Loại hành động (cho nhãn nút): duyệt/làm/phản hồi/đánh giá/ký/cho ý kiến. */
export type ActionKind = 'approve' | 'do' | 'reply' | 'review' | 'sign' | 'input';

export interface ActionItem {
  type: ActionType;
  id: string;
  company_id: string | null;
  company_name: string | null;
  title: string;
  subtitle: string;
  amountFmt: string | null;
  requesterName: string | null;
  /** ISO — dùng tính "chờ bao lâu" + sắp xếp việc cũ nhất lên đầu. */
  waitingSince: string;
  /** Mở chi tiết (record-driven). */
  detailUrl: string;
  actionKind: ActionKind;
}

export interface ActionBucket {
  items: ActionItem[];
  byCompany: { company_id: string | null; company_name: string | null; count: number }[];
  byType: Record<string, number>;
  total: number;
}

// ── Mappers (dùng chung cho cả mine & team) ─────────────────────────────
function mapExpense(e: any): ActionItem {
  return {
    type: 'expense',
    id: e.id,
    company_id: e.company_id,
    company_name: e.company_name ?? null,
    title: `${e.code ? e.code + ' · ' : ''}${e.title}`,
    subtitle: e.category_name || 'Chưa phân loại',
    amountFmt: formatMoney(Number(e.amount), e.currency),
    requesterName: e.requester_name ?? null,
    waitingSince: e.created_at,
    detailUrl: `/chi-phi?open=${e.id}`,
    actionKind: 'approve',
  };
}

function mapLeave(l: any, companyId: string | null, companyName: string | null): ActionItem {
  const range = l.start_date === l.end_date ? l.start_date : `${l.start_date} → ${l.end_date}`;
  return {
    type: 'leave',
    id: l.id,
    company_id: companyId ?? l.company_id ?? null,
    company_name: companyName ?? l.company_name ?? null,
    title: `${l.type_name || 'Nghỉ phép'} · ${l.total_days} ngày`,
    subtitle: `${range}${l.reason ? ' · ' + l.reason : ''}`,
    amountFmt: null,
    requesterName: l.user_name ?? null,
    waitingSince: l.created_at,
    detailUrl: `/tra-cuu/du-lieu-cong/nghi-phep?open=${l.id}`,
    actionKind: 'approve',
  };
}

// ── MINE: đích danh chờ tôi ──────────────────────────────────────────────
/** Chi phí đang ĐẾN LƯỢT tôi duyệt (đích danh, xuyên công ty sẵn). */
async function mineExpenses(userId: string): Promise<ActionItem[]> {
  const rows = await listExpenses({ pendingApproverId: userId });
  return rows.map(mapExpense);
}

/** Nghỉ phép của CẤP DƯỚI TRỰC TIẾP của tôi — đích danh tôi là quản lý phải duyệt. */
async function mineLeaves(userId: string): Promise<ActionItem[]> {
  const rows = await getDirectReportLeaves(userId, { status: 'pending' });
  return rows.map((l) => mapLeave(l, l.company_id ?? null, l.company_name ?? null));
}

/** Task đang được giao cho tôi (chính hoặc phụ) mà chưa hoàn thành. */
async function mineTasks(userId: string): Promise<ActionItem[]> {
  const rows = await query<any>(
    `SELECT DISTINCT t.id, t.title, t.status, t.due_date, t.priority,
            t.company_id::text AS company_id, co.name AS company_name, t.created_at
       FROM tasks t
       LEFT JOIN task_assignees ta ON ta.task_id = t.id AND ta.user_id = $1
       LEFT JOIN companies co ON co.id = t.company_id
      WHERE (t.assigned_to = $1 OR ta.user_id = $1)
        AND t.status NOT IN ('done', 'cancelled')
        AND t.archived_at IS NULL
      ORDER BY t.created_at DESC
      LIMIT 200`,
    [userId]
  );
  return rows.map((t) => ({
    type: 'task' as const,
    id: t.id,
    company_id: t.company_id ?? null,
    company_name: t.company_name ?? null,
    title: t.title,
    subtitle: t.due_date ? `Hạn ${String(t.due_date).slice(0, 10)}` : (t.priority ? `Ưu tiên ${t.priority}` : 'Chưa hoàn thành'),
    amountFmt: null,
    requesterName: null,
    waitingSince: t.created_at,
    detailUrl: `/tasks?openTask=${t.id}`,
    actionKind: 'do' as const,
  }));
}

/** Ticket đang gán cho tôi mà chưa đóng — chờ tôi xử lý/phản hồi. */
async function mineTickets(userId: string): Promise<ActionItem[]> {
  const rows = await query<any>(
    `SELECT t.id, t.code, t.title, t.status, t.priority, t.created_at, t.updated_at,
            NULLIF(u.company_id::text, '') AS company_id, co.name AS company_name
       FROM tickets t
       LEFT JOIN users u ON u.id::text = COALESCE(t.requester_id, t.created_by)
       LEFT JOIN companies co ON co.id::text = u.company_id::text
      WHERE t.assigned_to = $1
        AND t.status NOT IN ('resolved', 'completed', 'closed', 'rejected')
        AND t.archived_at IS NULL
      ORDER BY t.updated_at DESC
      LIMIT 200`,
    [userId]
  );
  return rows.map((t) => ({
    type: 'ticket' as const,
    id: t.id,
    company_id: t.company_id ?? null,
    company_name: t.company_name ?? null,
    title: t.code ? `${t.code} · ${t.title}` : t.title,
    subtitle: `Trạng thái: ${t.status}`,
    amountFmt: null,
    requesterName: null,
    waitingSince: t.updated_at || t.created_at,
    detailUrl: `/tickets/user?ticketId=${t.id}`,
    actionKind: 'reply' as const,
  }));
}

/** Ứng viên có lịch phỏng vấn gán tôi mà tôi CHƯA nộp scorecard vòng đó — chờ tôi đánh giá. */
async function mineCandidates(userId: string): Promise<ActionItem[]> {
  const rows = await query<any>(
    `SELECT s.id, s.cv_id, s.round_label, s.scheduled_at, s.created_at,
            cv.candidate_name, r.title AS req_title,
            r.company_id::text AS company_id, co.name AS company_name
       FROM hr_interview_schedules s
       JOIN hr_cv_pool cv ON cv.id = s.cv_id
       LEFT JOIN requisitions r ON r.id = s.requisition_id
       LEFT JOIN companies co ON co.id::text = r.company_id
      WHERE $1 = ANY(s.interviewer_ids)
        AND s.status <> 'cancelled'
        AND NOT EXISTS (
          SELECT 1 FROM hr_interview_scorecards sc
           WHERE sc.application_id = s.application_id
             AND sc.interviewer_id = $1
             AND sc.round_label = s.round_label
        )
      ORDER BY s.scheduled_at DESC
      LIMIT 100`,
    [userId]
  );
  return rows.map((c) => ({
    type: 'candidate' as const,
    id: c.id,
    company_id: c.company_id ?? null,
    company_name: c.company_name ?? null,
    title: c.candidate_name,
    subtitle: `${c.req_title ? c.req_title + ' · ' : ''}${c.round_label} — chờ bạn đánh giá`,
    amountFmt: null,
    requesterName: null,
    waitingSince: c.scheduled_at || c.created_at,
    detailUrl: `/nguon-nhan-luc/kho-ung-vien?openCandidate=${c.cv_id}`,
    actionKind: 'review' as const,
  }));
}

// ── TEAM: phạm vi tôi quản/có quyền ──────────────────────────────────────
/** Chi phí pending trong phạm vi tôi có quyền (super_admin: toàn hệ thống; admin: theo công ty; manager: cây dưới). */
async function teamExpenses(userId: string, globalRole: string): Promise<ActionItem[]> {
  const seen = new Set<string>();
  const out: ActionItem[] = [];
  const add = (rows: any[]) => { for (const e of rows) if (!seen.has(e.id)) { seen.add(e.id); out.push(mapExpense(e)); } };

  if (globalRole === 'super_admin') {
    add(await listExpenses({ status: 'pending_approval' }));
    return out;
  }
  const memberships = await getUserMemberships(userId);
  let hasManager = false;
  for (const m of memberships) {
    if (m.role === 'admin' || m.role === 'super_admin') {
      add(await listExpenses({ status: 'pending_approval', companyId: m.company_id }));
    } else if (m.role === 'manager') {
      hasManager = true;
    }
  }
  if (hasManager) add(await listExpenses({ status: 'pending_approval', teamOfUserId: userId }));
  return out;
}

/**
 * Nghỉ phép trong phạm vi tôi quản: Quản lý → cây dưới; Admin → toàn công ty; Super Admin → toàn hệ thống.
 * company_id/name gán theo CÔNG TY tôi đang có quyền duyệt (record-driven, chống nhầm).
 */
async function teamLeaves(userId: string, globalRole: string): Promise<ActionItem[]> {
  const items = new Map<string, ActionItem>(); // dedupe theo leave id

  const push = (rows: Awaited<ReturnType<typeof getTeamLeaves>>, companyId: string | null, companyName: string | null) => {
    for (const l of rows) {
      if (l.status !== 'pending' || items.has(l.id)) continue;
      items.set(l.id, mapLeave(l, companyId, companyName));
    }
  };

  if (globalRole === 'super_admin') {
    const companies = await query<{ id: string; name: string }>(
      `SELECT id::text AS id, name FROM companies WHERE is_active IS NOT FALSE ORDER BY name`
    );
    for (const c of companies) {
      push(await getAllLeaves({ status: 'pending', companyId: c.id }), c.id, c.name);
    }
    return [...items.values()];
  }

  const memberships = await getUserMemberships(userId);
  for (const m of memberships) {
    if (m.role === 'admin' || m.role === 'super_admin') {
      push(await getAllLeaves({ status: 'pending', companyId: m.company_id }), m.company_id, m.company_name ?? null);
    } else if (m.role === 'manager') {
      push(await getTeamLeaves(userId, { status: 'pending', companyId: m.company_id }), m.company_id, m.company_name ?? null);
    }
  }
  return [...items.values()];
}

/**
 * created_at (TIMESTAMPTZ) không nằm trong danh sách OID được db.ts ép về string → pg driver
 * trả Date thật. localeCompare/toString trên Date có thể lỗi. Ép qua getTime() chịu mọi kiểu.
 */
function toTimeMs(v: unknown): number {
  if (!v) return 0;
  const t = new Date(v as string | Date).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function buildBucket(items: ActionItem[]): ActionBucket {
  const sorted = [...items].sort((a, b) => toTimeMs(a.waitingSince) - toTimeMs(b.waitingSince));
  const byCompanyMap = new Map<string, { company_id: string | null; company_name: string | null; count: number }>();
  const byType: Record<string, number> = {};
  for (const it of sorted) {
    const key = it.company_id || '∅';
    const cur = byCompanyMap.get(key) || { company_id: it.company_id, company_name: it.company_name, count: 0 };
    cur.count++; byCompanyMap.set(key, cur);
    byType[it.type] = (byType[it.type] || 0) + 1;
  }
  return {
    items: sorted,
    byCompany: [...byCompanyMap.values()].sort((a, b) => (a.company_name || '').localeCompare(b.company_name || '')),
    byType,
    total: sorted.length,
  };
}

/** Hai lăng kính "Cần Xử Lý" cho 1 người. Việc chờ LÂU NHẤT lên đầu (chống ứ đọng). */
export async function getActionCenter(userId: string, globalRole: string): Promise<{ mine: ActionBucket; team: ActionBucket }> {
  const [mineExp, mineLea, mineTsk, mineTck, mineCnd, teamExp, teamLea] = await Promise.all([
    mineExpenses(userId).catch(() => [] as ActionItem[]),
    mineLeaves(userId).catch(() => [] as ActionItem[]),
    mineTasks(userId).catch(() => [] as ActionItem[]),
    mineTickets(userId).catch(() => [] as ActionItem[]),
    mineCandidates(userId).catch(() => [] as ActionItem[]),
    teamExpenses(userId, globalRole).catch(() => [] as ActionItem[]),
    teamLeaves(userId, globalRole).catch(() => [] as ActionItem[]),
  ]);
  return {
    mine: buildBucket([...mineExp, ...mineLea, ...mineTsk, ...mineTck, ...mineCnd]),
    team: buildBucket([...teamExp, ...teamLea]),
  };
}
