import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateWallet, listTxns } from '@/lib/services/solaceWalletService';
import { guardSolace } from '@/lib/solaceApiGuard';

// Tra cứu ví 1 thành viên (cho người quản lý ví).
export async function GET(request: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const g = await guardSolace(request, 'solace-wallet', 'view');
    if (g instanceof NextResponse) return g;
    const [wallet, txns] = await Promise.all([getOrCreateWallet(params.userId), listTxns(params.userId, 50)]);
    return NextResponse.json({ success: true, data: { wallet, txns } });
  } catch (err) {
    console.error('GET /api/solace/wallet/[userId] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
