import { NextRequest, NextResponse } from 'next/server';
import { execute } from '@/lib/db';

/**
 * POST /api/push/subscribe — lưu đăng ký Web Push của 1 thiết bị.
 * Body: { userId, subscription: { endpoint, keys: { p256dh, auth } }, userAgent? }
 * Upsert theo endpoint (duy nhất) — subscribe lại không tạo trùng.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, subscription, userAgent } = body || {};
    const endpoint = subscription?.endpoint;
    const p256dh = subscription?.keys?.p256dh;
    const auth = subscription?.keys?.auth;

    if (!userId || !endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: 'Thiếu dữ liệu đăng ký' }, { status: 400 });
    }

    const id = `push_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await execute(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (endpoint) DO UPDATE
         SET user_id = EXCLUDED.user_id,
             p256dh  = EXCLUDED.p256dh,
             auth    = EXCLUDED.auth,
             user_agent = EXCLUDED.user_agent`,
      [id, userId, endpoint, p256dh, auth, userAgent ?? null],
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/push/subscribe error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
