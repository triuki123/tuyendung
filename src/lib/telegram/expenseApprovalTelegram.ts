import { queryOne } from '@/lib/db';
import { formatMoney } from '@/lib/format';
import { getExpenseById, getExpenseLines } from '@/lib/services/expenseService';

function esc(v: string | null | undefined): string {
  return String(v ?? '').replace(/([\\_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

function short(v: string | null | undefined, max = 240): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function hasText(v: string | null | undefined): boolean {
  return Boolean(String(v ?? '').trim());
}

export async function wasExpenseResubmitted(expenseId: string, expenseCode?: string | null): Promise<boolean> {
  const token = expenseCode || expenseId;
  const row = await queryOne<{ ok: number }>(
    `SELECT 1 AS ok
       FROM audit_logs
      WHERE action = 'expense_recalled'
        AND details ILIKE $1
      LIMIT 1`,
    [`%${token}%`],
  );
  return Boolean(row);
}

export async function buildExpenseApprovalTelegramText(expenseId: string): Promise<string | null> {
  const expense = await getExpenseById(expenseId);
  if (!expense) return null;

  const detailLines = await getExpenseLines(expenseId).catch(() => []);
  const resubmitted = await wasExpenseResubmitted(expense.id, expense.code);
  const currency = expense.currency || 'VND';
  const rows: string[] = [];

  rows.push(`💸 *Phiếu chi chờ duyệt: ${esc(expense.code || expense.id)}*`);
  if (resubmitted) rows.push(`🔁 *Phiếu này đã được thu hồi và gửi lại.*`);
  rows.push('');
  rows.push(`👤 ${esc(expense.requester_name || 'Nhân sự')}`);
  rows.push(`🏢 ${esc(expense.company_name || 'Chưa rõ công ty')}`);
  if (expense.category_name) rows.push(`📂 ${esc(expense.category_name)}`);
  if (expense.expense_date) rows.push(`📅 ${esc(expense.expense_date)}`);
  rows.push(`💵 *${esc(formatMoney(Number(expense.amount || 0), currency))}*`);
  rows.push(`📝 ${esc(short(expense.title, 500))}`);

  if (hasText(expense.cost_center)) rows.push(`🏷️ TTCP: ${esc(expense.cost_center)}`);
  if (hasText(expense.project_code)) rows.push(`🧩 Dự án: ${esc(expense.project_code)}`);
  if (hasText(expense.supplier_name)) rows.push(`🏪 NCC: ${esc(short(expense.supplier_name, 200))}`);
  if (hasText(expense.invoice_number)) rows.push(`🧾 Hóa đơn: ${esc(expense.invoice_number)}`);
  if (hasText(expense.payee_name)) rows.push(`🙋 Người thụ hưởng: ${esc(short(expense.payee_name, 200))}`);
  if (hasText(expense.payment_method)) rows.push(`💳 Thanh toán: ${esc(expense.payment_method)}`);

  if (detailLines.length > 0) {
    rows.push('');
    rows.push('*Chi tiết chi phí:*');
    detailLines.forEach((line, index) => {
      rows.push(`${index + 1}. ${esc(short(line.noi_dung, 180) || 'Nội dung')}`);
      if (hasText(line.mo_ta)) rows.push(`   Mô tả: ${esc(short(line.mo_ta, 260))}`);
      rows.push(
        `   SL ${Number(line.sl || 0)} · ${esc(line.dvt || 'đv')} · ĐG ${esc(formatMoney(Number(line.don_gia || 0), currency))} · TT ${esc(formatMoney(Number(line.thanh_tien || 0), currency))}`,
      );
    });
  }

  rows.push('');
  rows.push('_Đến lượt bạn duyệt._');

  let text = rows.join('\n');
  if (text.length > 3600) text = `${text.slice(0, 3596)}...`;
  return text;
}
