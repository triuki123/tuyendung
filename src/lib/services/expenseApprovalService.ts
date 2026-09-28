/**
 * Chi Phí — DUYỆT hợp nhất 2 tầng (roadmap §2):
 *  Tầng 1: chuỗi ráp tay per-NGƯỜI-TẠO per-company (expense_approval_chains).
 *  Tầng 2: hạn mức thẩm quyền per-NGƯỜI-DUYỆT (expense_approver_limits) — đơn dừng ở
 *          người ĐẦU TIÊN đủ thẩm quyền (limit NULL trong record = vô hạn; KHÔNG có record
 *          = không có quyền chốt, phải đẩy tiếp trừ khi là cuối chuỗi).
 *  Fallback: rule hạn mức per-company (expense_approval_rules) khi chưa ráp chuỗi.
 * Bước duyệt đóng băng lúc submit vào expense_approvals. Người tạo trong chuỗi → skipped.
 */
import crypto from 'crypto';
import { query, queryOne, execute, withTransaction } from '@/lib/db';
import { hasExpensePerm } from './expensePermissionService';

// ── Kiểu dữ liệu ─────────────────────────────────────────────────────────────

export interface ChainStep { order: number; approver_user_id: string; label?: string }

export interface ApprovalChain {
  id: string;
  user_id: string;
  company_id: string | null;
  steps: ChainStep[];
  active: boolean;
}

export interface ApproverLimit {
  id: string;
  user_id: string;
  company_id: string | null;
  max_amount: number | null; // null = vô hạn
}

export interface RuleStep { order: number; approver_type: 'manager_chain' | 'specific_user' | 'role' | 'permission'; approver_value?: string; label?: string }

export interface ApprovalRule {
  id: string;
  company_id: string | null;
  min_amount: number;
  max_amount: number | null;
  steps: RuleStep[];
  active: boolean;
  sort_order: number;
}

export interface ExpenseApprovalRow {
  id: string;
  expense_id: string;
  step_order: number;
  approver_user_id: string;
  limit_amount: number | null;
  status: 'pending' | 'approved' | 'rejected' | 'skipped';
  approved_by: string | null;
  approved_at: string | null;
  note: string | null;
  approver_name?: string | null;
}

// ── CRUD chuỗi per-user (Tab "Quyền Chi Phí") ────────────────────────────────

export async function getChainsForUser(userId: string): Promise<ApprovalChain[]> {
  return query<ApprovalChain>(
    `SELECT * FROM expense_approval_chains WHERE user_id = $1::uuid ORDER BY company_id NULLS FIRST`,
    [userId]
  );
}

/** Ghi (upsert) chuỗi cho (user, company). steps rỗng = xóa chuỗi. */
export async function upsertChain(userId: string, companyId: string | null, steps: ChainStep[]): Promise<void> {
  if (!steps.length) {
    await execute(
      `DELETE FROM expense_approval_chains WHERE user_id = $1::uuid AND company_id IS NOT DISTINCT FROM $2::uuid`,
      [userId, companyId]
    );
    return;
  }
  const normalized = steps.map((s, i) => ({ order: i + 1, approver_user_id: s.approver_user_id, label: s.label }));
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM expense_approval_chains WHERE user_id = $1::uuid AND company_id IS NOT DISTINCT FROM $2::uuid`,
    [userId, companyId]
  );
  if (existing) {
    await execute(
      `UPDATE expense_approval_chains SET steps = $2, active = true, updated_at = NOW() WHERE id = $1`,
      [existing.id, JSON.stringify(normalized)]
    );
  } else {
    await execute(
      `INSERT INTO expense_approval_chains (id, user_id, company_id, steps) VALUES ($1, $2::uuid, $3::uuid, $4)`,
      ['eac_' + crypto.randomBytes(6).toString('hex'), userId, companyId, JSON.stringify(normalized)]
    );
  }
}

// ── CRUD hạn mức per-approver ────────────────────────────────────────────────

export async function getLimitsForUser(userId: string): Promise<ApproverLimit[]> {
  return query<ApproverLimit>(
    `SELECT * FROM expense_approver_limits WHERE user_id = $1::uuid ORDER BY company_id NULLS FIRST`,
    [userId]
  );
}

/** Upsert hạn mức (user, company). remove=true → xóa record (mất quyền chốt). */
export async function upsertLimit(userId: string, companyId: string | null, maxAmount: number | null, remove = false): Promise<void> {
  if (remove) {
    await execute(
      `DELETE FROM expense_approver_limits WHERE user_id = $1::uuid AND company_id IS NOT DISTINCT FROM $2::uuid`,
      [userId, companyId]
    );
    return;
  }
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM expense_approver_limits WHERE user_id = $1::uuid AND company_id IS NOT DISTINCT FROM $2::uuid`,
    [userId, companyId]
  );
  if (existing) {
    await execute('UPDATE expense_approver_limits SET max_amount = $2, updated_at = NOW() WHERE id = $1', [existing.id, maxAmount]);
  } else {
    await execute(
      `INSERT INTO expense_approver_limits (id, user_id, company_id, max_amount) VALUES ($1, $2::uuid, $3::uuid, $4)`,
      ['eal_' + crypto.randomBytes(6).toString('hex'), userId, companyId, maxAmount]
    );
  }
}

