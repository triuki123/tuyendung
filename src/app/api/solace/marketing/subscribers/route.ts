import { NextRequest, NextResponse } from 'next/server';
import { guardSolace } from '@/lib/solaceApiGuard';
import { countActiveSubscribers } from '@/lib/solace/solaceBotService';

/** Số người sẽ nhận broadcast (subscriber chưa opt-out) — để xem trước trên UI. */
export async function GET(request: NextRequest) {
  try {
    const g = await guardSolace(request, 'solace-marketing', 'view');
    if (g instanceof NextResponse) return g;
    const count = await countActiveSubscribers();
    return NextResponse.json({ success: true, data: { count } });
  } catch (err) {
    console.error('GET /api/solace/marketing/subscribers error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
