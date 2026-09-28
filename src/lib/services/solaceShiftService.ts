/**
 * solaceShiftService — Kết ca quán SOLACE.
 * Tổng hợp đơn theo ngày kinh doanh (giờ VN), chốt snapshot (upsert theo ngày),
 * và phát thông báo Telegram/in-app cho người nhận cấu hình ("shiftClose").
 */
import { query, queryOne, execute } from '@/lib/db';
import { logActivity } from '@/lib/services/auditService';
import { notify } from '@/lib/notifications/engine';
import { getRecipientsConfig, getSalesShifts } from '@/lib/services/solaceSettingsService';
import { solaceUnitUserIds } from '@/lib/services/solacePermissionService';
import { suggestSalesShiftId } from '@/lib/config/solaceConfig';
import { formatVND } from '@/lib/format';

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export interface ShiftSummary {
  business_date: string;
  total_orders: number;
  total_revenue: number;   // đã thu (paid)
  cash_total: number;
  bankqr_total: number;
  wallet_total: number;
  unpaid_total: number;    // còn nợ/chưa thu
}

/** Ngày kinh doanh hôm nay (giờ VN). */
export async function todayBusinessDate(): Promise<string> {
  const r = await queryOne<{ d: string }>(
    `SELECT to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS d`);
  return r?.d ?? '1970-01-01';
}

// ─── Phiên ca (mở/đóng + quỹ đầu ca) ─────────────────────────────────────────

export interface SolaceShift {
  id: string;
  business_date: string;
  status: 'open' | 'closed';
  shift_type: string | null;
  shift_label: string | null;
  opened_by: string | null;
  opened_by_name?: string | null;
  opened_at: string;
  opening_float: number;
  closed_by: string | null;
  closed_at: string | null;
  total_orders: number;
  total_revenue: number;
  cash_total: number;
  bankqr_total: number;
  wallet_total: number;
  unpaid_total: number;
  expected_cash: number;
  cash_counted: number | null;
  variance: number;
  note: string | null;
}

/** Ca đang mở (nếu có) — kèm tên người mở. */
export async function getActiveShift(): Promise<SolaceShift | null> {
  const s = await queryOne<SolaceShift>(
    `SELECT s.*, u.name AS opened_by_name
       FROM solace_shifts s LEFT JOIN users u ON u.id::text = s.opened_by
      WHERE s.status = 'open' LIMIT 1`
  );
  return s ? normalizeShift(s) : null;
}

/** Quỹ đầu ca gợi ý = tiền mặt thực tế đếm ở ca đóng gần nhất (nếu có). */
export async function suggestOpeningFloat(): Promise<number> {
  const r = await queryOne<{ cash_counted: number | null }>(
    `SELECT cash_counted FROM solace_shifts WHERE status = 'closed'
      ORDER BY closed_at DESC NULLS LAST LIMIT 1`
  );
  return Number(r?.cash_counted ?? 0);
}

/** Mở ca mới. Lỗi nếu đã có ca đang mở. Loại ca (Sáng/Chiều): tự suy theo giờ nếu không truyền. */
export async function openShift(opts: {
  openingFloat?: number | null; actor?: string | null; shiftType?: string | null; shiftLabel?: string | null;
}): Promise<SolaceShift> {
  const existing = await getActiveShift();
  if (existing) throw new Error('Đã có ca đang mở — vui lòng kết ca hiện tại trước khi mở ca mới.');
  const businessDate = await todayBusinessDate();
  const id = genId('shift');
  const openingFloat = Math.max(0, Math.round(Number(opts.openingFloat ?? 0)) || 0);

  // Chuẩn hoá loại ca theo cấu hình ca bán hàng; tự gợi ý theo giờ nếu thiếu.
  const salesShifts = await getSalesShifts();
  const nowHHMM = await vnTimeHHMM();
  const typeId = opts.shiftType || suggestSalesShiftId(salesShifts, nowHHMM);
  const def = salesShifts.find(s => s.id === typeId) ?? null;
  const shiftType = def?.id ?? null;
  const shiftLabel = opts.shiftLabel || def?.label || null;

  await execute(
    `INSERT INTO solace_shifts (id, business_date, status, shift_type, shift_label, opened_by, opening_float, updated_at)
     VALUES ($1, $2, 'open', $3, $4, $5, $6, NOW())`,
    [id, businessDate, shiftType, shiftLabel, opts.actor ?? null, openingFloat]
  );
  void logActivity({ action: 'solace_shift_opened', details: `Mở ${shiftLabel ?? 'ca'} ${businessDate} · quỹ đầu ${openingFloat}đ`, performedBy: opts.actor ?? 'System' }).catch(() => {});
  return (await getActiveShift())!;
}

