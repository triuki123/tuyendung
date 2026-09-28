import { NextRequest, NextResponse } from 'next/server';
import { approveCurrentStep } from '@/lib/services/expenseApprovalService';
import { hasExpensePerm } from '@/lib/services/expensePermissionService';
import { getExpenseById, markAssetsPurchasing, auditExpense, markSettlementSettled } from '@/lib/services/expenseService';
import { queryOne } from '@/lib/db';
import { notify } from '@/lib/notifications/engine';
import { formatMoney } from '@/lib/format';
import { sendApprovalRequest } from '@/lib/telegram/sendApproval';
import { resolveApprovalMessages } from '@/lib/telegram/approvalMessageSync';
import { buildExpenseApprovalTelegramText } from '@/lib/telegram/expenseApprovalTelegram';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const body = await request.json().catch(() => ({}));

    // 2 lớp: (1) có quyền Duyệt TẠI CÔNG TY CHỊU CHI, (2) đúng lượt trong chuỗi duyệt.
    const target = await getExpenseById(params.id);
    if (!target) return NextResponse.json({ error: 'Không tìm thấy phiếu' }, { status: 404 });
    if (!(await hasExpensePerm(userId, target.company_id, 'approve'))) {
      return NextResponse.json({ error: 'Bạn chưa được cấp quyền Duyệt chi phí tại công ty này' }, { status: 403 });
    }

    const res = await approveCurrentStep(params.id, userId, body.note);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });

    const e = await getExpenseById(params.id);
    const approver = await queryOne<{ name: string }>('SELECT name FROM users WHERE id::text = $1', [userId.toLowerCase()]);
    const approverName = approver?.name || 'Người duyệt';

    if (e) {
      const vars = {
        code: e.code || '',
        title: e.title,
        amountFmt: formatMoney(Number(e.amount), e.currency),
        approver: approverName,
        expenseId: e.id,
      };

      auditExpense(
        res.outcome === 'completed' ? 'approved' : 'step_approved',
        e,
        userId,
        `${approverName} duyệt${body.note ? ` · ${body.note}` : ''}`,
      );

      if (res.outcome === 'completed') {
        await markAssetsPurchasing(e.id).catch(() => {});
        await markSettlementSettled(e.id).catch(() => {});
        await resolveApprovalMessages('expense', e.id, 'approved', approverName).catch(() => {});
        await notify('expense.approved', vars, { recipients: [e.requested_by], relatedId: e.id }).catch(() => {});
      } else if (res.outcome === 'advanced' && res.nextApproverId) {
        await resolveApprovalMessages('expense', e.id, 'approved', approverName).catch(() => {});
        await notify(
          'expense.submitted',
          { ...vars, requester: e.requester_name || 'Nhân sự', company: e.company_name || '' },
          { recipients: [res.nextApproverId], relatedId: e.id, skipTelegram: true },
        ).catch(() => {});

        const telegramText = await buildExpenseApprovalTelegramText(e.id);
        if (telegramText) {
          await sendApprovalRequest({
            type: 'expense',
            id: e.id,
            approverUserId: res.nextApproverId,
            text: telegramText,
            detailLabel: '🔍 Xem chi phí',
          }).catch(() => {});
        }

        await notify('expense.step_approved', vars, { recipients: [e.requested_by], relatedId: e.id }).catch(() => {});
      }
    }

    return NextResponse.json({ success: true, outcome: res.outcome });
  } catch (err) {
    console.error('POST /api/expenses/[id]/approve error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
