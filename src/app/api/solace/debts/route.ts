import { NextRequest, NextResponse } from 'next/server';
import { getDebtors } from '@/lib/services/solaceDebtService';
import { guardSolace } from '@/lib/solaceApiGuard';

export async function GET(request: NextRequest) {
  try {
    const g = await guardSolace(request, 'solace-debt', 'view');
    if (g instanceof NextResponse) return g;
    const data = await getDebtors();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/solace/debts error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
