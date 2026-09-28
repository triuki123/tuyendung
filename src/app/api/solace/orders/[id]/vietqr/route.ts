import { NextRequest, NextResponse } from 'next/server';
import { getOrder } from '@/lib/services/solaceOrderService';
import { getBankConfig } from '@/lib/services/solaceSettingsService';
import { buildVietQrPayload } from '@/lib/vietqr';
import { guardSolace } from '@/lib/solaceApiGuard';

// Sinh payload VietQR chuyển khoản cho 1 đơn (số tiền còn phải thu + nội dung = mã đơn).
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guardSolace(request, 'solace-pos', 'view');
    if (g instanceof NextResponse) return g;
    const order = await getOrder(params.id);
    if (!order) return NextResponse.json({ error: 'Không tìm thấy đơn' }, { status: 404 });

    const bank = await getBankConfig();
    const amount = Number(order.total) - Number(order.paid_amount);
    const payload = buildVietQrPayload({
      bankBin: bank.bankBin, accountNo: bank.accountNo,
      amount: amount > 0 ? amount : undefined,
      addInfo: order.code ?? undefined,
    });
    if (!payload) {
      return NextResponse.json({ error: 'Chưa cấu hình tài khoản ngân hàng (Cấu Hình Quán)' }, { status: 400 });
    }
    return NextResponse.json({
      success: true,
      data: { payload, amount, accountNo: bank.accountNo, accountName: bank.accountName, bankBin: bank.bankBin, addInfo: order.code },
    });
  } catch (err) {
    console.error('GET /api/solace/orders/[id]/vietqr error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
