import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/leaveBalanceService';

export const dynamic = 'force-dynamic';

/** POST — admin cộng/trừ quỹ phép HÀNG LOẠT cho nhiều nhân sự (bắt buộc có lý do). */
export async function POST(request: NextRequest) {
  try {
    const role = request.headers.get('x-current-user-role') || '';
    const adminId = request.headers.get('x-current-user-id');
    if (role !== 'super_admin' && role !== 'admin') {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    if (!adminId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const body = await request.json();
    const { user_ids, year, amount, note } = body;

    if (!Array.isArray(user_ids) || user_ids.length === 0 || !year || !amount || !note?.trim()) {
      return NextResponse.json(
        { error: 'Thiếu thông tin: cần user_ids (≥1), year, amount (≠ 0) và lý do' },
        { status: 400 }
      );
    }
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum === 0 || Math.abs(amountNum) > 365) {
      return NextResponse.json({ error: 'Số ngày điều chỉnh không hợp lệ' }, { status: 400 });
    }

    const count = await svc.adjustBalanceBulk({
      user_ids,
      year: Number(year),
      amount: amountNum,
      note: note.trim(),
      created_by: adminId,
    });

    return NextResponse.json({ success: true, count });
  } catch (err) {
    console.error('POST /api/leave/balance/adjust-bulk error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