/** Giờ "HH:MM" hiện tại theo giờ VN. */
async function vnTimeHHMM(): Promise<string> {
  const r = await queryOne<{ t: string }>(
    `SELECT to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI') AS t`);
  return r?.t ?? '00:00';
}

/** Tổng hợp số liệu các đơn thuộc 1 ca (theo shift_id). */
export async function summarizeShift(shiftId: string): Promise<ShiftSummary> {
  const [r, cashFlow, walletFlow] = await Promise.all([
    queryOne<ShiftSummary & Record<string, number>>(
    `SELECT
        COUNT(*)::int AS total_orders,
        COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN paid_amount ELSE 0 END), 0)::bigint AS total_revenue,
        COALESCE(SUM(CASE WHEN payment_status <> 'paid' THEN total - paid_amount ELSE 0 END), 0)::bigint AS unpaid_total
       FROM solace_orders
      WHERE shift_id = $1 AND status <> 'cancelled'`,
    [shiftId]
    ),
    queryOne<{ cash_total: number; bankqr_total: number }>(
      `SELECT
          COALESCE(SUM(CASE WHEN account = 'cash' THEN CASE WHEN direction='in' THEN amount ELSE -amount END ELSE 0 END), 0)::bigint AS cash_total,
          COALESCE(SUM(CASE WHEN account = 'bank' THEN CASE WHEN direction='in' THEN amount ELSE -amount END ELSE 0 END), 0)::bigint AS bankqr_total
         FROM solace_cash_txns
        WHERE ref_type = 'order'
          AND ref_id IN (SELECT id FROM solace_orders WHERE shift_id = $1)`,
      [shiftId]
    ),
    queryOne<{ wallet_total: number }>(
      `SELECT COALESCE(SUM(CASE WHEN type = 'payment' THEN -amount ELSE 0 END), 0)::bigint AS wallet_total
         FROM solace_wallet_txns
        WHERE ref_order_id IN (SELECT id FROM solace_orders WHERE shift_id = $1)`,
      [shiftId]
    ),
  ]);
  return {
    business_date: '',
    total_orders: r?.total_orders ?? 0,
    total_revenue: Number(r?.total_revenue ?? 0),
    cash_total: Number(cashFlow?.cash_total ?? 0),
    bankqr_total: Number(cashFlow?.bankqr_total ?? 0),
    wallet_total: Number(walletFlow?.wallet_total ?? 0),
    unpaid_total: Number(r?.unpaid_total ?? 0),
  };
}

function normalizeShift(s: SolaceShift): SolaceShift {
  return {
    ...s,
    opening_float: Number(s.opening_float ?? 0),
    total_orders: Number(s.total_orders ?? 0),
    total_revenue: Number(s.total_revenue ?? 0),
    cash_total: Number(s.cash_total ?? 0),
    bankqr_total: Number(s.bankqr_total ?? 0),
    wallet_total: Number(s.wallet_total ?? 0),
    unpaid_total: Number(s.unpaid_total ?? 0),
    expected_cash: Number(s.expected_cash ?? 0),
    cash_counted: s.cash_counted != null ? Number(s.cash_counted) : null,
    variance: Number(s.variance ?? 0),
  };
}

/** Danh sách ca trong 1 ngày kinh doanh (mới nhất trước). */
export async function listShiftsByDate(businessDate: string): Promise<SolaceShift[]> {
  const rows = await query<SolaceShift>(
    `SELECT s.*, u.name AS opened_by_name
       FROM solace_shifts s LEFT JOIN users u ON u.id::text = s.opened_by
      WHERE s.business_date = $1 ORDER BY s.opened_at DESC`, [businessDate]
  );
  return rows.map(normalizeShift);
}

/** Tổng hợp số liệu của 1 ngày kinh doanh (không tính đơn đã huỷ). */
export async function summarizeDay(businessDate: string): Promise<ShiftSummary> {
  const [r, cashFlow, walletFlow] = await Promise.all([
    queryOne<{
    total_orders: number; total_revenue: number; cash_total: number;
    bankqr_total: number; wallet_total: number; unpaid_total: number;
  }>(
    `SELECT
        COUNT(*)::int AS total_orders,
        COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN paid_amount ELSE 0 END), 0)::bigint AS total_revenue,
        COALESCE(SUM(CASE WHEN payment_status <> 'paid' THEN total - paid_amount ELSE 0 END), 0)::bigint AS unpaid_total
       FROM solace_orders
      WHERE business_date = $1 AND status <> 'cancelled'`,
    [businessDate]
    ),
    queryOne<{ cash_total: number; bankqr_total: number }>(
      `SELECT
          COALESCE(SUM(CASE WHEN account = 'cash' THEN CASE WHEN direction='in' THEN amount ELSE -amount END ELSE 0 END), 0)::bigint AS cash_total,
          COALESCE(SUM(CASE WHEN account = 'bank' THEN CASE WHEN direction='in' THEN amount ELSE -amount END ELSE 0 END), 0)::bigint AS bankqr_total
         FROM solace_cash_txns
        WHERE business_date = $1 AND ref_type = 'order'`,
      [businessDate]
    ),
    queryOne<{ wallet_total: number }>(
      `SELECT COALESCE(SUM(CASE WHEN type = 'payment' THEN -amount ELSE 0 END), 0)::bigint AS wallet_total
         FROM solace_wallet_txns
        WHERE ref_order_id IN (SELECT id FROM solace_orders WHERE business_date = $1)`,
      [businessDate]
    ),
  ]);
  return {
    business_date: businessDate,
    total_orders: r?.total_orders ?? 0,
    total_revenue: Number(r?.total_revenue ?? 0),
    cash_total: Number(cashFlow?.cash_total ?? 0),
    bankqr_total: Number(cashFlow?.bankqr_total ?? 0),
    wallet_total: Number(walletFlow?.wallet_total ?? 0),
    unpaid_total: Number(r?.unpaid_total ?? 0),
  };
}

