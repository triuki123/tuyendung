import { NextRequest, NextResponse } from 'next/server';
import {
  getHrNotifyRecipientUserIds,
  setHrNotifyRecipientUserIds,
} from '@/lib/services/hrSettingsService';

/**
 * GET  /api/hr/settings/notify-recipients
 *   Trả về danh sách user_id đã cấu hình ở tab Cài Đặt → Người Nhận Thông Báo.
 *
 * PUT  /api/hr/settings/notify-recipients
 *   Body: { userIds: string[] }. CHỈ super_admin được sửa.
 */

export async function GET() {
  try {
    const userIds = await getHrNotifyRecipientUserIds();
    return NextResponse.json({ success: true, data: { userIds } });
  } catch (err) {
    console.error('GET /api/hr/settings/notify-recipients error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const role = request.headers.get('x-current-user-role');
    if (role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Chỉ Quản trị tối cao mới được sửa cấu hình' },
        { status: 403 }
      );
    }
    const body = await request.json();
    if (!Array.isArray(body.userIds)) {
      return NextResponse.json({ error: 'Thiếu hoặc sai field userIds' }, { status: 400 });
    }
    const clean = body.userIds.filter((v: unknown): v is string => typeof v === 'string' && v.length > 0);
    await setHrNotifyRecipientUserIds(clean);
    return NextResponse.json({ success: true, data: { userIds: clean } });
  } catch (err) {
    console.error('PUT /api/hr/settings/notify-recipients error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
