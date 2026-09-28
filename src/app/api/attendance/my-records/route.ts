import { NextRequest, NextResponse } from 'next/server';
import * as attendanceService from '@/lib/services/attendanceService';
import { resolveAttendanceConfigForUser } from '@/lib/services/attendanceSettingsService';

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa xác thực' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    // Dùng timezone VN để lấy tháng/năm mặc định đúng, tránh lệch ngày qua UTC
    const nowVN = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    const [defYear, defMonth] = nowVN.split('-').map(Number);
    const month = parseInt(searchParams.get('month') ?? String(defMonth));
    const year  = parseInt(searchParams.get('year')  ?? String(defYear));

    // Cấu hình theo công ty user, neo vào ngày 15 của kỳ (luôn nằm trong kỳ công).
    const cfg = await resolveAttendanceConfigForUser(userId, `${year}-${String(month).padStart(2, '0')}-15`);
    // getMonthlyDays = records (app + máy) → nhóm ngày → áp cờ "Mặc Định Đủ Công".
    const days    = await attendanceService.getMonthlyDays(userId, month, year, cfg);
    const sheet   = await attendanceService.getOrCreateSheet(userId, month, year);
    const stats   = attendanceService.calcSheetStats(days);

    await attendanceService.updateSheetStats(sheet.id, stats);

    return NextResponse.json({ success: true, data: { days, sheet: { ...sheet, ...stats } } });
  } catch (err) {
    console.error('GET /api/attendance/my-records error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
