import { NextRequest, NextResponse } from 'next/server';
import { approveTopupRequest, rejectTopupRequest } from '@/lib/services/solaceWalletService';
import { guardSolace } from '@/lib/solaceApiGuard';

// Duyệt / từ chối yêu cầu nạp tiền.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guardSolace(request, 'solace-wallet', 'edit');
    if (g instanceof NextResponse) return g;
    const body = await request.json();
    if (body.action === 'approve') await approveTopupRequest(params.id, g.userId);
    else if (body.action === 'reject') await rejectTopupRequest(params.id, g.userId);
    else return NextResponse.json({ error: 'Hành động không hợp lệ' }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi server';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
