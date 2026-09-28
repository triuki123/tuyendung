/**
 * Chi Phí — service lõi: CRUD phiếu chi, submit (sinh số phiếu + đóng băng chuỗi duyệt),
 * thu hồi / hủy (11.5), cảnh báo nghi trùng, thread trao đổi, dòng chảy tài sản (flow_type).
 * Thiết kế: docs/technical/expense-module-roadmap.md.
 */
import crypto from 'crypto';
import { query, queryOne, execute, withTransaction } from '@/lib/db';
import { generateExpenseCode, getExpenseCategoryById } from './expenseConfigService';
import { resolveApprovalSteps, freezeApprovalSteps, hasAnyApprovedStep } from './expenseApprovalService';
import { logActivity } from './auditService';
import { uploadBufferAsMedia, getMediaBuffer, softDeleteMedia } from './mediaService';

/** Audit 11.5.5: ghi mọi chuyển trạng thái phiếu chi vào lịch sử (không chặn luồng nếu lỗi). */
export function auditExpense(action: string, e: { id: string; code: string | null; title: string }, actorId: string, extra = ''): void {
  void logActivity({
    action: `expense_${action}`,
    details: `Phiếu chi ${e.code || e.id} — "${e.title}"${extra ? ` · ${extra}` : ''}`,
    performedBy: actorId,
  }).catch(() => {});
}

export type ExpenseStatus = 'draft' | 'pending_approval' | 'approved' | 'cancelled'
  | 'sent_to_accounting' | 'posted' | 'paid' | 'rejected';

export interface ExpenseLine { id?: string; noi_dung: string; mo_ta?: string | null; sl: number; dvt?: string | null; don_gia: number; thanh_tien: number }

export interface Expense {
  id: string;
  code: string | null;
  title: string;
  expense_date: string | null;
  category_id: string | null;
  amount: number;
  amount_before_tax: number | null;
  vat_enabled: boolean;
  vat_rate: number | null;
  vat_amount: number | null;
  currency: string;
  /** 1 nguyên tệ = ? VND (VND → 1). */
  exchange_rate: number;
  /** Tổng cộng quy đổi VND — dùng cho hạn mức duyệt / báo cáo. */
  amount_base: number | null;
  company_id: string;
  department_id: string | null;
  cost_center: string | null;
  project_code: string | null;
  requested_by: string;
  invoice_number: string | null;
  invoice_date: string | null;
  supplier_name: string | null;
  supplier_tax_code: string | null;
  payee_name: string | null;
  payment_method: string;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_name: string | null;
  related_type: string | null;
  related_id: string | null;
  advance_id: string | null;
  settlement_status: string;
  refund_confirmed_at: string | null;
  refund_confirmed_by: string | null;
  status: ExpenseStatus;
  reject_reason: string | null;
  cancel_reason: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  accounting_ref: string | null;
  external_status: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  category_name?: string | null;
  category_flow_type?: string | null;
  company_name?: string | null;
  requester_name?: string | null;
}

const SELECT_JOINED = `
  SELECT e.*,
         c.name AS category_name, c.flow_type AS category_flow_type,
         co.name AS company_name,
         u.name AS requester_name
    FROM expenses e
    LEFT JOIN expense_categories c ON c.id = e.category_id
    LEFT JOIN companies co ON co.id = e.company_id
    LEFT JOIN users u ON u.id = e.requested_by`;

// ── Danh sách / chi tiết ─────────────────────────────────────────────────────

export interface ListExpensesFilter {
  status?: ExpenseStatus | ExpenseStatus[];
  companyId?: string;
  requestedBy?: string;
  /** Chỉ các phiếu người này đang ĐẾN LƯỢT duyệt. */
  pendingApproverId?: string;
  /** Đơn của cấp dưới (cây manager_id) của người này — phạm vi phòng ban/đội. */
  teamOfUserId?: string;
  relatedType?: string;
  relatedId?: string;
  limit?: number;
}

