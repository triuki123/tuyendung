import { NextRequest, NextResponse } from 'next/server';
import { execute } from '@/lib/db';

/**
 * POST /api/push/unsubscribe — xoá đăng ký Web Push theo endpoint.
 * Body: { endpoint }
 */
export async function POST(request: NextRequest) {
  try {
    const { endpoint } = (await request.json()) || {};
    if (!endpoint) {
      return NextResponse.json({ error: 'Thiếu endpoint' }, { status: 400 });
    }
    await execute(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/push/unsubscribe error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
