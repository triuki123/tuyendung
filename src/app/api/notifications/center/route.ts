import { NextRequest, NextResponse } from 'next/server';
import {
  getNotificationsPaged,
  getNotificationCounts,
  deleteReadNotifications,
  type ReadFilter,
} from '@/lib/services/notificationsService';
import type { CategoryKey } from '@/lib/notifications/categories';

/**
 * GET /api/notifications/center — danh sách thông báo cá nhân có phân trang + lọc.
 * Query: userId (bắt buộc), category, read (all|unread|read), q, page, limit.
 * Trả: { items, total, counts }.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const category = (searchParams.get('category') || 'all') as CategoryKey | 'all';
    const read = (searchParams.get('read') || 'all') as ReadFilter;
    const q = searchParams.get('q') || undefined;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const offset = (page - 1) * limit;

    const [{ items, total }, counts] = await Promise.all([
      getNotificationsPaged(userId, { category, read, q, limit, offset }),
      getNotificationCounts(userId),
    ]);

    // Ánh xạ sang camelCase cho client (giống /api/notifications).
    const mapped = items.map((n: any) => ({
      ...n,
      relatedId: n.related_id,
      relatedUrl: n.related_url,
    }));

    return NextResponse.json({ items: mapped, total, counts, page, limit });
  } catch (error) {
    console.error('GET /api/notifications/center error:', error);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * DELETE /api/notifications/center?userId=&scope=read — xoá thông báo đã đọc.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const scope = searchParams.get('scope') || 'read';
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    if (scope !== 'read') {
      return NextResponse.json({ error: 'scope không hợp lệ' }, { status: 400 });
    }
    await deleteReadNotifications(userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/notifications/center error:', error);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