export async function listExpenses(f: ListExpensesFilter): Promise<Expense[]> {
  const conds: string[] = [];
  const params: unknown[] = [];
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };

  if (f.status) {
    const arr = Array.isArray(f.status) ? f.status : [f.status];
    conds.push(`e.status = ANY(${p(arr)})`);
  }
  if (f.companyId) conds.push(`e.company_id = ${p(f.companyId)}::uuid`);
  if (f.requestedBy) conds.push(`e.requested_by = ${p(f.requestedBy)}::uuid`);
  if (f.relatedType) conds.push(`e.related_type = ${p(f.relatedType)}`);
  if (f.relatedId) conds.push(`e.related_id = ${p(f.relatedId)}`);
  if (f.teamOfUserId) {
    conds.push(`e.requested_by::text IN (
      WITH RECURSIVE sub AS (
        SELECT id::text AS id FROM users WHERE manager_id = ${p(f.teamOfUserId.toLowerCase())}
        UNION
        SELECT u.id::text FROM users u JOIN sub s ON u.manager_id = s.id
      ) SELECT id FROM sub)`);
  }
  if (f.pendingApproverId) {
    conds.push(`e.status = 'pending_approval' AND EXISTS (
      SELECT 1 FROM expense_approvals a
       WHERE a.expense_id = e.id AND a.status = 'pending' AND a.approver_user_id = ${p(f.pendingApproverId)}::uuid
         AND a.step_order = (SELECT MIN(step_order) FROM expense_approvals a2 WHERE a2.expense_id = e.id AND a2.status = 'pending')
    )`);
  }
  return query<Expense>(
    `${SELECT_JOINED} ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
     ORDER BY e.created_at DESC LIMIT ${Math.min(f.limit ?? 200, 500)}`,
    params
  );
}

export async function getExpenseById(id: string): Promise<Expense | null> {
  return queryOne<Expense>(`${SELECT_JOINED} WHERE e.id = $1`, [id]);
}

/** Số phiếu chi đang chờ ĐÍCH DANH user này duyệt (đến lượt) — cho badge sidebar. */
export async function countPendingApprovals(userId: string): Promise<number> {
  const r = await queryOne<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM expenses e
      WHERE e.status = 'pending_approval' AND EXISTS (
        SELECT 1 FROM expense_approvals a
         WHERE a.expense_id = e.id AND a.status = 'pending' AND a.approver_user_id = $1::uuid
           AND a.step_order = (SELECT MIN(step_order) FROM expense_approvals a2 WHERE a2.expense_id = e.id AND a2.status = 'pending')
      )`,
    [userId]
  );
  return Number(r?.cnt || 0);
}

export async function getExpenseLines(expenseId: string): Promise<ExpenseLine[]> {
  return query<ExpenseLine>(
    'SELECT id, noi_dung, mo_ta, sl, dvt, don_gia, thanh_tien FROM expense_lines WHERE expense_id = $1 ORDER BY sort_order',
    [expenseId]
  );
}

// ── Tạo / sửa (draft | rejected) ─────────────────────────────────────────────

const EDITABLE_COLS = [
  'title', 'expense_date', 'category_id', 'amount', 'amount_before_tax', 'vat_enabled', 'vat_rate', 'vat_amount',
  'currency', 'exchange_rate', 'amount_base',
  'company_id', 'department_id', 'cost_center', 'project_code',
  'invoice_number', 'invoice_date', 'supplier_name', 'supplier_tax_code',
  'payee_name', 'payment_method', 'bank_account_name', 'bank_account_number', 'bank_name',
  'related_type', 'related_id', 'advance_id',
] as const;

/** Chuẩn hoá đa tiền tệ: VND ép rate=1; amount_base LUÔN server tính = amount × rate (VND). */
function normalizeCurrency(data: Record<string, unknown>, cur?: Expense | null): void {
  const currency = String(data.currency ?? cur?.currency ?? 'VND').toUpperCase();
  let rate = Number(data.exchange_rate ?? cur?.exchange_rate ?? 1);
  if (!Number.isFinite(rate) || rate <= 0) rate = 1;
  if (currency === 'VND') rate = 1;
  if (data.currency !== undefined) data.currency = currency;
  if (data.exchange_rate !== undefined || currency === 'VND') data.exchange_rate = rate;
  const amount = Number(data.amount ?? cur?.amount ?? 0);
  if (data.amount !== undefined || data.exchange_rate !== undefined || data.currency !== undefined) {
    data.amount_base = Math.round(amount * rate);
  } else {
    delete data.amount_base; // không cho client tự set
  }
}

export async function createExpense(data: Partial<Expense> & { title: string; company_id: string; requested_by: string; lines?: ExpenseLine[] }): Promise<Expense> {
  const id = 'exp_' + crypto.randomBytes(8).toString('hex');
  normalizeCurrency(data as Record<string, unknown>);
  await withTransaction(async (client) => {
    const cols: string[] = ['id', 'requested_by', 'status'];
    const vals: unknown[] = [id, data.requested_by, 'draft'];
    for (const k of EDITABLE_COLS) {
      if ((data as Record<string, unknown>)[k] !== undefined) { cols.push(k); vals.push((data as Record<string, unknown>)[k]); }
    }
    const ph = cols.map((c, i) => `$${i + 1}${c === 'company_id' || c === 'department_id' || c === 'requested_by' ? '' : ''}`);
    await client.query(
      `INSERT INTO expenses (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${ph.join(',')})`,
      vals
    );
    if (data.lines) await replaceLines(client, id, data.lines);
  });
  return (await getExpenseById(id))!;
}

async function replaceLines(client: { query: (t: string, p?: unknown[]) => Promise<unknown> }, expenseId: string, lines: ExpenseLine[]): Promise<void> {
  await client.query('DELETE FROM expense_lines WHERE expense_id = $1', [expenseId]);
  let i = 0;
  for (const l of lines) {
    if (!l.noi_dung && !l.mo_ta && !l.don_gia) continue;
    await client.query(
      `INSERT INTO expense_lines (id, expense_id, noi_dung, mo_ta, sl, dvt, don_gia, thanh_tien, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      ['exl_' + crypto.randomBytes(6).toString('hex'), expenseId, l.noi_dung || '', l.mo_ta ?? null, l.sl ?? 1, l.dvt ?? null, l.don_gia ?? 0, l.thanh_tien ?? 0, i++]
    );
  }
}

