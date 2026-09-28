import { NextRequest, NextResponse } from 'next/server';
import { listVariantsForUser } from '@/lib/services/ecardService';

export const dynamic = 'force-dynamic';

/** GET /api/ecard — biến thể hồ sơ năng lực của chính mình. */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const variants = await listVariantsForUser(userId);
    return NextResponse.json({ success: true, data: variants });
  } catch (err) {
    console.error('GET /api/ecard error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
