import { NextRequest, NextResponse } from 'next/server';
import { handleUpdate } from '@/lib/solace/solaceBotHandler';
import { requireHeaderSecret } from '@/lib/requestSecurity';

export const dynamic = 'force-dynamic';

/**
 * POST /api/solace/telegram/webhook — nhận update từ BOT SOLACE riêng.
 * Bảo mật: so khớp secret (SOLACE_BOT_WEBHOOK_SECRET) với header Telegram gửi kèm.
 * Luôn trả 200 để Telegram không retry dồn.
 */
export async function POST(request: NextRequest) {
  try {
    const secretGuard = requireHeaderSecret(
      request,
      'x-telegram-bot-api-secret-token',
      process.env.SOLACE_BOT_WEBHOOK_SECRET
    );
    if (secretGuard) return secretGuard;
    const update = await request.json().catch(() => null);
    if (update) await handleUpdate(update);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('POST /api/solace/telegram/webhook error:', err);
    return NextResponse.json({ ok: true });
  }
}