/** Sửa phiếu — chỉ khi draft | rejected (rejected sửa xong phải submit lại). */
export async function updateExpense(id: string, patch: Partial<Expense> & { lines?: ExpenseLine[] }): Promise<{ ok: boolean; error?: string }> {
  const cur = await getExpenseById(id);
  if (!cur) return { ok: false, error: 'Không tìm thấy phiếu' };
  if (cur.status !== 'draft' && cur.status !== 'rejected') return { ok: false, error: 'Chỉ sửa được phiếu nháp hoặc bị từ chối' };

  normalizeCurrency(patch as Record<string, unknown>, cur);
  await withTransaction(async (client) => {
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const k of EDITABLE_COLS) {
      if ((patch as Record<string, unknown>)[k] !== undefined) {
        vals.push((patch as Record<string, unknown>)[k]);
        sets.push(`"${k}" = $${vals.length}`);
      }
    }
    if (sets.length) {
      vals.push(id);
      await client.query(`UPDATE expenses SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${vals.length}`, vals);
    }
    if (patch.lines) await replaceLines(client, id, patch.lines);
  });
  return { ok: true };
}

/** Xóa phiếu tạo sai — chỉ cho draft | rejected để tránh mất dấu luồng đã chạy. */
export async function deleteExpense(id: string): Promise<{ ok: boolean; error?: string }> {
  const cur = await getExpenseById(id);
  if (!cur) return { ok: false, error: 'Không tìm thấy phiếu' };
  if (cur.status !== 'draft' && cur.status !== 'rejected') {
    return { ok: false, error: 'Chỉ xóa được phiếu nháp hoặc bị từ chối' };
  }

  const linkedSettlement = await queryOne<{ id: string }>(
    `SELECT id FROM expenses
      WHERE (advance_id = $1 OR id = $1)
        AND id <> $1
        AND status <> 'cancelled'
      LIMIT 1`,
    [id]
  );
  if (linkedSettlement) {
    return { ok: false, error: 'Phiếu này đã liên kết quyết toán/tạm ứng, không thể xóa' };
  }

  const spawnedAsset = await queryOne<{ id: string }>(
    'SELECT id::text AS id FROM assets WHERE expense_id = $1 LIMIT 1',
    [id]
  );
  if (spawnedAsset) {
    return { ok: false, error: 'Phiếu này đã sinh tài sản liên quan, không thể xóa' };
  }

  await execute('DELETE FROM expenses WHERE id = $1', [id]);
  return { ok: true };
}

