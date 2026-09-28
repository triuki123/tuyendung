import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/leaveBalanceService';

export const dynamic = 'force-dynamic';

/** POST — admin cộng/trừ quỹ phép thủ công (bắt buộc có lý do). */
export async function POST(request: NextRequest) {
  try {
    const role = request.headers.get('x-current-user-role') || '';
    const adminId = request.headers.get('x-current-user-id');
    if (role !== 'super_admin' && role !== 'admin') {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    if (!adminId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const body = await request.json();
    const { user_id, year, amount, note } = body;

    if (!user_id || !year || !amount || !note?.trim()) {
      return NextResponse.json(
        { error: 'Thiếu thông tin: cần user_id, year, amount (≠ 0) và lý do' },
        { status: 400 }
      );
    }
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum === 0 || Math.abs(amountNum) > 365) {
      return NextResponse.json({ error: 'Số ngày điều chỉnh không hợp lệ' }, { status: 400 });
    }

    await svc.adjustBalance({
      user_id,
      year: Number(year),
      amount: amountNum,
      note: note.trim(),
      created_by: adminId,
    });

    const balance = await svc.getBalance(user_id, Number(year));
    return NextResponse.json({ success: true, balance });
  } catch (err) {
    console.error('POST /api/leave/balance/adjust error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
