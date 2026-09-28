/**
 * solaceWalletService — Ví tín dụng nội bộ SOLACE.
 * Mọi thay đổi số dư đi qua transaction + SELECT ... FOR UPDATE (chống tương tranh).
 * Tiền BIGINT đồng VND. amount trong sổ giao dịch có dấu (+ nạp/hoàn, - thanh toán).
 */
import { query, queryOne, withTransaction } from '@/lib/db';
import { logActivity } from '@/lib/services/auditService';
import { notify } from '@/lib/notifications/engine';
import { formatVND } from '@/lib/format';
import { getWalletConfig } from '@/lib/services/solaceSettingsService';
import { postCashTxn } from '@/lib/services/solaceCashService';
import { solaceUnitUserIds } from '@/lib/services/solacePermissionService';

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** ID người duyệt được nạp ví: super_admin hoặc ĐƯỢC GÁN quyền 'solace-wallet' (edit). */
async function walletManagerIds(): Promise<string[]> {
  return solaceUnitUserIds('solace-wallet', 'edit');
}

export interface SolaceWallet {
  user_id: string; balance: number; total_topup: number; total_spent: number;
  name?: string; email?: string;
}
export interface WalletTxn {
  id: string; user_id: string; type: string; amount: number; balance_after: number;
  method: string | null; ref_order_id: string | null; note: string | null;
  performed_by: string | null; created_at: string;
}

/**
 * Cộng credit nội bộ vào ví (không tính là tiền mới nạp từ ngoài).
 * Dùng cho các tình huống bù trừ nội bộ như: đơn bị quán từ chối nhưng giữ tiền cho lần mua sau.
 */
export async function creditWalletTx(
  client: import('pg').PoolClient, userId: string, amount: number, refOrderId: string | null, note: string | null, actor: string | null
): Promise<void> {
  const amt = Math.round(amount);
  if (!(amt > 0)) return;
  await client.query(`INSERT INTO solace_wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [userId]);
  const w = await client.query<{ balance: string }>(`SELECT balance FROM solace_wallets WHERE user_id = $1 FOR UPDATE`, [userId]);
  const newBal = Number(w.rows[0].balance) + amt;
  await client.query(
    `UPDATE solace_wallets SET balance = $2, updated_at = NOW() WHERE user_id = $1`,
    [userId, newBal]
  );
  await client.query(
    `INSERT INTO solace_wallet_txns (id, user_id, type, amount, balance_after, method, ref_order_id, note, performed_by)
     VALUES ($1,$2,'credit',$3,$4,'wallet',$5,$6,$7)`,
    [genId('swtx'), userId, amt, newBal, refOrderId, note, actor]
  );
}

/** Lấy ví (tự tạo nếu chưa có). */
export async function getOrCreateWallet(userId: string): Promise<SolaceWallet> {
  await query(`INSERT INTO solace_wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [userId]);
  return (await queryOne<SolaceWallet>(
    `SELECT w.user_id, w.balance, w.total_topup, w.total_spent, u.name, u.email
       FROM solace_wallets w LEFT JOIN users u ON u.id::text = w.user_id
      WHERE w.user_id = $1`, [userId]
  ))!;
}

