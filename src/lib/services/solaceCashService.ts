/**
 * solaceCashService — Sổ Quỹ Solace (tiền mặt "két" + ngân hàng).
 * Mỗi khoản Thu/Chi ghi 1 dòng vào solace_cash_txns. Số dư = SUM(in) - SUM(out)/account.
 * Một số khoản được POST TỰ ĐỘNG (bán hàng, nạp ví, trả nợ, hoàn tiền, mua nguyên liệu);
 * còn lại nhập tay (chi phí, chuyển quỹ, kiểm quỹ, số dư đầu kỳ). Tiền BIGINT đồng VND.
 */
import type { PoolClient } from 'pg';
import { query, queryOne } from '@/lib/db';
import { logActivity } from '@/lib/services/auditService';

export type CashAccount = 'cash' | 'bank';
export type CashDirection = 'in' | 'out';
export type CashCategory =
  | 'opening' | 'sale' | 'topup' | 'debt_payment' | 'purchase'
  | 'expense' | 'refund' | 'transfer' | 'adjust';

export interface CashTxn {
  id: string; account: CashAccount; direction: CashDirection; amount: number;
  category: CashCategory; ref_type: string | null; ref_id: string | null;
  note: string | null; business_date: string | null; created_by: string | null; created_at: string;
}

