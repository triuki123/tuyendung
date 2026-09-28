import { NextRequest, NextResponse } from 'next/server';
import { submitExpense, getExpenseById } from '@/lib/services/expenseService';
import { notify } from '@/lib/notifications/engine';
import { formatMoney } from '@/lib/format';
import { sendApprovalRequest } from '@/lib/telegram/sendApproval';
import { buildExpenseApprovalTelegramText } from '@/lib/telegram/expenseApprovalTelegram';

export const dynamic = 'force-dynamic';

/** POST /api/expenses/[id]/submit — gửi duyệt (resolve chuỗi 2 tầng, sinh số phiếu). */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const res = await submitExpense(params.id, userId);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });

    // Notify người duyệt bước 1 (qua engine — in-app + Telegram)
    if (res.firstApproverId) {
      const e = await getExpenseById(params.id);
      if (e) {
        await notify('expense.submitted', {
          code: e.code || '', title: e.title, amountFmt: formatMoney(Number(e.amount), e.currency),
          requester: e.requester_name || 'Nhân sự', company: e.company_name || '', expenseId: e.id,
        }, { recipients: [res.firstApproverId], relatedId: e.id, skipTelegram: true }).catch((err) => console.error('notify expense.submitted:', err));
        const telegramText = await buildExpenseApprovalTelegramText(e.id);
        if (telegramText) {
          await sendApprovalRequest({
            type: 'expense',
            id: e.id,
            approverUserId: res.firstApproverId,
            text: telegramText,
            detailLabel: '🔍 Xem chi phí',
          }).catch((err) => console.error('send expense approval telegram:', err));
        }
      }
    }
    return NextResponse.json({ success: true, code: res.code });
  } catch (err) {
    console.error('POST /api/expenses/[id]/submit error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
