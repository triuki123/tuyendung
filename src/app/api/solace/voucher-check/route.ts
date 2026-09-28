import { NextRequest, NextResponse } from 'next/server';
import { validateVoucher } from '@/lib/services/solaceVoucherService';
import { requireLogin } from '@/lib/solaceApiGuard';

// Kiểm tra mã giảm giá cho 1 subtotal (khách dùng khi đặt). Không tăng lượt dùng.
export async function POST(request: NextRequest) {
  try {
    const auth = requireLogin(request);
    if (auth instanceof NextResponse) return auth;
    const b = await request.json();
    const data = await validateVoucher(String(b.code ?? ''), Number(b.subtotal) || 0);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('POST /api/solace/voucher-check error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
