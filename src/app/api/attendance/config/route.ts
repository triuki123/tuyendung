import { NextRequest, NextResponse } from 'next/server';
import {
  resolveAttendanceConfig,
  resolveAttendanceConfigForUser,
} from '@/lib/services/attendanceSettingsService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/attendance/config?date=YYYY-MM-DD[&companyId=]
 * Trả về cấu hình chấm công đã resolve (merge DB lên mặc định) để client tính giờ/khung khớp server.
 * - Mặc định: theo công ty chính của user đang đăng nhập.
 * - Truyền companyId: resolve theo công ty đó (dùng cho trang cấu hình xem trước).
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa xác thực' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || undefined;
    const companyId = searchParams.get('companyId');

    const config = companyId !== null
      ? await resolveAttendanceConfig(companyId || null, date)
      : await resolveAttendanceConfigForUser(userId, date);

    return NextResponse.json({ success: true, data: config });
  } catch (err) {
    console.error('GET /api/attendance/config error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
