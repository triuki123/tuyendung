import { NextRequest, NextResponse } from 'next/server';
import { listLowStock } from '@/lib/services/solaceInventoryService';
import { guardSolace } from '@/lib/solaceApiGuard';

export async function GET(request: NextRequest) {
  try {
    const g = await guardSolace(request, 'solace-inventory', 'view');
    if (g instanceof NextResponse) return g;
    const data = await listLowStock();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/solace/low-stock error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
