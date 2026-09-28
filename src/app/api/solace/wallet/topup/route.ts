import { NextRequest, NextResponse } from 'next/server';
import { topUp, adjustWallet } from '@/lib/services/solaceWalletService';
import { guardSolace } from '@/lib/solaceApiGuard';

// Nạp tiền trực tiếp vào ví thành viên (nhân viên thu tiền mặt / admin). Hỗ trợ cả điều chỉnh.
export async function POST(request: NextRequest) {
  try {
    const g = await guardSolace(request, 'solace-wallet', 'edit');
    if (g instanceof NextResponse) return g;
    const body = await request.json();
    if (!body.user_id) return NextResponse.json({ error: 'Thiếu thành viên' }, { status: 400 });
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount === 0) return NextResponse.json({ error: 'Số tiền không hợp lệ' }, { status: 400 });

    const data = body.type === 'adjust'
      ? await adjustWallet(body.user_id, amount, body.note ?? null, g.userId)
      : await topUp(body.user_id, Math.abs(amount), body.method === 'transfer' ? 'transfer' : 'cash', body.note ?? null, g.userId);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi server';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