/** Hạn mức hiệu lực của 1 người duyệt tại 1 công ty: riêng công ty > chung > undefined (không có quyền chốt). */
async function effectiveLimit(userId: string, companyId: string): Promise<number | null | undefined> {
  const rows = await query<ApproverLimit>(
    `SELECT * FROM expense_approver_limits
      WHERE user_id = $1::uuid AND (company_id = $2::uuid OR company_id IS NULL)
      ORDER BY company_id NULLS LAST LIMIT 1`,
    [userId, companyId]
  );
  if (!rows.length) return undefined;
  return rows[0].max_amount === null ? null : Number(rows[0].max_amount);
}

// ── CRUD rule fallback per-company ───────────────────────────────────────────

export async function listRules(companyId?: string | null): Promise<ApprovalRule[]> {
  const params: unknown[] = [];
  let where = '';
  if (companyId !== undefined) {
    params.push(companyId);
    where = `WHERE company_id IS NOT DISTINCT FROM $1::uuid`;
  }
  return query<ApprovalRule>(`SELECT * FROM expense_approval_rules ${where} ORDER BY company_id NULLS LAST, min_amount, sort_order`, params);
}

export async function createRule(data: { company_id?: string | null; min_amount: number; max_amount?: number | null; steps: RuleStep[]; sort_order?: number }): Promise<ApprovalRule> {
  const row = await queryOne<ApprovalRule>(
    `INSERT INTO expense_approval_rules (id, company_id, min_amount, max_amount, steps, sort_order)
     VALUES ($1, $2::uuid, $3, $4, $5, $6) RETURNING *`,
    ['ear_' + crypto.randomBytes(6).toString('hex'), data.company_id ?? null, data.min_amount, data.max_amount ?? null,
     JSON.stringify(data.steps.map((s, i) => ({ ...s, order: i + 1 }))), data.sort_order ?? 0]
  );
  return row!;
}