// ── Cảnh báo nghi trùng (11.5 — kiểu Ramp, không chặn) ───────────────────────

export async function findDuplicateWarning(supplierTaxCode: string | null | undefined, invoiceNumber: string | null | undefined, excludeId?: string, companyId?: string | null): Promise<Expense | null> {
  if (!supplierTaxCode?.trim() || !invoiceNumber?.trim()) return null;
  // Chỉ so trong CÙNG công ty chịu chi — tránh lộ mã/tiêu đề phiếu của công ty khác.
  return queryOne<Expense>(
    `${SELECT_JOINED}
      WHERE e.supplier_tax_code = $1 AND e.invoice_number = $2
        AND e.status NOT IN ('rejected','cancelled') AND ($3::text IS NULL OR e.id <> $3)
        AND ($4::uuid IS NULL OR e.company_id = $4::uuid)
      ORDER BY e.created_at DESC LIMIT 1`,
    [supplierTaxCode.trim(), invoiceNumber.trim(), excludeId ?? null, companyId ?? null]
  );
}

// ── Submit / Thu hồi / Hủy (11.5) ────────────────────────────────────────────

export interface SubmitResult { ok: boolean; error?: string; firstApproverId?: string; code?: string }

/** Gửi duyệt: resolve chuỗi 2 tầng → sinh số phiếu (lần đầu) → đóng băng bước → pending_approval. */
export async function submitExpense(id: string, callerId: string): Promise<SubmitResult> {
  const cur = await getExpenseById(id);
  if (!cur) return { ok: false, error: 'Không tìm thấy phiếu' };
  if (cur.requested_by.toLowerCase() !== callerId.toLowerCase()) return { ok: false, error: 'Chỉ người tạo được gửi duyệt' };
  if (cur.status !== 'draft' && cur.status !== 'rejected') return { ok: false, error: 'Phiếu không ở trạng thái gửi được' };
  if (!cur.amount || Number(cur.amount) <= 0) return { ok: false, error: 'Số tiền phải lớn hơn 0' };
  if (!cur.category_id) return { ok: false, error: 'Chọn loại chi phí' };

  // v1.1: phiếu quyết toán — validate liên kết tạm ứng trước khi gửi.
  const settleErr = await validateSettlementLink(cur);
  if (settleErr) return { ok: false, error: settleErr };

  // Hạn mức thẩm quyền so sánh bằng VND QUY ĐỔI (đa tiền tệ, mig 258).
  const baseAmount = Number(cur.amount_base ?? Math.round(Number(cur.amount) * Number(cur.exchange_rate || 1)));
  const resolved = await resolveApprovalSteps(cur.requested_by, cur.company_id, baseAmount);
  if (!resolved.steps) return { ok: false, error: resolved.error };

  const code = cur.code || await generateExpenseCode(cur.company_id);

  await withTransaction(async (client) => {
    await freezeApprovalSteps(client, id, resolved.steps!);
    await client.query(
      `UPDATE expenses SET status='pending_approval', code=$2, reject_reason=NULL, updated_at=NOW() WHERE id=$1`,
      [id, code]
    );
  });

  // Dòng chảy: loại mua tài sản → treo tài sản "Chờ mua" (nếu chưa sinh).
  await spawnAssetIfNeeded(id).catch((e) => console.error('[expense] spawn asset error:', e));
  // v1.1: phiếu quyết toán gửi duyệt → tạm ứng gốc chuyển 'pending'.
  if (cur.advance_id) {
    await execute(`UPDATE expenses SET settlement_status='pending', updated_at=NOW() WHERE id=$1`, [cur.advance_id]).catch(() => {});
  }
  auditExpense('submitted', { ...cur, code }, callerId, 'gửi duyệt');

  const first = resolved.steps.find((s) => !s.skipped);
  return { ok: true, firstApproverId: first?.approver_user_id, code };
}

