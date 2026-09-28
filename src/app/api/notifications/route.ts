import {
  getUserNotifications,
  getUnreadNotificationCount,
  markAllNotificationsAsRead,
} from '@/lib/services/notificationsService';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const countOnly = searchParams.get('count') === 'true';

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    if (countOnly) {
      const count = await getUnreadNotificationCount(userId);
      return NextResponse.json({ count });
    }

    const notifications = await getUserNotifications(userId, unreadOnly);

    // Map DB fields (snake_case) to client format (camelCase)
    const mappedNotifications = notifications.map((notif: any) => ({
      ...notif,
      relatedId: notif.related_id,
      relatedUrl: notif.related_url,
    }));

    return NextResponse.json(mappedNotifications);
  } catch (error) {
    console.error('Notifications fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    await markAllNotificationsAsRead(userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Mark all notifications error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to mark notifications' },
      { status: 500 }
    );
  }
}
