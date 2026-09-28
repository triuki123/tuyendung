import { NextRequest, NextResponse } from 'next/server';
import { getOrder } from '@/lib/services/solaceOrderService';
import { getBankConfig } from '@/lib/services/solaceSettingsService';
import { buildVietQrPayload } from '@/lib/vietqr';

// Trạng thái đơn khách vãng lai (PUBLIC) — chỉ trả đơn kênh 'guest', kèm VietQR nếu còn phải trả.
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const o = await getOrder(params.id);
    // Chỉ cho xem đơn kênh guest (chống đoán id để lộ đơn nội bộ).
    if (!o || o.channel !== 'guest') return NextResponse.json({ error: 'Không tìm thấy đơn' }, { status: 404 });

    const due = Number(o.total) - Number(o.paid_amount);
    let vietqr: { payload: string; accountNo: string; accountName: string; addInfo: string | null } | null = null;
    if (o.payment_method === 'bankqr' && o.payment_status !== 'paid' && due > 0) {
      const bank = await getBankConfig();
      const payload = buildVietQrPayload({ bankBin: bank.bankBin, accountNo: bank.accountNo, amount: due, addInfo: o.code ?? undefined });
      if (payload) vietqr = { payload, accountNo: bank.accountNo, accountName: bank.accountName, addInfo: o.code };
    }

    return NextResponse.json({
      success: true,
      data: {
        id: o.id, code: o.code, status: o.status,
        payment_method: o.payment_method, payment_status: o.payment_status,
        total: o.total, paid_amount: o.paid_amount,
        fulfillment_type: o.fulfillment_type, floor_note: o.floor_note, created_at: o.created_at,
        items: (o.items ?? []).map(it => ({
          name: it.name_snapshot, qty: it.qty,
          options: Array.isArray(it.options_json) ? (it.options_json as Array<{ name: string }>).map(x => x.name) : [],
        })),
        vietqr,
      },
    });
  } catch (err) {
    console.error('GET /api/solace/guest/orders/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
