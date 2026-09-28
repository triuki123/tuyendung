import { NextRequest, NextResponse } from 'next/server';
import { verifyBmhsPassword } from '@/lib/services/bmhsService';
import { issueUnlockToken } from '@/lib/bmhs/token';

export const dynamic = 'force-dynamic';

/**
 * POST /api/users/[id]/bmhs/verify — nhập mật khẩu để mở khóa 1 lần.
 * Đúng → trả vé mở khóa ngắn hạn (60s) cho cặp (người xem, hồ sơ).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const password = String(body.password || '');
    const ok = await verifyBmhsPassword(params.id, password);
    if (!ok) return NextResponse.json({ error: 'Mật khẩu không đúng' }, { status: 401 });

    const token = issueUnlockToken(userId, params.id);
    return NextResponse.json({ success: true, token });
  } catch (err) {
    console.error('POST bmhs verify error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
