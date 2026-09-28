import { NextRequest, NextResponse } from 'next/server';
import { listTopupRequests, createTopupRequest } from '@/lib/services/solaceWalletService';
import { canManageSolace } from '@/lib/services/solacePermissionService';
import { guardSolace, requireLogin } from '@/lib/solaceApiGuard';

// Danh sách yêu cầu nạp (cho người quản lý ví).
export async function GET(request: NextRequest) {
  try {
    const g = await guardSolace(request, 'solace-wallet', 'view');
    if (g instanceof NextResponse) return g;
    const status = new URL(request.url).searchParams.get('status') ?? undefined;
    const data = await listTopupRequests(status);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/solace/topup-requests error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

// Khách tạo yêu cầu nạp tiền (cho chính mình). Mọi user đã đăng nhập.
export async function POST(request: NextRequest) {
  try {
    const auth = requireLogin(request);
    if (auth instanceof NextResponse) return auth;
    const body = await request.json();
    // Cho phép nhân viên ví tạo hộ thành viên khác; còn lại chỉ tạo cho mình.
    let targetUser = auth.userId;
    if (body.user_id && body.user_id !== auth.userId) {
      if (await canManageSolace(auth.userId, 'solace-wallet', 'edit')) targetUser = body.user_id;
    }
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'Số tiền không hợp lệ' }, { status: 400 });
    const data = await createTopupRequest(targetUser, amount, body.method === 'cash' ? 'cash' : 'transfer', body.note ?? null, auth.userId);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi server';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
