import { NextRequest, NextResponse } from 'next/server';
import { registerMainWebhook, getWebhookInfo, setBookingCommands } from '@/lib/telegram/bookingBot';

/**
 * POST /api/telegram/setup-booking — (super_admin) đăng ký lại webhook bot chính
 * để nhận cả 'message' (lệnh /booking) + 'callback_query', và set lệnh menu /booking.
 * Chạy 1 lần sau khi deploy luồng đặt phòng qua Telegram. Idempotent.
 */
export async function POST(request: NextRequest) {
  try {
    const role = request.headers.get('x-current-user-role');
    if (role !== 'super_admin') {
      return NextResponse.json({ error: 'Chỉ super_admin' }, { status: 403 });
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://assetflow.fadoai.com';
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET || undefined;

    const reg = await registerMainWebhook(`${appUrl}/api/telegram/webhook`, secret);
    await setBookingCommands();
    const info = await getWebhookInfo();

    return NextResponse.json({
      success: reg.ok,
      data: { setWebhook: reg, webhookInfo: info.result ?? null },
    });
  } catch (err) {
    console.error('POST /api/telegram/setup-booking error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
