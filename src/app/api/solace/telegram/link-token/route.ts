import { NextRequest, NextResponse } from 'next/server';
import { createLinkToken } from '@/lib/solace/solaceBotService';
import { requireLogin } from '@/lib/solaceApiGuard';

// Tạo deep-link liên kết bot Solace cho user đang đăng nhập.
export async function POST(request: NextRequest) {
  try {
    const auth = requireLogin(request);
    if (auth instanceof NextResponse) return auth;
    const tok = await createLinkToken(auth.userId);
    const username = process.env.SOLACE_BOT_USERNAME || 'solacecoffeebot';
    return NextResponse.json({ success: true, data: { deepLink: `https://t.me/${username}?start=${tok}` } });
  } catch (err) {
    console.error('POST /api/solace/telegram/link-token error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
