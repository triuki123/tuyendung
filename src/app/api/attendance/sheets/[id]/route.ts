import { NextRequest, NextResponse } from 'next/server';
import * as attendanceService from '@/lib/services/attendanceService';
import { ResolvedAttendanceConfig, resolveDeadlineDate } from '@/lib/config/attendanceConfig';
import { resolveAttendanceConfigForUser } from '@/lib/services/attendanceSettingsService';

/** Deadline nộp bảng công (mặc định 11:00 ngày 28). KHÁC hạn bù công (27 17:00).
 *  Ngày hạn kẹp về ngày cuối tháng; hỗ trợ phút. */
function getDeadline(month: number, year: number, cfg: ResolvedAttendanceConfig): Date {
  // Xét cờ nextMonth: hạn có thể rơi sang tháng kế tiếp của kỳ.
  const dl = resolveDeadlineDate(month, year, cfg.sheetSubmitDeadline);
  const dd = String(dl.day).padStart(2, '0');
  const hh = String(cfg.sheetSubmitDeadline.hour).padStart(2, '0');
  const mm = String(cfg.sheetSubmitDeadline.minute ?? 0).padStart(2, '0');
  // VD: 2026-06-28T11:00:00+07:00 (hoặc 2026-07-01 nếu nextMonth)
  return new Date(`${dl.year}-${String(dl.month).padStart(2, '0')}-${dd}T${hh}:${mm}:00+07:00`);
}

function isPastDeadline(month: number, year: number, cfg: ResolvedAttendanceConfig): boolean {
  return new Date() > getDeadline(month, year, cfg);
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa xác thực' }, { status: 401 });

    const body = await request.json();
    const { action, month, year } = body;

    // Cấu hình theo công ty user, neo vào ngày 15 của kỳ.
    const cfg = (month && year)
      ? await resolveAttendanceConfigForUser(userId, `${year}-${String(month).padStart(2, '0')}-15`)
      : (await import('@/lib/config/attendanceConfig')).DEFAULT_ATTENDANCE_CONFIG;

    if (action === 'submit') {
      if (month && year && isPastDeadline(Number(month), Number(year), cfg)) {
        return NextResponse.json({ error: `Đã quá hạn nộp bảng công (${String(cfg.sheetSubmitDeadline.hour).padStart(2, '0')}:${String(cfg.sheetSubmitDeadline.minute ?? 0).padStart(2, '0')} ngày ${cfg.sheetSubmitDeadline.day})` }, { status: 400 });
      }
      const sheet = await attendanceService.submitSheet(params.id);
      if (!sheet) return NextResponse.json({ error: 'Không thể submit' }, { status: 400 });
      return NextResponse.json({ success: true, data: sheet });
    }

    if (action === 'cancel') {
      if (month && year && isPastDeadline(Number(month), Number(year), cfg)) {
        return NextResponse.json({ error: 'Đã quá hạn, không thể huỷ nộp' }, { status: 400 });
      }
      const sheet = await attendanceService.cancelSheet(params.id, userId);
      if (!sheet) return NextResponse.json({ error: 'Không thể huỷ nộp' }, { status: 400 });
      return NextResponse.json({ success: true, data: sheet });
    }

    if (action === 'approve' || action === 'reject') {
      // Đã bỏ luồng duyệt bảng công thủ công: quản lý CHỈ XEM, hệ thống tự chốt &
      // gửi về Bộ Phận Chấm Công khi tới hạn nộp (attendanceAutoSendScheduler).
      return NextResponse.json(
        { error: 'Bảng công không còn duyệt thủ công — hệ thống tự chốt & gửi khi tới hạn nộp.' },
        { status: 403 }
      );
    }

    return NextResponse.json({ error: 'Action không hợp lệ' }, { status: 400 });
  } catch (err) {
    console.error('PUT /api/attendance/sheets/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
