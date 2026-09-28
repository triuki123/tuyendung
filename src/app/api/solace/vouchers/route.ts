import { NextRequest, NextResponse } from 'next/server';
import { listVouchers, upsertVoucher } from '@/lib/services/solaceVoucherService';
import { guardSolace } from '@/lib/solaceApiGuard';

export async function GET(request: NextRequest) {
  try {
    const g = await guardSolace(request, 'solace-menu', 'view');
    if (g instanceof NextResponse) return g;
    const data = await listVouchers();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/solace/vouchers error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const g = await guardSolace(request, 'solace-menu', 'edit');
    if (g instanceof NextResponse) return g;
    const b = await request.json();
    if (!b.code?.trim()) return NextResponse.json({ error: 'Thiếu mã' }, { status: 400 });
    await upsertVoucher({
      code: b.code, type: b.type === 'percent' ? 'percent' : 'amount', value: b.value,
      min_order: b.min_order, max_discount: b.max_discount, usage_limit: b.usage_limit,
      is_active: b.is_active, expires_at: b.expires_at || null,
    }, g.userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi server';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