export interface ShiftClose extends ShiftSummary {
  id: string; cash_counted: number | null; variance: number; note: string | null;
  closed_by: string | null; created_at: string;
}

export async function getShiftClose(businessDate: string): Promise<ShiftClose | null> {
  return queryOne<ShiftClose>(
    `SELECT id, business_date, total_orders, total_revenue, cash_total, bankqr_total, wallet_total,
            unpaid_total, cash_counted, variance, note, closed_by, created_at
       FROM solace_shift_closes WHERE business_date = $1`, [businessDate]
  );
}

/**
 * Kết ca cho 1 ngày kinh doanh: chốt snapshot + (tuỳ chọn) tiền mặt đếm thực tế,
 * lưu DB (upsert) và phát thông báo cho người nhận cấu hình.
 */
export async function closeShift(opts: {
  businessDate?: string; cashCounted?: number | null; note?: string | null; actor?: string | null;
}): Promise<ShiftClose> {
  const businessDate = opts.businessDate ?? await todayBusinessDate();
  const s = await summarizeDay(businessDate);
  const cashCounted = opts.cashCounted ?? null;
  const variance = cashCounted != null ? cashCounted - s.cash_total : 0;
  const id = genId('sclose');

  await execute(
    `INSERT INTO solace_shift_closes
       (id, business_date, total_orders, total_revenue, cash_total, bankqr_total, wallet_total,
        unpaid_total, cash_counted, variance, note, closed_by, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
     ON CONFLICT (business_date) DO UPDATE SET
       total_orders = EXCLUDED.total_orders, total_revenue = EXCLUDED.total_revenue,
       cash_total = EXCLUDED.cash_total, bankqr_total = EXCLUDED.bankqr_total,
       wallet_total = EXCLUDED.wallet_total, unpaid_total = EXCLUDED.unpaid_total,
       cash_counted = EXCLUDED.cash_counted, variance = EXCLUDED.variance,
       note = EXCLUDED.note, closed_by = EXCLUDED.closed_by, updated_at = NOW()`,
    [id, businessDate, s.total_orders, s.total_revenue, s.cash_total, s.bankqr_total, s.wallet_total,
     s.unpaid_total, cashCounted, variance, opts.note ?? null, opts.actor ?? null]
  );

  // Phát thông báo (in-app + Telegram) tới người nhận "Kết ca".
  const recipients = (await getRecipientsConfig()).shiftClose;
  if (recipients.length > 0) {
    let closedByName = 'Hệ thống';
    if (opts.actor) {
      const u = await queryOne<{ name: string }>(`SELECT name FROM users WHERE id::text = $1`, [opts.actor]);
      closedByName = u?.name ?? closedByName;
    }
    await notify('solace.shift_close', {
      date: businessDate,
      orders: s.total_orders,
      revenue: formatVND(s.total_revenue),
      cash: formatVND(s.cash_total),
      bankqr: formatVND(s.bankqr_total),
      wallet: formatVND(s.wallet_total),
      unpaid: formatVND(s.unpaid_total),
      variance: cashCounted != null ? formatVND(variance) : '—',
      closedBy: closedByName,
    }, { recipients, relatedId: id }).catch(() => {});
  }

  void logActivity({ action: 'solace_shift_closed', details: `Kết ca ${businessDate}: ${s.total_orders} đơn, thu ${s.total_revenue}đ`, performedBy: opts.actor ?? 'System' }).catch(() => {});
  return (await getShiftClose(businessDate))!;
}

/**
 * Đóng PHIÊN CA đang mở: chốt snapshot theo shift_id + đối soát quỹ đúng gốc
 * (két phải có = quỹ đầu ca + tiền mặt bán). Đồng thời chốt ngày (solace_shift_closes)
 * để báo cáo/thông báo ngày không đổi. Trả về phiên ca đã đóng.
 */
