import { NextRequest, NextResponse } from 'next/server';
import { rejectCurrentStep } from '@/lib/services/expenseApprovalService';
import { hasExpensePerm } from '@/lib/services/expensePermissionService';
import { getExpenseById, auditExpense, revertSettlementPending } from '@/lib/services/expenseService';
import { queryOne } from '@/lib/db';
import { notify } from '@/lib/notifications/engine';
import { resolveApprovalMessages } from '@/lib/telegram/approvalMessageSync';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const reason = String(body.reason || '').trim();
    if (!reason) return NextResponse.json({ error: 'Nhập lý do từ chối' }, { status: 400 });

    // 2 lớp: (1) có quyền Duyệt TẠI CÔNG TY CHỊU CHI, (2) đúng lượt trong chuỗi duyệt.
    const target = await getExpenseById(params.id);
    if (!target) return NextResponse.json({ error: 'Không tìm thấy phiếu' }, { status: 404 });
    if (!(await hasExpensePerm(userId, target.company_id, 'approve'))) {
      return NextResponse.json({ error: 'Bạn chưa được cấp quyền Duyệt chi phí tại công ty này' }, { status: 403 });
    }

    const res = await rejectCurrentStep(params.id, userId, reason);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });

    const e = await getExpenseById(params.id);
    const approver = await queryOne<{ name: string }>('SELECT name FROM users WHERE id::text = $1', [userId.toLowerCase()]);
    const approverName = approver?.name || 'Người duyệt';

    if (e) {
      await revertSettlementPending(e.id).catch(() => {});
      auditExpense('rejected', e, userId, `${approverName} từ chối · ${reason}`);
      await resolveApprovalMessages('expense', e.id, 'rejected', approverName).catch(() => {});
      await notify(
        'expense.rejected',
        { code: e.code || '', title: e.title, approver: approverName, reason, expenseId: e.id },
        { recipients: [e.requested_by], relatedId: e.id },
      ).catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/expenses/[id]/reject error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
