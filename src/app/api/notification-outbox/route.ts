import { NextRequest, NextResponse } from 'next/server';
import { getOutboxStats, listRecentOutbox, retryOutboxItem, getNotificationReadStats } from '@/lib/services/notificationOutboxService';

export const dynamic = 'force-dynamic';

function isSuperAdmin(request: NextRequest): boolean {
  return (request.headers.get('x-current-user-role') || '') === 'super_admin';
}

/** GET /api/notification-outbox — thống kê + tin gần đây (super_admin). */
export async function GET(request: NextRequest) {
  try {
    if (!isSuperAdmin(request)) {
      return NextResponse.json({ error: 'Chỉ Super Admin được xem' }, { status: 403 });
    }
    const [stats, recent, readStats] = await Promise.all([
      getOutboxStats(), listRecentOutbox(), getNotificationReadStats(),
    ]);
    return NextResponse.json({ success: true, data: { stats, recent, readStats } });
  } catch (err) {
    console.error('GET /api/notification-outbox error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST /api/notification-outbox — { action: 'retry', id } đẩy lại 1 tin failed. */
export async function POST(request: NextRequest) {
  try {
    if (!isSuperAdmin(request)) {
      return NextResponse.json({ error: 'Chỉ Super Admin được thao tác' }, { status: 403 });
    }
    const body = await request.json();
    if (body.action === 'retry' && typeof body.id === 'string') {
      await retryOutboxItem(body.id);
      const [stats, recent] = await Promise.all([getOutboxStats(), listRecentOutbox()]);
      return NextResponse.json({ success: true, data: { stats, recent } });
    }
    return NextResponse.json({ error: 'Hành động không hợp lệ' }, { status: 400 });
  } catch (err) {
    console.error('POST /api/notification-outbox error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
