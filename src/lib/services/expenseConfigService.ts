/**
 * Chi Phí — cấu hình: danh mục loại chi phí (flow_type mở) + quy tắc số phiếu per-company.
 * Thiết kế: docs/technical/expense-module-roadmap.md §11.
 */
import crypto from 'crypto';
import { query, queryOne, execute } from '@/lib/db';

// ── Danh mục loại chi phí ────────────────────────────────────────────────────

export type ExpenseFlowType = 'asset_purchase' | 'operational' | 'reimbursement' | 'service' | 'advance' | (string & {});

export interface ExpenseCategory {
  id: string;
  code: string;
  name: string;
  description: string | null;
  flow_type: ExpenseFlowType;
  company_id: string | null;
  color: string;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Danh mục loại chi phí; companyId → loại dùng chung (null) + riêng công ty đó. */
export async function listExpenseCategories(activeOnly = true, companyId?: string | null): Promise<ExpenseCategory[]> {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (activeOnly) conds.push('active = true');
  if (companyId) {
    params.push(companyId);
    conds.push(`(company_id IS NULL OR company_id = $${params.length}::uuid)`);
  }
  return query<ExpenseCategory>(
    `SELECT * FROM expense_categories ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
     ORDER BY sort_order, name`,
    params
  );
}

export async function getExpenseCategoryById(id: string): Promise<ExpenseCategory | null> {
  return queryOne<ExpenseCategory>('SELECT * FROM expense_categories WHERE id = $1', [id]);
}

export async function createExpenseCategory(data: {
  code: string; name: string; description?: string | null; flow_type?: string;
  company_id?: string | null; color?: string; sort_order?: number;
}): Promise<ExpenseCategory> {
  const id = 'ecat_' + crypto.randomBytes(6).toString('hex');
  const row = await queryOne<ExpenseCategory>(
    `INSERT INTO expense_categories (id, code, name, description, flow_type, company_id, color, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6::uuid,$7,$8) RETURNING *`,
    [id, data.code.trim(), data.name.trim(), data.description ?? null, data.flow_type || 'operational',
     data.company_id ?? null, data.color || '#6366f1', data.sort_order ?? 99]
  );
  return row!;
}

export async function updateExpenseCategory(
  id: string,
  patch: Partial<Pick<ExpenseCategory, 'name' | 'description' | 'flow_type' | 'company_id' | 'color' | 'active' | 'sort_order'>>
): Promise<ExpenseCategory | null> {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (keys.length === 0) return getExpenseCategoryById(id);
  const assignments = keys.map((k, i) => `"${k}" = $${i + 2}${k === 'company_id' ? '::uuid' : ''}`);
  return queryOne<ExpenseCategory>(
    `UPDATE expense_categories SET ${assignments.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, ...keys.map((k) => patch[k] as unknown)]
  );
}

/** Xóa loại — đã có phiếu dùng thì chỉ tắt. */
export async function deleteExpenseCategory(id: string): Promise<{ deleted: boolean; deactivated: boolean }> {
  const used = await queryOne<{ cnt: string }>('SELECT COUNT(*) AS cnt FROM expenses WHERE category_id = $1', [id]);
  if (Number(used?.cnt) > 0) {
    await execute('UPDATE expense_categories SET active = false, updated_at = NOW() WHERE id = $1', [id]);
    return { deleted: false, deactivated: true };
  }
  const n = await execute('DELETE FROM expense_categories WHERE id = $1', [id]);
  return { deleted: n > 0, deactivated: false };
}

// ── Quy tắc số phiếu per-company ─────────────────────────────────────────────

export interface ExpenseCodeRule {
  company_id: string;
  pattern: string;
  next_seq: number;
  reset_yearly: boolean;
  last_reset_year: number | null;
}

const DEFAULT_PATTERN = 'CP-{YYYY}-{SEQ:5}';

export async function getExpenseCodeRule(companyId: string): Promise<ExpenseCodeRule | null> {
  return queryOne<ExpenseCodeRule>('SELECT * FROM expense_code_rules WHERE company_id = $1::uuid', [companyId]);
}

export async function upsertExpenseCodeRule(companyId: string, data: { pattern?: string; reset_yearly?: boolean; next_seq?: number }): Promise<ExpenseCodeRule> {
  const row = await queryOne<ExpenseCodeRule>(
    `INSERT INTO expense_code_rules (company_id, pattern, reset_yearly, next_seq)
     VALUES ($1::uuid, $2, $3, $4)
     ON CONFLICT (company_id) DO UPDATE SET
       pattern      = COALESCE($2, expense_code_rules.pattern),
       reset_yearly = COALESCE($3, expense_code_rules.reset_yearly),
       next_seq     = COALESCE($4, expense_code_rules.next_seq)
     RETURNING *`,
    [companyId, data.pattern ?? DEFAULT_PATTERN, data.reset_yearly ?? true, data.next_seq ?? 1]
  );
  return row!;
}

/** Render pattern → số phiếu. Placeholder: {YYYY} {YY} {MM} {SEQ:n} {COMPANY} (mã công ty). */
function renderCode(pattern: string, seq: number, companyCode: string, now = new Date()): string {
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return pattern
    .replace(/\{YYYY\}/g, yyyy)
    .replace(/\{YY\}/g, yyyy.slice(2))
    .replace(/\{MM\}/g, mm)
    .replace(/\{COMPANY\}/g, companyCode)
    .replace(/\{SEQ(?::(\d+))?\}/g, (_m, w) => String(seq).padStart(w ? Number(w) : 5, '0'));
}

/**
 * Sinh số phiếu kế tiếp cho công ty (atomic: UPDATE ... RETURNING, tự reset đầu năm nếu cấu hình).
 * Chưa có rule → tự tạo rule mặc định.
 */
export async function generateExpenseCode(companyId: string): Promise<string> {
  const year = new Date().getFullYear();
  let rule = await getExpenseCodeRule(companyId);
  if (!rule) rule = await upsertExpenseCodeRule(companyId, {});

  // Reset đầu năm (nếu bật) — idempotent theo last_reset_year.
  if (rule.reset_yearly && rule.last_reset_year !== year) {
    await execute(
      `UPDATE expense_code_rules SET next_seq = 1, last_reset_year = $2
       WHERE company_id = $1::uuid AND (last_reset_year IS DISTINCT FROM $2)`,
      [companyId, year]
    );
  }

  const bumped = await queryOne<ExpenseCodeRule>(
    `UPDATE expense_code_rules SET next_seq = next_seq + 1 WHERE company_id = $1::uuid
     RETURNING company_id, pattern, next_seq - 1 AS next_seq, reset_yearly, last_reset_year`,
    [companyId]
  );
  const company = await queryOne<{ code: string | null; name: string }>(
    'SELECT code, name FROM companies WHERE id = $1::uuid', [companyId]
  );
  return renderCode(bumped!.pattern, Number(bumped!.next_seq), company?.code || '');
}