export async function listTxns(userId: string, limit = 50): Promise<WalletTxn[]> {
  return query<WalletTxn>(
    `SELECT id, user_id, type, amount, balance_after, method, ref_order_id, note, performed_by, created_at
       FROM solace_wallet_txns WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, Math.min(limit, 200)]
  );
}

/** Nạp tiền vào ví (cộng số dư). amount > 0. */
export async function topUp(
  userId: string, amount: number, method: 'cash' | 'transfer', note: string | null, actor: string | null
): Promise<SolaceWallet> {
  const amt = Math.round(amount);
  if (!(amt > 0)) throw new Error('Số tiền nạp không hợp lệ');
  await getOrCreateWallet(userId);
  await withTransaction(async (client) => {
    const cur = await client.query<{ balance: string }>(`SELECT balance FROM solace_wallets WHERE user_id = $1 FOR UPDATE`, [userId]);
    const newBal = Number(cur.rows[0].balance) + amt;
    await client.query(
      `UPDATE solace_wallets SET balance = $2, total_topup = total_topup + $3, updated_at = NOW() WHERE user_id = $1`,
      [userId, newBal, amt]
    );
    await client.query(
      `INSERT INTO solace_wallet_txns (id, user_id, type, amount, balance_after, method, note, performed_by)
       VALUES ($1,$2,'topup',$3,$4,$5,$6,$7)`,
      [genId('swtx'), userId, amt, newBal, method, note, actor]
    );
  });
  void logActivity({ action: 'solace_wallet_topup', details: `Nạp ví ${userId}: +${amt}đ (${method})`, performedBy: actor ?? 'System' }).catch(() => {});
  // Sổ Quỹ: tiền nạp ví đi vào két (tiền mặt) hoặc ngân hàng (chuyển khoản).
  await postCashTxn({
    account: method === 'cash' ? 'cash' : 'bank', direction: 'in', amount: amt, category: 'topup',
    refType: 'wallet', refId: userId, note: 'Nạp ví khách', actor,
  }).catch(() => {});
  return getOrCreateWallet(userId);
}

/** Điều chỉnh ví thủ công (admin). amount có dấu. */
export async function adjustWallet(userId: string, amount: number, note: string | null, actor: string | null): Promise<SolaceWallet> {
  const amt = Math.round(amount);
  if (amt === 0) throw new Error('Số tiền điều chỉnh không hợp lệ');
  await getOrCreateWallet(userId);
  await withTransaction(async (client) => {
    const cur = await client.query<{ balance: string }>(`SELECT balance FROM solace_wallets WHERE user_id = $1 FOR UPDATE`, [userId]);
    const newBal = Number(cur.rows[0].balance) + amt;
    if (newBal < 0) throw new Error('Số dư sau điều chỉnh không được âm');
    await client.query(`UPDATE solace_wallets SET balance = $2, updated_at = NOW() WHERE user_id = $1`, [userId, newBal]);
    await client.query(
      `INSERT INTO solace_wallet_txns (id, user_id, type, amount, balance_after, note, performed_by)
       VALUES ($1,$2,'adjust',$3,$4,$5,$6)`,
      [genId('swtx'), userId, amt, newBal, note, actor]
    );
  });
  void logActivity({ action: 'solace_wallet_adjust', details: `Điều chỉnh ví ${userId}: ${amt}đ`, performedBy: actor ?? 'System' }).catch(() => {});
  return getOrCreateWallet(userId);
}

/**
 * Thanh toán 1 đơn bằng ví của khách (đơn phải gắn customer_user_id).
 * Trừ số dư an toàn tương tranh; cập nhật đơn sang đã thanh toán (method='wallet').
 */
export async function payOrderWithWallet(orderId: string, userId: string | null, actor: string | null): Promise<void> {
  let paidInfo: { wid: string; total: number; balance: number; oldBalance: number; code: string } | null = null;
  await withTransaction(async (client) => {
    const o = await client.query<{ total: string; payment_status: string; status: string; customer_user_id: string | null; code: string }>(
      `SELECT total, payment_status, status, customer_user_id, code FROM solace_orders WHERE id = $1 FOR UPDATE`, [orderId]
    );
    if (o.rowCount === 0) throw new Error('Không tìm thấy đơn');
    const order = o.rows[0];
    if (order.status === 'cancelled') throw new Error('Đơn đã huỷ');
    if (order.payment_status === 'paid') throw new Error('Đơn đã thanh toán');
    const wid = userId ?? order.customer_user_id;
    if (!wid) throw new Error('Cần chọn thành viên để trừ ví');
    const total = Number(order.total);

    await client.query(`INSERT INTO solace_wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [wid]);
    const w = await client.query<{ balance: string }>(`SELECT balance FROM solace_wallets WHERE user_id = $1 FOR UPDATE`, [wid]);
    const bal = Number(w.rows[0].balance);
    if (bal < total) throw new Error('Số dư ví không đủ');
    const newBal = bal - total;
    await client.query(
      `UPDATE solace_wallets SET balance = $2, total_spent = total_spent + $3, updated_at = NOW() WHERE user_id = $1`,
      [wid, newBal, total]
    );
    await client.query(
      `INSERT INTO solace_wallet_txns (id, user_id, type, amount, balance_after, method, ref_order_id, note, performed_by)
       VALUES ($1,$2,'payment',$3,$4,'wallet',$5,$6,$7)`,
      [genId('swtx'), wid, -total, newBal, orderId, `Thanh toán đơn ${order.code}`, actor]
    );
    await client.query(
      `UPDATE solace_orders SET payment_status = 'paid', payment_method = 'wallet', paid_amount = total,
              customer_user_id = COALESCE(customer_user_id, $2), paid_at = NOW() WHERE id = $1`,
      [orderId, wid]
    );
    paidInfo = { wid, total, balance: newBal, oldBalance: bal, code: order.code };
  });
  void logActivity({ action: 'solace_order_paid', details: `Thanh toán đơn (${orderId}) bằng ví`, performedBy: actor ?? 'System' }).catch(() => {});

  // Biên lai trừ ví (#5) — gửi cho chủ ví kèm món + số dư còn lại.
  if (paidInfo) {
    const p = paidInfo as { wid: string; total: number; balance: number; oldBalance: number; code: string };
    const items = await query<{ name_snapshot: string; qty: number }>(
      `SELECT name_snapshot, qty FROM solace_order_items WHERE order_id = $1`, [orderId]
    );
    const itemsStr = items.map(i => `${i.qty}× ${i.name_snapshot}`).join(', ') || '—';
    await notify('solace.wallet_payment', {
      code: p.code, items: itemsStr, amount: formatVND(p.total), balance: formatVND(p.balance),
    }, { recipients: [p.wid], relatedId: orderId }).catch(() => {});

    // Cảnh báo số dư thấp (#10) — chỉ khi VỪA tụt xuống dưới ngưỡng (tránh báo lặp).
    const th = (await getWalletConfig()).lowBalanceThreshold;
    if (th > 0 && p.oldBalance >= th && p.balance < th) {
      await notify('solace.wallet_low', { balance: formatVND(p.balance), threshold: formatVND(th) },
        { recipients: [p.wid], relatedId: orderId }).catch(() => {});
    }
  }
}