/** Thu hồi: người tạo, khi CHƯA ai duyệt bước nào → về draft. */
export async function recallExpense(id: string, callerId: string): Promise<{ ok: boolean; error?: string }> {
  const cur = await getExpenseById(id);
  if (!cur) return { ok: false, error: 'Không tìm thấy phiếu' };
  if (cur.requested_by.toLowerCase() !== callerId.toLowerCase()) return { ok: false, error: 'Chỉ người tạo được thu hồi' };
  if (cur.status !== 'pending_approval') return { ok: false, error: 'Phiếu không ở trạng thái chờ duyệt' };
  if (await hasAnyApprovedStep(id)) return { ok: false, error: 'Đã có người duyệt — không thu hồi được, hãy nhờ từ chối' };

  await withTransaction(async (client) => {
    await client.query(`DELETE FROM expense_approvals WHERE expense_id = $1`, [id]);
    await client.query(`UPDATE expenses SET status='draft', updated_at=NOW() WHERE id=$1`, [id]);
  });
  await revertSettlementPending(id).catch(() => {});
  auditExpense('recalled', cur, callerId, 'thu hồi về nháp');
  return { ok: true };
}

/** Hủy phiếu đã duyệt (trước khi bàn giao Kế toán): người tạo hoặc người chốt, bắt buộc lý do. */
export async function cancelExpense(id: string, callerId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const cur = await getExpenseById(id);
  if (!cur) return { ok: false, error: 'Không tìm thấy phiếu' };
  if (cur.status !== 'approved') return { ok: false, error: 'Chỉ hủy được phiếu ĐÃ DUYỆT chưa bàn giao Kế toán' };
  if (!reason.trim()) return { ok: false, error: 'Nhập lý do hủy' };

  const finalApprover = await queryOne<{ approved_by: string | null }>(
    `SELECT approved_by FROM expense_approvals WHERE expense_id = $1 AND status = 'approved' ORDER BY step_order DESC LIMIT 1`,
    [id]
  );
  const isCreator = cur.requested_by.toLowerCase() === callerId.toLowerCase();
  const isFinal = finalApprover?.approved_by && String(finalApprover.approved_by).toLowerCase() === callerId.toLowerCase();
  if (!isCreator && !isFinal) return { ok: false, error: 'Chỉ người tạo hoặc người chốt duyệt được hủy phiếu' };

  await execute(
    `UPDATE expenses SET status='cancelled', cancel_reason=$2, cancelled_by=$3::uuid, cancelled_at=NOW(), updated_at=NOW() WHERE id=$1`,
    [id, reason.trim(), callerId]
  );
  await revertSettlementPending(id).catch(() => {});
  auditExpense('cancelled', cur, callerId, `lý do: ${reason.trim()}`);
  return { ok: true };
}

// ── Dòng chảy tài sản (flow_type = asset_purchase) ───────────────────────────

/** Đã duyệt → tài sản gắn phiếu chuyển "Đang mua". */
export async function markAssetsPurchasing(expenseId: string): Promise<void> {
  await execute(`UPDATE assets SET status='dang_mua', updated_at=NOW() WHERE expense_id=$1 AND status='cho_mua'`, [expenseId]);
}

/** Treo tài sản "Chờ mua" từ phiếu chi loại mua tài sản (idempotent). */
async function spawnAssetIfNeeded(expenseId: string): Promise<void> {
  const e = await getExpenseById(expenseId);
  if (!e?.category_id) return;
  const cat = await getExpenseCategoryById(e.category_id);
  if (cat?.flow_type !== 'asset_purchase') return;
  const existing = await queryOne('SELECT 1 FROM assets WHERE expense_id = $1', [expenseId]);
  if (existing) return;

  const code = `TS-${(e.code || e.id).replace(/^exp_/, '').toUpperCase()}`;
  await execute(
    `INSERT INTO assets (code, name, category, status, company_id, department, notes, value, expense_id, source_ticket_id, image_url)
     VALUES ($1,$2,$3,'cho_mua',$4::uuid,$5,$6,$7,$8,$9,'')
     ON CONFLICT (code) DO NOTHING`,
    [code, e.title, 'Thiết bị', e.company_id, null,
     `Sinh tự động từ phiếu chi ${e.code || e.id}`, Number(e.amount) || 0,
     expenseId, e.related_type === 'ticket' ? e.related_id : null]
  );
}

