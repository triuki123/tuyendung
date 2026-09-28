import { NextRequest, NextResponse } from 'next/server';
import { getRoomBookingSettings, updateRoomBookingSettings } from '@/lib/services/roomBookingSettingsService';

/**
 * GET /api/room-bookings/settings
 * Đọc cấu hình module Đặt Phòng Họp. Mọi user đã đăng nhập đều đọc được (frontend
 * dùng để check). Việc giới hạn UI Cấu Hình cho super_admin làm ở client + PUT.
 */
export async function GET() {
  try {
    const settings = await getRoomBookingSettings();
    return NextResponse.json({ success: true, data: settings });
  } catch (err) {
    console.error('GET /api/room-bookings/settings error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * PUT /api/room-bookings/settings
 * Cập nhật cấu hình. Chỉ super_admin.
 * Body: { notifyRecipients?: string[] }
 */
export async function PUT(request: NextRequest) {
  try {
    const role = request.headers.get('x-current-user-role');
    if (role !== 'super_admin') {
      return NextResponse.json({ error: 'Chỉ Quản trị tối cao mới được sửa cấu hình' }, { status: 403 });
    }
    const userId = request.headers.get('x-current-user-id') || '';
    const body = await request.json();

    const patch: { notifyRecipients?: string[] } = {};
    if (Array.isArray(body.notifyRecipients)) {
      // Lọc lấy chuỗi UUID hợp lệ — tránh ghi rác vào DB.
      patch.notifyRecipients = body.notifyRecipients
        .filter((v: unknown): v is string => typeof v === 'string' && v.length > 0);
    }

    const updated = await updateRoomBookingSettings(patch, userId);
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error('PUT /api/room-bookings/settings error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
