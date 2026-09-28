import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/expenseService';
import { hasExpensePerm, canViewCompanyWide } from '@/lib/services/expensePermissionService';
import { getEffectiveContext } from '@/lib/services/userCompanyService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/expenses — danh sách phiếu chi.
 *  ?scope=mine (mặc định) | approve (đến lượt tôi duyệt) | company (cần expense.view tại công ty)
 *  ?company_id=... &status=a,b &related_type=&related_id=
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const role = request.headers.get('x-current-user-role') || '';
    const sp = request.nextUrl.searchParams;
    const scope = sp.get('scope') || 'mine';
    const companyId = sp.get('company_id') || undefined;
    const status = sp.get('status')?.split(',').filter(Boolean) as svc.ExpenseStatus[] | undefined;

    // Cách ly công ty: đứng ở công ty nào thì chỉ thấy phiếu chi của công ty đó.
    // Trước đây scope=approve KHÔNG lọc công ty → hàng đợi "Chờ tôi duyệt" gom phiếu của
    // MỌI công ty (đứng ở công ty con vẫn thấy phiếu công ty mẹ). scope=mine/team cũng chỉ
    // lọc khi client tự truyền company_id.
    const activeCompanyId = request.headers.get('x-current-user-company') || undefined;
    const scopedCompanyId = companyId ?? activeCompanyId;

    const base: svc.ListExpensesFilter = {
      status: status?.length ? status : undefined,
      relatedType: sp.get('related_type') || undefined,
      relatedId: sp.get('related_id') || undefined,
    };

    let data: svc.Expense[];
    if (scope === 'related') {
      // Dòng chảy: xem nhanh chi phí gắn với 1 thực thể (vd ticket) — chỉ thông tin tóm tắt.
      if (!base.relatedType || !base.relatedId) return NextResponse.json({ error: 'Thiếu related_type/related_id' }, { status: 400 });
      const rows = await svc.listExpenses(base);
      // Cách ly công ty: chỉ trả phiếu người gọi được thấy (của mình / SA / expense.view tại công ty phiếu).
      const uid = userId.toLowerCase();
      const viewCache = new Map<string, boolean>();
      const visible: typeof rows = [];
      for (const e of rows) {
        if (role === 'super_admin' || e.requested_by.toLowerCase() === uid) { visible.push(e); continue; }
        if (!viewCache.has(e.company_id)) viewCache.set(e.company_id, await hasExpensePerm(userId, e.company_id, 'view'));
        if (viewCache.get(e.company_id)) visible.push(e);
      }
      return NextResponse.json({
        success: true,
        data: visible.map((e) => ({ id: e.id, code: e.code, title: e.title, amount: e.amount, status: e.status, category_name: e.category_name, requester_name: e.requester_name, created_at: e.created_at })),
      });
    }
    if (scope === 'approve') {
      data = await svc.listExpenses({ ...base, pendingApproverId: userId, companyId: scopedCompanyId });
    } else if (scope === 'team') {
      // Phạm vi phòng ban/đội: đơn của cấp dưới theo cây manager_id.
      data = await svc.listExpenses({ ...base, teamOfUserId: userId, companyId: scopedCompanyId });
    } else if (scope === 'company') {
      // Không chọn công ty → mặc định CÔNG TY ĐANG ĐỨNG, không bắt lỗi 400.
      // (Trước đây chỉ super_admin được bỏ trống; vai Admin bị trả "Thiếu company_id" →
      //  client vẫn gọi lại → toast lỗi lặp liên tục.)
      if (role !== 'super_admin') {
        if (!scopedCompanyId) return NextResponse.json({ error: 'Thiếu company_id' }, { status: 400 });
        if (!(await canViewCompanyWide(userId, scopedCompanyId))) {
          return NextResponse.json({ error: 'Không có quyền xem chi phí công ty này' }, { status: 403 });
        }
      }
      data = await svc.listExpenses({ ...base, companyId: scopedCompanyId });
    } else {
      data = await svc.listExpenses({ ...base, requestedBy: userId, companyId: scopedCompanyId });
    }
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/expenses error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST /api/expenses — tạo phiếu nháp. Cần expense.create TẠI CÔNG TY CHỊU CHI (11.0). */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const body = await request.json();
    if (!body.title?.trim()) return NextResponse.json({ error: 'Thiếu tiêu đề' }, { status: 400 });
    if (!body.company_id) return NextResponse.json({ error: 'Chọn công ty chịu chi phí' }, { status: 400 });

    if (!(await hasExpensePerm(userId, body.company_id, 'create'))) {
      return NextResponse.json({ error: 'Bạn không có quyền tạo chi phí cho công ty này' }, { status: 403 });
    }

    // Tự điền phòng ban từ employee graph (membership tại công ty chịu chi) nếu client không gửi.
    if (!body.department_id) {
      const ctx = await getEffectiveContext(userId, body.company_id).catch(() => null);
      if (ctx?.department_id) body.department_id = ctx.department_id;
    }

    const data = await svc.createExpense({ ...body, title: body.title.trim(), requested_by: userId });
    // Cảnh báo nghi trùng (không chặn)
    const dup = await svc.findDuplicateWarning(data.supplier_tax_code, data.invoice_number, data.id, data.company_id);
    return NextResponse.json({ success: true, data, duplicateWarning: dup ? { id: dup.id, code: dup.code, title: dup.title } : null }, { status: 201 });
  } catch (err) {
    console.error('POST /api/expenses error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
