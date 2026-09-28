import { NextRequest, NextResponse } from 'next/server';
import { getOrder } from '@/lib/services/solaceOrderService';
import { getBankConfig } from '@/lib/services/solaceSettingsService';
import { buildVietQrPayload } from '@/lib/vietqr';
import { requireLogin } from '@/lib/solaceApiGuard';

// Khách tự lấy VietQR chuyển khoản cho ĐƠN CỦA CHÍNH MÌNH (số tiền còn nợ + nội dung = mã đơn).
// Không tự xác nhận thanh toán — nhân viên xác nhận khi nhận được tiền.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = requireLogin(request);
    if (auth instanceof NextResponse) return auth;

    const order = await getOrder(params.id);
    if (!order) return NextResponse.json({ error: 'Không tìm thấy đơn' }, { status: 404 });
    if (!order.customer_user_id || order.customer_user_id !== auth.userId) {
      return NextResponse.json({ error: 'Không phải đơn của bạn' }, { status: 403 });
    }

    const bank = await getBankConfig();
    const amount = Number(order.total) - Number(order.paid_amount);
    const payload = buildVietQrPayload({
      bankBin: bank.bankBin, accountNo: bank.accountNo,
      amount: amount > 0 ? amount : undefined,
      addInfo: order.code ?? undefined,
    });
    if (!payload) {
      return NextResponse.json({ error: 'Quán chưa cấu hình tài khoản ngân hàng' }, { status: 400 });
    }
    return NextResponse.json({
      success: true,
      data: { payload, amount, accountNo: bank.accountNo, accountName: bank.accountName, bankBin: bank.bankBin, addInfo: order.code },
    });
  } catch (err) {
    console.error('GET /api/solace/my-orders/[id]/vietqr error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