function genId(): string {
  return `scash_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Ngày kinh doanh hôm nay theo giờ VN (YYYY-MM-DD). */
export function vnBusinessDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

export interface PostCashInput {
  account: CashAccount; direction: CashDirection; amount: number; category: CashCategory;
  refType?: string | null; refId?: string | null; note?: string | null;
  businessDate?: string | null; actor?: string | null;
}

/**
 * Ghi 1 dòng quỹ. Truyền `client` để chạy trong transaction sẵn có (vd huỷ đơn → hoàn tiền).
 * amount phải > 0 (không ghi nếu 0/âm — tránh rác).
 */
export async function postCashTxn(input: PostCashInput, client?: PoolClient): Promise<void> {
  const amt = Math.round(input.amount);
  if (!(amt > 0)) return;
  const sql = `INSERT INTO solace_cash_txns
      (id, account, direction, amount, category, ref_type, ref_id, note, business_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`;
  const args = [genId(), input.account, input.direction, amt, input.category,
    input.refType ?? null, input.refId ?? null, input.note ?? null,
    input.businessDate ?? vnBusinessDate(), input.actor ?? null];
  if (client) await client.query(sql, args);
  else await query(sql, args);
}

/** Số dư hiện tại từng quỹ (cash, bank). */
export async function getBalances(): Promise<{ cash: number; bank: number }> {
  const rows = await query<{ account: string; balance: string }>(
    `SELECT account, COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0)::bigint AS balance
       FROM solace_cash_txns GROUP BY account`
  );
  const m = new Map(rows.map(r => [r.account, Number(r.balance)]));
  return { cash: m.get('cash') ?? 0, bank: m.get('bank') ?? 0 };
}

export interface ListCashFilter { businessDate?: string; account?: CashAccount; category?: CashCategory; limit?: number; }

export async function listCashTxns(f: ListCashFilter = {}): Promise<CashTxn[]> {
  const conds: string[] = []; const params: unknown[] = []; let i = 1;
  if (f.businessDate) { conds.push(`business_date = $${i++}`); params.push(f.businessDate); }
  if (f.account) { conds.push(`account = $${i++}`); params.push(f.account); }
  if (f.category) { conds.push(`category = $${i++}`); params.push(f.category); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  params.push(Math.min(f.limit ?? 100, 300));
  return query<CashTxn>(
    `SELECT id, account, direction, amount, category, ref_type, ref_id, note, business_date, created_by, created_at
       FROM solace_cash_txns ${where} ORDER BY created_at DESC LIMIT $${i}`, params
  );
}

/** Đã đặt số dư đầu kỳ cho quỹ chưa? */
export async function hasOpening(account: CashAccount): Promise<boolean> {
  const r = await queryOne<{ n: string }>(
    `SELECT COUNT(*)::int AS n FROM solace_cash_txns WHERE account = $1 AND category = 'opening'`, [account]
  );
  return Number(r?.n ?? 0) > 0;
}

/** Đặt số dư đầu kỳ (chỉ 1 lần/quỹ; muốn sửa sau dùng Kiểm quỹ). amount >= 0. */
export async function setOpening(account: CashAccount, amount: number, actor: string | null): Promise<void> {
  if (await hasOpening(account)) throw new Error('Quỹ này đã có số dư đầu kỳ — dùng "Kiểm quỹ" để điều chỉnh');
  const amt = Math.round(amount);
  if (amt < 0) throw new Error('Số dư đầu kỳ không hợp lệ');
  await postCashTxn({ account, direction: 'in', amount: amt, category: 'opening', note: 'Số dư đầu kỳ', actor });
  void logActivity({ action: 'solace_cash_opening', details: `Số dư đầu kỳ ${account}: ${amt}đ`, performedBy: actor ?? 'System' }).catch(() => {});
}

/** Thu/Chi nhập tay (chi phí, thu khác...). */
export async function recordManual(input: {
  account: CashAccount; direction: CashDirection; amount: number; category: CashCategory; note: string | null; actor: string | null;
}): Promise<void> {
  if (!(Math.round(input.amount) > 0)) throw new Error('Số tiền không hợp lệ');
  await postCashTxn(input);
  void logActivity({ action: 'solace_cash_manual', details: `${input.direction === 'in' ? 'Thu' : 'Chi'} ${input.account}: ${Math.round(input.amount)}đ (${input.category})`, performedBy: input.actor ?? 'System' }).catch(() => {});
}

/** Chuyển quỹ giữa két ↔ ngân hàng (vd nộp tiền mặt vào ngân hàng). */
export async function transferCash(from: CashAccount, to: CashAccount, amount: number, note: string | null, actor: string | null): Promise<void> {
  if (from === to) throw new Error('Hai quỹ phải khác nhau');
  if (!(Math.round(amount) > 0)) throw new Error('Số tiền không hợp lệ');
  const n = note ?? `Chuyển quỹ ${from} → ${to}`;
  await postCashTxn({ account: from, direction: 'out', amount, category: 'transfer', note: n, actor });
  await postCashTxn({ account: to, direction: 'in', amount, category: 'transfer', note: n, actor });
  void logActivity({ action: 'solace_cash_transfer', details: `Chuyển ${Math.round(amount)}đ ${from}→${to}`, performedBy: actor ?? 'System' }).catch(() => {});
}

/**
 * Xoá 1 dòng sổ quỹ (số dư tự tính lại theo các dòng còn lại).
 * Lưu ý: chỉ gỡ khỏi sổ quỹ — KHÔNG đảo nghiệp vụ gốc (đơn hàng/ví/nợ) nếu là khoản tự sinh.
 */
export async function deleteCashTxn(id: string, actor: string | null): Promise<void> {
  const row = await queryOne<{ account: string; direction: string; amount: number; category: string; note: string | null }>(
    `SELECT account, direction, amount, category, note FROM solace_cash_txns WHERE id = $1`, [id]
  );
  if (!row) throw new Error('Không tìm thấy giao dịch quỹ');
  await query(`DELETE FROM solace_cash_txns WHERE id = $1`, [id]);
  void logActivity({
    action: 'solace_cash_deleted',
    details: `Xoá khoản quỹ ${row.account} · ${row.category} · ${row.direction === 'in' ? '+' : '-'}${row.amount}đ${row.note ? ` (${row.note})` : ''}`,
    performedBy: actor ?? 'System',
  }).catch(() => {});
}

/** Kiểm quỹ: nhập số thực đếm được → ghi chênh lệch (adjust) để khớp số dư. */
export async function adjustToCounted(account: CashAccount, counted: number, note: string | null, actor: string | null): Promise<void> {
  const bal = (await getBalances())[account];
  const diff = Math.round(counted) - bal;
  if (diff === 0) return;
  await postCashTxn({
    account, direction: diff > 0 ? 'in' : 'out', amount: Math.abs(diff), category: 'adjust',
    note: note ?? `Kiểm quỹ: lệch ${diff > 0 ? '+' : ''}${diff}đ`, actor,
  });
  void logActivity({ action: 'solace_cash_adjust', details: `Kiểm quỹ ${account}: lệch ${diff}đ`, performedBy: actor ?? 'System' }).catch(() => {});
}
