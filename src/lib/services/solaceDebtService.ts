/**
 * solaceDebtService — Công nợ Solace: sổ nợ theo người + trả nợ (từng phần, ví/tiền mặt).
 * "Nợ" = tổng (total - paid_amount) các đơn chưa thanh toán đủ (không tính đã huỷ).
 * Tiền BIGINT đồng VND.
 */
import { query, queryOne, withTransaction } from '@/lib/db';
import { logActivity } from '@/lib/services/auditService';
import { notify } from '@/lib/notifications/engine';
import { formatVND } from '@/lib/format';
import { postCashTxn } from '@/lib/services/solaceCashService';

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export interface Debtor {
  user_id: string; name: string | null; email: string | null;
  total_debt: number; order_count: number; oldest_at: string;
}

/** Danh sách thành viên còn nợ (outstanding > 0), nợ nhiều/cũ lên trước. */
export async function getDebtors(): Promise<Debtor[]> {
  return query<Debtor>(
    `SELECT o.customer_user_id AS user_id, u.name, u.email,
            COALESCE(SUM(o.total - o.paid_amount), 0)::bigint AS total_debt,
            COUNT(*)::int AS order_count,
            MIN(o.created_at) AS oldest_at
       FROM solace_orders o
       LEFT JOIN users u ON u.id::text = o.customer_user_id
      WHERE o.customer_user_id IS NOT NULL AND o.status <> 'cancelled' AND o.payment_status <> 'paid'
      GROUP BY o.customer_user_id, u.name, u.email
     HAVING COALESCE(SUM(o.total - o.paid_amount), 0) > 0
      ORDER BY total_debt DESC, oldest_at ASC`
  );
}

export interface DebtOrder {
  id: string; code: string | null; total: number; paid_amount: number; due: number;
  payment_status: string; payment_method: string | null; status: string; created_at: string;
}

/** Chi tiết nợ của 1 thành viên: các đơn chưa trả đủ + tổng nợ. */
export async function getMemberDebt(userId: string): Promise<{ orders: DebtOrder[]; total: number; name: string | null }> {
  const u = await queryOne<{ name: string | null }>(`SELECT name FROM users WHERE id::text = $1`, [userId]);
  const orders = await query<DebtOrder>(
    `SELECT id, code, total, paid_amount, (total - paid_amount) AS due,
            payment_status, payment_method, status, created_at
       FROM solace_orders
      WHERE customer_user_id = $1 AND status <> 'cancelled' AND payment_status <> 'paid'
      ORDER BY created_at ASC`,
    [userId]
  );
  const total = orders.reduce((s, o) => s + Number(o.due), 0);
  return { orders, total, name: u?.name ?? null };
}

export interface SettleResult {
  code: string | null; userId: string | null; amountApplied: number; fullyPaid: boolean; debtAfter: number;
}

/**
 * Trả nợ 1 đơn (từng phần hoặc hết) bằng ví hoặc tiền mặt.
 * Ví → trừ số dư (kiểm đủ). Cập nhật paid_amount; đủ → payment_status='paid'.
 */
export async function settleOrder(
  orderId: string, amount: number, method: 'wallet' | 'cash', actor: string | null
): Promise<SettleResult> {
  let result: SettleResult = { code: null, userId: null, amountApplied: 0, fullyPaid: false, debtAfter: 0 };

  await withTransaction(async (client) => {
    const o = await client.query<{ code: string; total: string; paid_amount: string; status: string; payment_status: string; customer_user_id: string | null; payment_method: string | null; business_date: string | null }>(
      `SELECT code, total, paid_amount, status, payment_status, customer_user_id, payment_method, business_date FROM solace_orders WHERE id = $1 FOR UPDATE`, [orderId]
    );
    if (o.rowCount === 0) throw new Error('Không tìm thấy đơn');
    const ord = o.rows[0];
    if (ord.status === 'cancelled') throw new Error('Đơn đã huỷ');
    if (ord.payment_status === 'paid') throw new Error('Đơn đã thanh toán đủ');
    const due = Number(ord.total) - Number(ord.paid_amount);
    const amt = Math.min(Math.round(amount), due);
    if (!(amt > 0)) throw new Error('Số tiền trả không hợp lệ');

    if (method === 'wallet') {
      const wid = ord.customer_user_id;
      if (!wid) throw new Error('Đơn không gắn thành viên — không thể trừ ví');
      await client.query(`INSERT INTO solace_wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [wid]);
      const w = await client.query<{ balance: string }>(`SELECT balance FROM solace_wallets WHERE user_id = $1 FOR UPDATE`, [wid]);
      const bal = Number(w.rows[0].balance);
      if (bal < amt) throw new Error('Số dư ví không đủ');
      const newBal = bal - amt;
      await client.query(`UPDATE solace_wallets SET balance = $2, total_spent = total_spent + $3, updated_at = NOW() WHERE user_id = $1`, [wid, newBal, amt]);
      await client.query(
        `INSERT INTO solace_wallet_txns (id, user_id, type, amount, balance_after, method, ref_order_id, note, performed_by)
         VALUES ($1,$2,'payment',$3,$4,'wallet',$5,$6,$7)`,
        [genId('swtx'), wid, -amt, newBal, orderId, `Trả nợ đơn ${ord.code}`, actor]
      );
    } else {
      await postCashTxn({
        account: 'cash', direction: 'in', amount: amt, category: 'debt_payment',
        refType: 'order', refId: orderId, note: `Thu tiền đơn ${ord.code} (một phần)`, businessDate: ord.business_date, actor,
      }, client);
    }

    const newPaid = Number(ord.paid_amount) + amt;
    const fully = newPaid >= Number(ord.total);
    const nextMethod = Number(ord.paid_amount) > 0 && ord.payment_method && ord.payment_method !== method ? 'mixed' : method;
    await client.query(
      `UPDATE solace_orders
          SET paid_amount = $2, payment_method = $3,
              payment_status = CASE WHEN $4 THEN 'paid' WHEN $2 > 0 THEN 'partial' ELSE payment_status END,
              paid_at = CASE WHEN $4 THEN NOW() ELSE paid_at END
        WHERE id = $1`,
      [orderId, newPaid, nextMethod, fully]
    );
    result = { code: ord.code, userId: ord.customer_user_id, amountApplied: amt, fullyPaid: fully, debtAfter: 0 };
  });

  // Tổng nợ còn lại của thành viên sau khi trả.
  if (result.userId) {
    const r = await queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(total - paid_amount), 0)::bigint AS total
         FROM solace_orders WHERE customer_user_id = $1 AND status <> 'cancelled' AND payment_status <> 'paid'`,
      [result.userId]
    );
    result.debtAfter = Number(r?.total ?? 0);
  }
  void logActivity({ action: 'solace_debt_settled', details: `Trả nợ đơn ${result.code}: ${result.amountApplied}đ (${method})`, performedBy: actor ?? 'System' }).catch(() => {});

  // Thông báo cho thành viên: đã nhận thanh toán; nếu hết nợ → tất toán.
  if (result.userId) {
    await notify('solace.payment_confirmed', {
      code: result.code ?? '', amount: formatVND(result.amountApplied), method: method === 'wallet' ? 'Ví' : 'Tiền mặt',
    }, { recipients: [result.userId], relatedId: orderId }).catch(() => {});
    if (result.debtAfter === 0) {
      await notify('solace.debt_settled', {}, { recipients: [result.userId], relatedId: orderId }).catch(() => {});
    }
  }
  return result;
}
