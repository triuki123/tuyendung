/**
 * solaceReminderService — chạy định kỳ (scheduler): nhắc công nợ + cảnh báo tồn kho thấp.
 * Chống trùng qua bảng solace_reminder_log (1 lần / phạm vi / ngày).
 */
import { query, execute } from '@/lib/db';
import { notify } from '@/lib/notifications/engine';
import { formatVND } from '@/lib/format';
import { getDebtors } from '@/lib/services/solaceDebtService';
import { listLowStock } from '@/lib/services/solaceInventoryService';
import { solaceUnitUserIds } from '@/lib/services/solacePermissionService';

function vnDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

/** Đăng ký scope (đã nhắc) — trả true nếu lần đầu trong ngày (nên gửi). */
async function claim(scope: string): Promise<boolean> {
  const r = await execute(
    `INSERT INTO solace_reminder_log (scope) VALUES ($1) ON CONFLICT (scope) DO NOTHING`, [scope]
  );
  return (r as { rowCount?: number }).rowCount !== 0;
}

/** ID người quản lý kho: super_admin hoặc ĐƯỢC GÁN quyền 'solace-inventory' (view). */
async function inventoryManagerIds(): Promise<string[]> {
  return solaceUnitUserIds('solace-inventory', 'view');
}

export async function runSolaceReminders(): Promise<{ debtSent: number; lowStockSent: number }> {
  const date = vnDate();
  let debtSent = 0;

  // 1. Nhắc công nợ — mỗi người nợ 1 lần/ngày.
  const debtors = await getDebtors();
  for (const d of debtors) {
    if (!d.user_id) continue;
    if (!(await claim(`debt:${d.user_id}:${date}`))) continue;
    await notify('solace.debt_reminder', {
      totalDebt: formatVND(d.total_debt), orderCount: d.order_count,
    }, { recipients: [d.user_id], relatedId: d.user_id }).catch(() => {});
    debtSent++;
  }

  // 2. Cảnh báo tồn kho thấp — 1 lần/ngày, gửi người quản lý kho.
  let lowStockSent = 0;
  const low = await listLowStock();
  if (low.length > 0 && (await claim(`lowstock:${date}`))) {
    const managers = await inventoryManagerIds();
    if (managers.length > 0) {
      const list = low.map(i => `• ${i.name}: còn ${i.stock_qty} ${i.unit} (tối thiểu ${i.min_qty})`).join('\n');
      await notify('solace.low_stock', { count: low.length, list }, { recipients: managers }).catch(() => {});
      lowStockSent = managers.length;
    }
  }

  if (debtSent || lowStockSent) console.log(`[SolaceReminder] nhắc nợ ${debtSent} người, cảnh báo tồn ${lowStockSent ? 'có' : 'không'}`);
  return { debtSent, lowStockSent };
}
