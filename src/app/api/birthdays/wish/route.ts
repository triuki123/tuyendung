import { NextRequest, NextResponse } from 'next/server';
import { sendWish } from '@/lib/services/birthdayService';

export const dynamic = 'force-dynamic';

/** POST /api/birthdays/wish — gửi lời chúc tới người sinh nhật. Body: { toUserId, message } */
export async function POST(request: NextRequest) {
  try {
    const fromUserId = request.headers.get('x-current-user-id');
    if (!fromUserId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const toUserId = typeof body?.toUserId === 'string' ? body.toUserId : '';
    const message = typeof body?.message === 'string' ? body.message : '';
    if (!toUserId) return NextResponse.json({ error: 'Thiếu người nhận' }, { status: 400 });

    const result = await sendWish(fromUserId, toUserId, message);
    if (!result.ok) return NextResponse.json({ error: result.error || 'Không gửi được' }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/birthdays/wish error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