export async function closeActiveShift(opts: {
  cashCounted?: number | null; note?: string | null; actor?: string | null;
}): Promise<SolaceShift> {
  const shift = await getActiveShift();
  if (!shift) throw new Error('Không có ca nào đang mở để kết.');
  const s = await summarizeShift(shift.id);
  const expectedCash = shift.opening_float + s.cash_total;
  const cashCounted = opts.cashCounted != null ? Math.round(Number(opts.cashCounted)) : null;
  const variance = cashCounted != null ? cashCounted - expectedCash : 0;

  await execute(
    `UPDATE solace_shifts SET
        status = 'closed', closed_by = $2, closed_at = NOW(),
        total_orders = $3, total_revenue = $4, cash_total = $5, bankqr_total = $6,
        wallet_total = $7, unpaid_total = $8, expected_cash = $9,
        cash_counted = $10, variance = $11, note = $12, updated_at = NOW()
      WHERE id = $1`,
    [shift.id, opts.actor ?? null, s.total_orders, s.total_revenue, s.cash_total, s.bankqr_total,
     s.wallet_total, s.unpaid_total, expectedCash, cashCounted, variance, opts.note ?? null]
  );

  // Chốt ngày (giữ báo cáo ngày + phát thông báo kết ca như cũ).
  await closeShift({
    businessDate: shift.business_date, cashCounted, note: opts.note ?? null, actor: opts.actor ?? null,
  });

  void logActivity({ action: 'solace_shift_session_closed', details: `Kết phiên ca ${shift.business_date}: ${s.total_orders} đơn, lệch quỹ ${variance}đ`, performedBy: opts.actor ?? 'System' }).catch(() => {});
  return normalizeShift((await queryOne<SolaceShift>(
    `SELECT s.*, u.name AS opened_by_name FROM solace_shifts s LEFT JOIN users u ON u.id::text = s.opened_by WHERE s.id = $1`,
    [shift.id]
  ))!);
}

// ─── Nhắc / tự kết ca (scheduler) ─────────────────────────────────────────────

/** Đăng ký scope nhắc (1 lần/ngày/loại) qua solace_reminder_log — true nếu lần đầu. */
async function claimShiftScope(scope: string): Promise<boolean> {
  const n = await execute(
    `INSERT INTO solace_reminder_log (scope) VALUES ($1) ON CONFLICT (scope) DO NOTHING`, [scope]
  );
  return n !== 0;
}

/** Người nhận nhắc kết ca: người nhận cấu hình "Kết ca" + nhân viên ĐƯỢC GÁN quyền bán hàng (POS). */
async function shiftReminderRecipients(): Promise<string[]> {
  const cfg = (await getRecipientsConfig()).shiftClose ?? [];
  const pos = await solaceUnitUserIds('solace-pos', 'view');
  return [...new Set([...cfg, ...pos])];
}

/** Nhắc nếu ngày kinh doanh có đơn mà CHƯA kết ca. 1 lần/ngày. */
export async function remindUnclosedShift(businessDate: string): Promise<boolean> {
  if (await getShiftClose(businessDate)) return false;       // đã kết ca
  const s = await summarizeDay(businessDate);
  if (s.total_orders === 0) return false;                    // không hoạt động → không nhắc
  if (!(await claimShiftScope(`shiftremind:${businessDate}`))) return false;
  const recipients = await shiftReminderRecipients();
  if (recipients.length === 0) return false;
  await notify('solace.shift_unclosed', {
    date: businessDate, orders: s.total_orders, cash: formatVND(s.cash_total),
  }, { recipients }).catch(() => {});
  return true;
}

/** Tự kết ca ngày kinh doanh nếu có đơn mà vẫn chưa chốt (không đối soát tiền mặt). 1 lần/ngày. */
export async function autoCloseIfUnclosed(businessDate: string): Promise<boolean> {
  // Đóng phiên ca còn mở (từ ngày này trở về trước) trước khi chốt ngày.
  const active = await getActiveShift();
  if (active && active.business_date <= businessDate) {
    await closeActiveShift({ cashCounted: null, note: 'Tự động kết ca (chưa đối soát tiền mặt)', actor: null }).catch(() => {});
    return true;
  }
  if (await getShiftClose(businessDate)) return false;
  const s = await summarizeDay(businessDate);
  if (s.total_orders === 0) return false;
  if (!(await claimShiftScope(`shiftauto:${businessDate}`))) return false;
  await closeShift({ businessDate, cashCounted: null, note: 'Tự động kết ca (chưa đối soát tiền mặt)', actor: null });
  void logActivity({ action: 'solace_shift_autoclose', details: `Tự kết ca ${businessDate} (${s.total_orders} đơn)`, performedBy: 'System' }).catch(() => {});
  return true;
}