/** Nhận hàng: tài sản Chờ mua/Đang mua của phiếu → 'available' (Sẵn sàng — chuẩn trang Tài sản). */
export async function receiveAssets(expenseId: string, callerId: string): Promise<{ ok: boolean; error?: string; count?: number }> {
  const e = await getExpenseById(expenseId);
  if (!e) return { ok: false, error: 'Không tìm thấy phiếu' };
  if (e.status !== 'approved' && e.status !== 'sent_to_accounting' && e.status !== 'posted' && e.status !== 'paid') {
    return { ok: false, error: 'Phiếu chưa được duyệt xong' };
  }
  const n = await execute(
    `UPDATE assets SET status='available', purchase_date=to_char(NOW(),'YYYY-MM-DD'), updated_at=NOW()
     WHERE expense_id=$1 AND status IN ('cho_mua','dang_mua')`,
    [expenseId]
  );
  if (n > 0) auditExpense('received_goods', e, callerId, `nhận hàng — ${n} tài sản đưa vào Sẵn sàng`);
  return { ok: true, count: n };
}

/** Tài sản sinh ra từ phiếu (dòng chảy — hiển thị link ở chi tiết). */
export async function getSpawnedAssets(expenseId: string): Promise<Array<{ id: string; code: string; name: string; status: string }>> {
  return query('SELECT id::text AS id, code, name, status FROM assets WHERE expense_id = $1 ORDER BY created_at', [expenseId]);
}

// ── TẠM ỨNG → QUYẾT TOÁN (v1.1 — roadmap §11.6) ─────────────────────────────
// Phiếu tạm ứng = category flow_type='advance'. Phiếu quyết toán = expense gắn advance_id.
// Vòng đời settlement_status trên PHIẾU TẠM ỨNG: none → pending (quyết toán đang chạy) → settled.

export interface SettlementInfo {
  /** Nếu phiếu này LÀ quyết toán: thông tin phiếu tạm ứng gốc + chênh lệch. */
  advance?: { id: string; code: string | null; title: string; amount: number; status: string; currency: string } | null;
  /** Nếu phiếu này LÀ tạm ứng: các phiếu quyết toán gắn vào. */
  settlements?: Array<{ id: string; code: string | null; title: string; amount: number; status: string; currency: string }>;
}

/** Thông tin quyết toán 2 chiều cho màn chi tiết. */
export async function getSettlementInfo(e: Expense): Promise<SettlementInfo> {
  const info: SettlementInfo = {};
  if (e.advance_id) {
    info.advance = await queryOne<{ id: string; code: string | null; title: string; amount: number; status: string; currency: string }>(
      'SELECT id, code, title, amount, status, currency FROM expenses WHERE id = $1', [e.advance_id]
    );
  }
  if (e.category_flow_type === 'advance') {
    info.settlements = await query(
      `SELECT id, code, title, amount, status, currency FROM expenses
        WHERE advance_id = $1 AND status NOT IN ('cancelled') ORDER BY created_at`,
      [e.id]
    );
  }
  return info;
}

/** Phiếu tạm ứng CỦA TÔI đã duyệt, chưa quyết toán xong (cho picker "Quyết toán"). */
export async function listMyUnsettledAdvances(userId: string, companyId?: string | null): Promise<Expense[]> {
  const params: unknown[] = [userId];
  let extra = '';
  if (companyId) { params.push(companyId); extra = `AND e.company_id = $2::uuid`; }
  return query<Expense>(
    `${SELECT_JOINED}
      WHERE e.requested_by = $1::uuid AND c.flow_type = 'advance'
        AND e.status IN ('approved','sent_to_accounting','posted','paid')
        AND e.settlement_status <> 'settled' ${extra}
      ORDER BY e.created_at DESC`,
    params
  );
}

/** Validate liên kết quyết toán khi submit (trả lỗi tiếng Việt). */
async function validateSettlementLink(settlement: Expense): Promise<string | null> {
  if (!settlement.advance_id) return null;
  const adv = await getExpenseById(settlement.advance_id);
  if (!adv) return 'Phiếu tạm ứng gốc không tồn tại';
  if (adv.category_flow_type !== 'advance') return 'Phiếu gốc không phải phiếu tạm ứng';
  if (!['approved', 'sent_to_accounting', 'posted', 'paid'].includes(adv.status)) return 'Phiếu tạm ứng chưa được duyệt xong';
  if (adv.settlement_status === 'settled') return 'Phiếu tạm ứng này đã quyết toán xong';
  if (adv.requested_by.toLowerCase() !== settlement.requested_by.toLowerCase()) return 'Chỉ người tạm ứng mới được quyết toán phiếu này';
  if (adv.company_id !== settlement.company_id) return 'Phiếu quyết toán phải cùng công ty với phiếu tạm ứng';
  if ((adv.currency || 'VND').toUpperCase() !== (settlement.currency || 'VND').toUpperCase()) return `Phiếu quyết toán phải cùng tiền tệ với phiếu tạm ứng (${adv.currency})`;
  return null;
}

