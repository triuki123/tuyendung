import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/expenseService';
import { listApprovals } from '@/lib/services/expenseApprovalService';
import { hasExpensePerm } from '@/lib/services/expensePermissionService';

export const dynamic = 'force-dynamic';

/** Được xem chi tiết: người tạo, người trong chuỗi duyệt, hoặc có expense.view tại công ty, hoặc super_admin. */
async function canView(userId: string, role: string, e: svc.Expense): Promise<boolean> {
  if (role === 'super_admin') return true;
  if (e.requested_by.toLowerCase() === userId.toLowerCase()) return true;
  const approvals = await listApprovals(e.id);
  if (approvals.some((a) => String(a.approver_user_id).toLowerCase() === userId.toLowerCase())) return true;
  return hasExpensePerm(userId, e.company_id, 'view');
}

/** GET /api/expenses/[id] — chi tiết + lines + timeline duyệt + cảnh báo trùng. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const role = request.headers.get('x-current-user-role') || '';

    const data = await svc.getExpenseById(params.id);
    if (!data) return NextResponse.json({ error: 'Không tìm thấy phiếu' }, { status: 404 });
    if (!(await canView(userId, role, data))) return NextResponse.json({ error: 'Không có quyền xem phiếu này' }, { status: 403 });

    const [lines, approvals, dup, attachments, assets, settlement] = await Promise.all([
      svc.getExpenseLines(params.id),
      listApprovals(params.id),
      svc.findDuplicateWarning(data.supplier_tax_code, data.invoice_number, data.id, data.company_id),
      svc.listAttachments(params.id),
      svc.getSpawnedAssets(params.id),
      svc.getSettlementInfo(data),
    ]);
    return NextResponse.json({
      success: true, data, lines, approvals, attachments, assets, settlement,
      duplicateWarning: dup ? { id: dup.id, code: dup.code, title: dup.title } : null,
    });
  } catch (err) {
    console.error('GET /api/expenses/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** PUT /api/expenses/[id] — sửa (chỉ người tạo, khi draft|rejected). */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const cur = await svc.getExpenseById(params.id);
    if (!cur) return NextResponse.json({ error: 'Không tìm thấy phiếu' }, { status: 404 });
    if (cur.requested_by.toLowerCase() !== userId.toLowerCase()) {
      return NextResponse.json({ error: 'Chỉ người tạo được sửa phiếu' }, { status: 403 });
    }

    const body = await request.json();
    // Đổi công ty chịu chi → kiểm quyền create tại công ty mới.
    if (body.company_id && body.company_id !== cur.company_id) {
      if (!(await hasExpensePerm(userId, body.company_id, 'create'))) {
        return NextResponse.json({ error: 'Bạn không có quyền tạo chi phí cho công ty này' }, { status: 403 });
      }
    }
    const res = await svc.updateExpense(params.id, body);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    const data = await svc.getExpenseById(params.id);
    const dup = await svc.findDuplicateWarning(data!.supplier_tax_code, data!.invoice_number, data!.id, data!.company_id);
    return NextResponse.json({ success: true, data, duplicateWarning: dup ? { id: dup.id, code: dup.code, title: dup.title } : null });
  } catch (err) {
    console.error('PUT /api/expenses/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    const role = request.headers.get('x-current-user-role') || '';
    if (!userId) return NextResponse.json({ error: 'ChÆ°a Ä‘Äƒng nháº­p' }, { status: 401 });

    const cur = await svc.getExpenseById(params.id);
    if (!cur) return NextResponse.json({ error: 'KhÃ´ng tÃ¬m tháº¥y phiáº¿u' }, { status: 404 });

    const allowed = role === 'super_admin' || await hasExpensePerm(userId, cur.company_id, 'delete');
    if (!allowed) {
      return NextResponse.json({ error: 'KhÃ´ng cÃ³ quyá»n xÃ³a phiáº¿u chi nÃ y' }, { status: 403 });
    }

    const res = await svc.deleteExpense(params.id);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/expenses/[id] error:', err);
    return NextResponse.json({ error: 'Lá»—i server' }, { status: 500 });
  }
}
