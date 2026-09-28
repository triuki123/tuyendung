import { NextRequest, NextResponse } from 'next/server';
import { getWarehouseByCode } from '@/lib/services/warehouseService';
import { qrToken } from '@/lib/warehouse/workerAuth';

export const dynamic = 'force-dynamic';

/**
 * GET: token QR động của kho (?wh=CODE) — public, dùng cho màn hình treo ở cổng
 * (/warehouse/gate). Token xoay mỗi 10 phút, chỉ có giá trị khi kèm ảnh selfie
 * lúc check-in nên rủi ro lộ token là chấp nhận được.
 */
export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('wh');
    if (!code) return NextResponse.json({ error: 'Thiếu mã kho' }, { status: 400 });
    const wh = await getWarehouseByCode(code);
    if (!wh) return NextResponse.json({ error: 'Không tìm thấy kho' }, { status: 404 });
    return NextResponse.json({
      success: true,
      data: { warehouse_name: wh.name, token: qrToken(wh.id), qr_value: `whqr:${wh.code}:${qrToken(wh.id)}` },
    });
  } catch (err) {
    console.error('GET /api/warehouse/gate-qr error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
