import { NextRequest, NextResponse } from 'next/server';
import {
  getUserPreferences,
  setUserPreference,
  type PrefChannel,
} from '@/lib/services/notificationPreferenceService';

/**
 * GET /api/notifications/preferences?userId= → danh sách kênh ĐANG TẮT của user
 * (mỗi phần tử { event_key, channel }). Không có = mặc định bật.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = new URL(request.url).searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    const disabled = await getUserPreferences(userId);
    return NextResponse.json({ disabled });
  } catch (error) {
    console.error('GET /api/notifications/preferences error:', error);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * PUT /api/notifications/preferences — bật/tắt 1 tùy chọn.
 * Body: { userId, eventKey, channel: 'telegram'|'webpush', enabled: boolean }
 */
export async function PUT(request: NextRequest) {
  try {
    const { userId, eventKey, channel, enabled } = (await request.json()) || {};
    if (!userId || !eventKey || (channel !== 'telegram' && channel !== 'webpush')) {
      return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
    }
    await setUserPreference(userId, eventKey, channel as PrefChannel, !!enabled);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT /api/notifications/preferences error:', error);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
