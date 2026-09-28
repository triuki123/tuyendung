import { NextRequest, NextResponse } from 'next/server';
import { getChainsForUser, upsertChain, getLimitsForUser, upsertLimit, type ChainStep } from '@/lib/services/expenseApprovalService';
import { hasExpensePerm } from '@/lib/services/expensePermissionService';

export const dynamic = 'force-dynamic';

/**
 * Tab "Quyền Chi Phí" trong form Người Dùng (roadmap §2.6):
 *  GET — chuỗi duyệt (đơn NGƯỜI NÀY tạo) + hạn mức thẩm quyền (khi NGƯỜI NÀY duyệt).
 *  PUT — ghi cả hai: { chains: [{company_id, steps}], limits: [{company_id, max_amount, remove?}] }
 * Chỉ người có expense.manage (hoặc super_admin) được xem/sửa.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!(await hasExpensePerm(userId, null, 'manage'))) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const [chains, limits] = await Promise.all([getChainsForUser(params.id), getLimitsForUser(params.id)]);
    return NextResponse.json({ success: true, chains, limits });
  } catch (err) {
    console.error('GET expense-approval error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    // Chuỗi duyệt & hạn mức là cấu hình THEO CÔNG TY → xét `manage` tại ĐÚNG công ty của từng mục,
    // không cho người có manage ở công ty A ráp chuỗi/hạn mức cho công ty B.
    if (Array.isArray(body.chains)) {
      for (const c of body.chains) {
        if (!(await hasExpensePerm(userId, c.company_id ?? null, 'manage'))) {
          return NextResponse.json({ error: 'Không có quyền cấu hình tại công ty này' }, { status: 403 });
        }
      }
    }
    if (Array.isArray(body.limits)) {
      for (const l of body.limits) {
        if (!(await hasExpensePerm(userId, l.company_id ?? null, 'manage'))) {
          return NextResponse.json({ error: 'Không có quyền cấu hình tại công ty này' }, { status: 403 });
        }
      }
    }

    if (Array.isArray(body.chains)) {
      for (const c of body.chains) {
        await upsertChain(params.id, c.company_id ?? null, (c.steps ?? []) as ChainStep[]);
      }
    }
    if (Array.isArray(body.limits)) {
      for (const l of body.limits) {
        await upsertLimit(params.id, l.company_id ?? null, l.max_amount ?? null, !!l.remove);
      }
    }
    const [chains, limits] = await Promise.all([getChainsForUser(params.id), getLimitsForUser(params.id)]);
    return NextResponse.json({ success: true, chains, limits });
  } catch (err) {
    console.error('PUT expense-approval error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
