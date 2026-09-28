import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateWallet, listTxns } from '@/lib/services/solaceWalletService';
import { requireLogin } from '@/lib/solaceApiGuard';

// Ví của chính người dùng đang đăng nhập + lịch sử giao dịch.
export async function GET(request: NextRequest) {
  try {
    const auth = requireLogin(request);
    if (auth instanceof NextResponse) return auth;
    const [wallet, txns] = await Promise.all([getOrCreateWallet(auth.userId), listTxns(auth.userId, 50)]);
    return NextResponse.json({ success: true, data: { wallet, txns } });
  } catch (err) {
    console.error('GET /api/solace/wallet error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