/** Quyết toán được DUYỆT XONG → phiếu tạm ứng chuyển settled. */
export async function markSettlementSettled(settlementId: string): Promise<void> {
  const e = await getExpenseById(settlementId);
  if (!e?.advance_id) return;
  await execute(`UPDATE expenses SET settlement_status='settled', updated_at=NOW() WHERE id=$1`, [e.advance_id]);
}

/** Quyết toán bị từ chối/thu hồi/hủy → tạm ứng quay về 'none' (nếu không còn quyết toán khác đang chạy). */
export async function revertSettlementPending(settlementId: string): Promise<void> {
  const e = await getExpenseById(settlementId);
  if (!e?.advance_id) return;
  const other = await queryOne(
    `SELECT 1 FROM expenses WHERE advance_id = $1 AND id <> $2 AND status = 'pending_approval' LIMIT 1`,
    [e.advance_id, settlementId]
  );
  if (!other) {
    await execute(
      `UPDATE expenses SET settlement_status='none', updated_at=NOW() WHERE id=$1 AND settlement_status='pending'`,
      [e.advance_id]
    );
  }
}

/**
 * Xác nhận công ty ĐÃ NHẬN tiền hoàn ứng (quyết toán < tạm ứng — không dùng số âm,
 * hệ thống tự hiểu chiều tiền: chênh lệch dương = nhân viên hoàn về công ty).
 */
export async function confirmRefund(settlementId: string, actorId: string): Promise<{ ok: boolean; error?: string }> {
  const e = await getExpenseById(settlementId);
  if (!e) return { ok: false, error: 'Không tìm thấy phiếu' };
  if (!e.advance_id) return { ok: false, error: 'Phiếu này không phải quyết toán tạm ứng' };
  if (!['approved', 'sent_to_accounting', 'posted', 'paid'].includes(e.status)) return { ok: false, error: 'Phiếu quyết toán chưa duyệt xong' };
  if (e.refund_confirmed_at) return { ok: false, error: 'Đã xác nhận hoàn ứng trước đó' };
  const adv = await getExpenseById(e.advance_id);
  if (!adv) return { ok: false, error: 'Phiếu tạm ứng gốc không tồn tại' };
  const diff = Number(adv.amount) - Number(e.amount);
  if (diff <= 0) return { ok: false, error: 'Phiếu này không có tiền hoàn về công ty' };
  await execute(
    `UPDATE expenses SET refund_confirmed_at=NOW(), refund_confirmed_by=$2, updated_at=NOW() WHERE id=$1`,
    [settlementId, actorId]
  );
  auditExpense('refund_confirmed', e, actorId, `đã nhận hoàn ứng ${diff} ${adv.currency || 'VND'}`);
  return { ok: true };
}

// ── Chứng từ đính kèm — "chat là cổng nhập chứng từ" (chat + gallery chung 1 kho) ─

export interface ExpenseAttachment {
  id: string;
  expense_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string | null;
  uploader_name?: string | null;
  created_at: string;
}

export async function listAttachments(expenseId: string): Promise<ExpenseAttachment[]> {
  return query<ExpenseAttachment>(
    `SELECT a.id, a.expense_id, a.file_name, a.mime_type, a.size_bytes, a.uploaded_by, a.created_at,
            u.name AS uploader_name
       FROM expense_attachments a
       LEFT JOIN users u ON u.id = a.uploaded_by
      WHERE a.expense_id = $1 ORDER BY a.created_at`,
    [expenseId]
  );
}

