import { NextRequest, NextResponse } from 'next/server';
import { getMemberDebt } from '@/lib/services/solaceDebtService';
import { guardSolace } from '@/lib/solaceApiGuard';

export async function GET(request: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const g = await guardSolace(request, 'solace-debt', 'view');
    if (g instanceof NextResponse) return g;
    const data = await getMemberDebt(params.userId);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/solace/debts/[userId] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
