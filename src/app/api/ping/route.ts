import { NextRequest, NextResponse } from 'next/server';
import { execute } from '@/lib/db';

// Throttle: không UPDATE quá 1 lần / THROTTLE_MS / user (tránh hammer DB)
const THROTTLE_MS = 5 * 60 * 1000; // 5 phút
const lastPingMap = new Map<string, number>();

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) return NextResponse.json({ ok: false }, { status: 401 });

    const now = Date.now();
    const last = lastPingMap.get(userId) ?? 0;
    if (now - last < THROTTLE_MS) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    lastPingMap.set(userId, now);
    await execute(
      `UPDATE users SET last_active = NOW() WHERE id::text = $1`,
      [userId]
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('POST /api/ping error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
