import { NextRequest, NextResponse } from 'next/server';
import { confirmRefund, getExpenseById } from '@/lib/services/expenseService';
import { listApprovals } from '@/lib/services/expenseApprovalService';
import { hasExpensePerm } from '@/lib/services/expensePermissionService';
import { notify } from '@/lib/notifications/engine';
import { formatMoney } from '@/lib/format';
import { queryOne } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/expenses/[id]/confirm-refund — công ty xác nhận ĐÃ NHẬN tiền hoàn ứng
 * (phiếu quyết toán có thực chi < tạm ứng). Phía công ty xác nhận: super_admin,
 * người có expense.manage tại công ty, hoặc người trong chuỗi duyệt của phiếu.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const role = request.headers.get('x-current-user-role') || '';

    const e = await getExpenseById(params.id);
    if (!e) return NextResponse.json({ error: 'Không tìm thấy phiếu' }, { status: 404 });

    let allowed = role === 'super_admin' || (await hasExpensePerm(userId, e.company_id, 'manage'));
    if (!allowed) {
      const approvals = await listApprovals(params.id);
      allowed = approvals.some((a) => String(a.approver_user_id).toLowerCase() === userId.toLowerCase());
    }
    if (!allowed) return NextResponse.json({ error: 'Không có quyền xác nhận hoàn ứng' }, { status: 403 });

    const res = await confirmRefund(params.id, userId);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });

    // Báo người tạo phiếu: công ty đã nhận tiền hoàn ứng (qua engine — in-app + Telegram).
    const adv = e.advance_id ? await getExpenseById(e.advance_id) : null;
    const refund = adv ? Number(adv.amount) - Number(e.amount) : 0;
    const confirmer = await queryOne<{ name: string }>('SELECT name FROM users WHERE id::text = $1', [userId.toLowerCase()]);
    await notify('expense.refund_confirmed', {
      code: e.code || '', title: e.title, refundFmt: formatMoney(refund, adv?.currency || e.currency),
      confirmer: confirmer?.name || 'Công ty', expenseId: e.id,
    }, { recipients: [e.requested_by], relatedId: e.id }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/expenses/[id]/confirm-refund error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