export async function addAttachment(data: {
  expense_id: string; file_name: string; mime_type: string; content: Buffer; uploaded_by: string;
}): Promise<ExpenseAttachment> {
  const id = 'exa_' + crypto.randomBytes(8).toString('hex');
  // Dual-write: có S3 → MinIO (media_id), chưa cấu hình → BYTEA cũ
  const media = await uploadBufferAsMedia({
    buffer: data.content, mimeType: data.mime_type, scope: 'expense_attachments',
    originalName: data.file_name, uploaderId: data.uploaded_by, sourceId: id,
  });
  await execute(
    `INSERT INTO expense_attachments (id, expense_id, file_name, mime_type, size_bytes, content, media_id, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::uuid)`,
    [id, data.expense_id, data.file_name, data.mime_type, data.content.length,
     media ? null : data.content, media?.id ?? null, data.uploaded_by]
  );
  return (await queryOne<ExpenseAttachment>(
    'SELECT id, expense_id, file_name, mime_type, size_bytes, uploaded_by, created_at FROM expense_attachments WHERE id = $1', [id]
  ))!;
}

export async function getAttachmentContent(id: string): Promise<{ expense_id: string; file_name: string; mime_type: string; content: Buffer } | null> {
  const row = await queryOne<{ expense_id: string; file_name: string; mime_type: string; content: Buffer | null; media_id: string | null }>(
    'SELECT expense_id, file_name, mime_type, content, media_id FROM expense_attachments WHERE id = $1', [id]
  );
  if (!row) return null;
  // Dual-read: có media_id → MinIO; không → BYTEA cũ
  if (row.media_id) {
    const m = await getMediaBuffer(row.media_id);
    if (m) return { expense_id: row.expense_id, file_name: row.file_name, mime_type: row.mime_type, content: m.buffer };
  }
  if (!row.content) return null;
  return { expense_id: row.expense_id, file_name: row.file_name, mime_type: row.mime_type, content: row.content };
}

/** Xóa chứng từ: người upload hoặc người tạo phiếu, và chỉ khi phiếu CHƯA duyệt xong. */
export async function deleteAttachment(id: string, callerId: string): Promise<{ ok: boolean; error?: string }> {
  const att = await queryOne<{ expense_id: string; uploaded_by: string | null; media_id: string | null }>(
    'SELECT expense_id, uploaded_by, media_id FROM expense_attachments WHERE id = $1', [id]
  );
  if (!att) return { ok: false, error: 'Không tìm thấy tệp' };
  const e = await getExpenseById(att.expense_id);
  if (!e) return { ok: false, error: 'Không tìm thấy phiếu' };
  const isUploader = att.uploaded_by && String(att.uploaded_by).toLowerCase() === callerId.toLowerCase();
  const isCreator = e.requested_by.toLowerCase() === callerId.toLowerCase();
  if (!isUploader && !isCreator) return { ok: false, error: 'Không có quyền xóa tệp này' };
  if (!['draft', 'pending_approval', 'rejected'].includes(e.status)) {
    return { ok: false, error: 'Phiếu đã duyệt — chứng từ được khóa để giữ hồ sơ' };
  }
  await execute('DELETE FROM expense_attachments WHERE id = $1', [id]);
  // Xoá mềm media kèm theo (best-effort)
  if (att.media_id) {
    try { await softDeleteMedia(att.media_id); } catch { /* nuốt lỗi */ }
  }
  return { ok: true };
}

// ── Thread trao đổi ──────────────────────────────────────────────────────────

export interface ExpenseMessage {
  id: string;
  expense_id: string;
  source: string;
  author_ref: string | null;
  author_name: string;
  body: string;
  attachments: unknown[];
  created_at: string;
}

export async function listMessages(expenseId: string): Promise<ExpenseMessage[]> {
  return query<ExpenseMessage>('SELECT * FROM expense_messages WHERE expense_id = $1 ORDER BY created_at', [expenseId]);
}

export async function addMessage(data: {
  expense_id: string; source?: string; author_ref?: string | null; author_name: string;
  body: string; attachments?: unknown[]; client_msg_id?: string | null;
}): Promise<ExpenseMessage | null> {
  return queryOne<ExpenseMessage>(
    `INSERT INTO expense_messages (id, expense_id, source, author_ref, author_name, body, attachments, client_msg_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (expense_id, client_msg_id) DO NOTHING
     RETURNING *`,
    ['exm_' + crypto.randomBytes(8).toString('hex'), data.expense_id, data.source || 'assetflow',
     data.author_ref ?? null, data.author_name, data.body, JSON.stringify(data.attachments ?? []),
     data.client_msg_id ?? crypto.randomBytes(8).toString('hex')]
  );
}