/**
 * Hoàn tiền vào ví TRONG một transaction sẵn có (dùng khi huỷ đơn đã trả bằng ví).
 * Cộng lại số dư + ghi txn 'refund'. amount > 0.
 */
export async function refundWalletTx(
  client: import('pg').PoolClient, userId: string, amount: number, refOrderId: string | null, note: string | null, actor: string | null
): Promise<void> {
  const amt = Math.round(amount);
  if (!(amt > 0)) return;
  await client.query(`INSERT INTO solace_wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [userId]);
  const w = await client.query<{ balance: string }>(`SELECT balance FROM solace_wallets WHERE user_id = $1 FOR UPDATE`, [userId]);
  const newBal = Number(w.rows[0].balance) + amt;
  await client.query(
    `UPDATE solace_wallets SET balance = $2, total_spent = GREATEST(0, total_spent - $3), updated_at = NOW() WHERE user_id = $1`,
    [userId, newBal, amt]
  );
  await client.query(
    `INSERT INTO solace_wallet_txns (id, user_id, type, amount, balance_after, method, ref_order_id, note, performed_by)
     VALUES ($1,$2,'refund',$3,$4,'wallet',$5,$6,$7)`,
    [genId('swtx'), userId, amt, newBal, refOrderId, note, actor]
  );
}

// ─── YÊU CẦU NẠP TIỀN ────────────────────────────────────────────────────────
export interface TopupRequest {
  id: string; user_id: string; amount: number; method: string; status: string;
  note: string | null; requested_by: string | null; approved_by: string | null;
  created_at: string; processed_at: string | null; name?: string; email?: string;
}

export async function createTopupRequest(
  userId: string, amount: number, method: 'cash' | 'transfer', note: string | null, requestedBy: string | null
): Promise<TopupRequest> {
  const amt = Math.round(amount);
  if (!(amt > 0)) throw new Error('Số tiền nạp không hợp lệ');
  const id = genId('stop');
  await query(
    `INSERT INTO solace_topup_requests (id, user_id, amount, method, note, requested_by) VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, userId, amt, method, note, requestedBy]
  );
  // Báo người quản lý ví có yêu cầu nạp mới.
  const u = await queryOne<{ name: string }>(`SELECT name FROM users WHERE id::text = $1`, [userId]);
  const managers = await walletManagerIds();
  if (managers.length > 0) {
    await notify('solace.topup_request', {
      name: u?.name ?? 'Thành viên', amount: formatVND(amt), method: method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản',
    }, { recipients: managers, relatedId: id }).catch(() => {});
  }
  return (await queryOne<TopupRequest>(`SELECT * FROM solace_topup_requests WHERE id = $1`, [id]))!;
}

export async function listTopupRequests(status?: string): Promise<TopupRequest[]> {
  const where = status ? `WHERE r.status = $1` : '';
  const params = status ? [status] : [];
  return query<TopupRequest>(
    `SELECT r.*, u.name, u.email FROM solace_topup_requests r
       LEFT JOIN users u ON u.id::text = r.user_id ${where}
      ORDER BY r.created_at DESC LIMIT 100`, params
  );
}

export async function approveTopupRequest(id: string, actor: string | null): Promise<void> {
  const req = await queryOne<{ user_id: string; amount: number; method: string; status: string; note: string | null }>(
    `SELECT user_id, amount, method, status, note FROM solace_topup_requests WHERE id = $1`, [id]
  );
  if (!req) throw new Error('Không tìm thấy yêu cầu');
  if (req.status !== 'pending') throw new Error('Yêu cầu đã được xử lý');
  const w = await topUp(req.user_id, Number(req.amount), req.method === 'cash' ? 'cash' : 'transfer', req.note ?? 'Nạp qua yêu cầu', actor);
  await query(`UPDATE solace_topup_requests SET status = 'approved', approved_by = $2, processed_at = NOW() WHERE id = $1`, [id, actor]);
  // Báo khách ví đã được cộng.
  await notify('solace.topup_approved', {
    amount: formatVND(Number(req.amount)), balance: formatVND(w.balance),
  }, { recipients: [req.user_id], relatedId: id }).catch(() => {});
}

export async function rejectTopupRequest(id: string, actor: string | null): Promise<void> {
  const req = await queryOne<{ user_id: string; amount: number; status: string }>(
    `SELECT user_id, amount, status FROM solace_topup_requests WHERE id = $1`, [id]
  );
  if (!req || req.status !== 'pending') return;
  await query(
    `UPDATE solace_topup_requests SET status = 'rejected', approved_by = $2, processed_at = NOW()
      WHERE id = $1 AND status = 'pending'`, [id, actor]
  );
  await notify('solace.topup_rejected', { amount: formatVND(Number(req.amount)) },
    { recipients: [req.user_id], relatedId: id }).catch(() => {});
}