export async function updateRule(id: string, patch: Partial<{ min_amount: number; max_amount: number | null; steps: RuleStep[]; active: boolean; sort_order: number }>): Promise<ApprovalRule | null> {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (!keys.length) return queryOne<ApprovalRule>('SELECT * FROM expense_approval_rules WHERE id = $1', [id]);
  const assignments = keys.map((k, i) => `"${k}" = $${i + 2}`);
  return queryOne<ApprovalRule>(
    `UPDATE expense_approval_rules SET ${assignments.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, ...keys.map((k) => (k === 'steps' ? JSON.stringify(patch.steps) : (patch[k] as unknown)))]
  );
}

export async function deleteRule(id: string): Promise<void> {
  await execute('DELETE FROM expense_approval_rules WHERE id = $1', [id]);
}

/** Lấy 1 rule theo id — để xét quyền `manage` theo ĐÚNG công ty sở hữu rule. */
export async function getRuleById(id: string): Promise<ApprovalRule | null> {
  return queryOne<ApprovalRule>('SELECT * FROM expense_approval_rules WHERE id = $1', [id]);
}

// ── RESOLVE chuỗi bước duyệt lúc submit ──────────────────────────────────────

export interface ResolvedStep { approver_user_id: string; limit_amount: number | null; skipped: boolean; label?: string }

/** Quản lý trực tiếp (manager_id là TEXT trong users). */
async function directManagerOf(userId: string): Promise<string | null> {
  const row = await queryOne<{ manager_id: string | null }>('SELECT manager_id FROM users WHERE id::text = $1', [userId.toLowerCase()]);
  return row?.manager_id || null;
}

/**
 * Resolve các bước duyệt cho (người tạo, công ty chịu chi, số tiền).
 * Ưu tiên: chuỗi riêng công ty > chuỗi chung > rule công ty > rule global.
 * Cắt chuỗi theo hạn mức: dừng ở người đầu tiên đủ thẩm quyền (limit null = vô hạn).
 * Người tạo nằm trong chuỗi → bước đó skipped.
 */
export async function resolveApprovalSteps(requesterId: string, companyId: string, amount: number): Promise<{ steps: ResolvedStep[]; source: 'chain' | 'rule' } | { steps: null; error: string }> {
  // Tầng 1: chuỗi ráp tay
  const chains = await query<ApprovalChain>(
    `SELECT * FROM expense_approval_chains
      WHERE user_id = $1::uuid AND active = true AND (company_id = $2::uuid OR company_id IS NULL)
      ORDER BY company_id NULLS LAST LIMIT 1`,
    [requesterId, companyId]
  );

  let approverIds: { id: string; label?: string }[] = [];
  let source: 'chain' | 'rule' = 'chain';

  if (chains.length && Array.isArray(chains[0].steps) && chains[0].steps.length) {
    approverIds = [...chains[0].steps]
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ id: s.approver_user_id, label: s.label }));
  } else {
    // Fallback: rule per-company theo hạn mức
    source = 'rule';
    const rules = await query<ApprovalRule>(
      `SELECT * FROM expense_approval_rules
        WHERE active = true AND (company_id = $1::uuid OR company_id IS NULL)
          AND min_amount <= $2 AND (max_amount IS NULL OR max_amount >= $2)
        ORDER BY company_id NULLS LAST, sort_order LIMIT 1`,
      [companyId, amount]
    );
    if (!rules.length) return { steps: null, error: 'Chưa cấu hình chuỗi duyệt cho bạn và công ty này chưa có quy tắc duyệt. Liên hệ quản trị.' };

    let cursor = requesterId;
    for (const s of [...rules[0].steps].sort((a, b) => a.order - b.order)) {
      if (s.approver_type === 'specific_user' && s.approver_value) {
        approverIds.push({ id: s.approver_value, label: s.label });
      } else if (s.approver_type === 'manager_chain') {
        const mgr = await directManagerOf(cursor);
        if (!mgr) return { steps: null, error: 'Không tìm thấy quản lý trực tiếp trong chuỗi duyệt. Liên hệ quản trị.' };
        approverIds.push({ id: mgr, label: s.label || 'Quản lý trực tiếp' });
        cursor = mgr; // manager_chain lồng nhau → leo tiếp lên trên
      } else {
        // 'role' | 'permission' — v1 chưa hỗ trợ resolve động (TODO v2)
        return { steps: null, error: `Quy tắc duyệt dùng kiểu "${s.approver_type}" chưa được hỗ trợ. Liên hệ quản trị.` };
      }
    }
  }

  if (!approverIds.length) return { steps: null, error: 'Chuỗi duyệt rỗng. Liên hệ quản trị.' };

  // Cắt chuỗi theo hạn mức thẩm quyền + đánh dấu skipped (người tạo tự duyệt)
  const steps: ResolvedStep[] = [];
  for (const a of approverIds) {
    const skipped = a.id.toLowerCase() === requesterId.toLowerCase();
    // Chặn SỚM: người duyệt thật sự vào chuỗi phải có quyền Duyệt TẠI CÔNG TY CHỊU CHI.
    // Nếu không, phiếu sẽ kẹt ở bước duyệt (route approve trả 403) — báo ngay lúc submit.
    if (!skipped && !(await hasExpensePerm(a.id, companyId, 'approve'))) {
      const u = await queryOne<{ name: string }>('SELECT name FROM users WHERE id::text = $1', [a.id.toLowerCase()]);
      return { steps: null, error: `Người duyệt "${u?.name || a.id}" chưa được cấp quyền Duyệt chi phí tại công ty này. Liên hệ quản trị.` };
    }
    const limit = await effectiveLimit(a.id, companyId);
    steps.push({ approver_user_id: a.id, limit_amount: limit === undefined ? undefined as unknown as null : limit, skipped, label: a.label });
    // Người này đủ thẩm quyền chốt (và không bị skip) → chuỗi kết thúc tại đây.
    if (!skipped && limit !== undefined && (limit === null || Number(limit) >= amount)) break;
  }

  // Nếu tất cả bước đều skipped (người tạo tự ráp mình) → lỗi.
  if (steps.every((s) => s.skipped)) return { steps: null, error: 'Chuỗi duyệt chỉ chứa chính bạn — không hợp lệ.' };
  return { steps, source };
}

// ── Sinh + xử lý bước duyệt ──────────────────────────────────────────────────

/** Đóng băng các bước vào expense_approvals (gọi trong submit, cùng transaction). */
export async function freezeApprovalSteps(
  client: { query: (text: string, params?: unknown[]) => Promise<unknown> },
  expenseId: string,
  steps: ResolvedStep[]
): Promise<void> {
  await client.query('DELETE FROM expense_approvals WHERE expense_id = $1', [expenseId]);
  let order = 1;
  for (const s of steps) {
    await client.query(
      `INSERT INTO expense_approvals (id, expense_id, step_order, approver_user_id, limit_amount, status, note)
       VALUES ($1,$2,$3,$4::uuid,$5,$6,$7)`,
      ['eap_' + crypto.randomBytes(6).toString('hex'), expenseId, order++, s.approver_user_id,
       s.limit_amount ?? null, s.skipped ? 'skipped' : 'pending', s.skipped ? 'Bỏ qua: người tạo đơn' : null]
    );
  }
}

export async function listApprovals(expenseId: string): Promise<ExpenseApprovalRow[]> {
  return query<ExpenseApprovalRow>(
    `SELECT a.*, u.name AS approver_name FROM expense_approvals a
     LEFT JOIN users u ON u.id::text = a.approver_user_id::text
     WHERE a.expense_id = $1 ORDER BY a.step_order`,
    [expenseId]
  );
}

/** Bước pending nhỏ nhất (bước "đến lượt"). */
export async function currentStep(expenseId: string): Promise<ExpenseApprovalRow | null> {
  return queryOne<ExpenseApprovalRow>(
    `SELECT * FROM expense_approvals WHERE expense_id = $1 AND status = 'pending' ORDER BY step_order LIMIT 1`,
    [expenseId]
  );
}

export interface StepActionResult {
  ok: boolean;
  error?: string;
  /** completed = đã duyệt hết chuỗi → expense approved; advanced = còn bước sau; rejected = bị từ chối */
  outcome?: 'completed' | 'advanced' | 'rejected';
  nextApproverId?: string;
}

/** Duyệt bước hiện tại (gate: đúng người + đúng lượt). */
export async function approveCurrentStep(expenseId: string, approverId: string, note?: string): Promise<StepActionResult> {
  return withTransaction(async (client) => {
    const cur = await client.query(
      `SELECT * FROM expense_approvals WHERE expense_id = $1 AND status = 'pending' ORDER BY step_order LIMIT 1 FOR UPDATE`,
      [expenseId]
    ) as { rows: ExpenseApprovalRow[] };
    const step = cur.rows[0];
    if (!step) return { ok: false, error: 'Không còn bước nào chờ duyệt' };
    if (String(step.approver_user_id).toLowerCase() !== approverId.toLowerCase()) {
      return { ok: false, error: 'Chưa đến lượt bạn duyệt phiếu này' };
    }
    await client.query(
      `UPDATE expense_approvals SET status='approved', approved_by=$2::uuid, approved_at=NOW(), note=$3 WHERE id=$1`,
      [step.id, approverId, note ?? null]
    );
    const next = await client.query(
      `SELECT * FROM expense_approvals WHERE expense_id = $1 AND status = 'pending' ORDER BY step_order LIMIT 1`,
      [expenseId]
    ) as { rows: ExpenseApprovalRow[] };
    if (next.rows[0]) {
      return { ok: true, outcome: 'advanced', nextApproverId: String(next.rows[0].approver_user_id) };
    }
    await client.query(`UPDATE expenses SET status='approved', updated_at=NOW() WHERE id=$1`, [expenseId]);
    return { ok: true, outcome: 'completed' };
  });
}

/** Từ chối ở bước hiện tại → expense rejected, dừng chuỗi. */
export async function rejectCurrentStep(expenseId: string, approverId: string, reason: string): Promise<StepActionResult> {
  return withTransaction(async (client) => {
    const cur = await client.query(
      `SELECT * FROM expense_approvals WHERE expense_id = $1 AND status = 'pending' ORDER BY step_order LIMIT 1 FOR UPDATE`,
      [expenseId]
    ) as { rows: ExpenseApprovalRow[] };
    const step = cur.rows[0];
    if (!step) return { ok: false, error: 'Không còn bước nào chờ duyệt' };
    if (String(step.approver_user_id).toLowerCase() !== approverId.toLowerCase()) {
      return { ok: false, error: 'Chưa đến lượt bạn duyệt phiếu này' };
    }
    await client.query(
      `UPDATE expense_approvals SET status='rejected', approved_by=$2::uuid, approved_at=NOW(), note=$3 WHERE id=$1`,
      [step.id, approverId, reason]
    );
    await client.query(`UPDATE expenses SET status='rejected', reject_reason=$2, updated_at=NOW() WHERE id=$1`, [expenseId, reason]);
    return { ok: true, outcome: 'rejected' };
  });
}

/** Đã có bước nào được duyệt chưa (điều kiện Thu hồi 11.5). */
export async function hasAnyApprovedStep(expenseId: string): Promise<boolean> {
  const row = await queryOne<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM expense_approvals WHERE expense_id = $1 AND status = 'approved'`,
    [expenseId]
  );
  return Number(row?.cnt) > 0;
}
