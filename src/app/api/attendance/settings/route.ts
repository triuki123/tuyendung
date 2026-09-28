import { NextRequest, NextResponse } from 'next/server';
import {
  listAttendanceSettings,
  saveAttendanceSettings,
} from '@/lib/services/attendanceSettingsService';
import { mergeAttendanceConfig } from '@/lib/config/attendanceConfig';

export const dynamic = 'force-dynamic';

function isSuperAdmin(request: NextRequest): boolean {
  return (request.headers.get('x-current-user-role') || '') === 'super_admin';
}

/** GET /api/attendance/settings?companyId= — danh sách phiên bản cấu hình (super_admin). */
export async function GET(request: NextRequest) {
  try {
    if (!isSuperAdmin(request)) {
      return NextResponse.json({ error: 'Chỉ Super Admin được xem cấu hình quy tắc' }, { status: 403 });
    }
    const companyId = request.nextUrl.searchParams.get('companyId') || null;
    const data = await listAttendanceSettings(companyId);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/attendance/settings error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST /api/attendance/settings — lưu 1 phiên bản cấu hình (super_admin). */
export async function POST(request: NextRequest) {
  try {
    if (!isSuperAdmin(request)) {
      return NextResponse.json({ error: 'Chỉ Super Admin được sửa cấu hình quy tắc' }, { status: 403 });
    }
    const actorId = request.headers.get('x-current-user-id');
    const body = await request.json();
    const { companyId, effectiveFrom, config, note } = body;
    if (!effectiveFrom || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      return NextResponse.json({ error: 'Ngày hiệu lực không hợp lệ (YYYY-MM-DD)' }, { status: 400 });
    }
    if (!config || typeof config !== 'object') {
      return NextResponse.json({ error: 'Thiếu cấu hình' }, { status: 400 });
    }

    // Merge lên mặc định để đảm bảo đủ field, rồi validate logic.
    const merged = mergeAttendanceConfig(config);
    const err = validateConfig(merged);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    const saved = await saveAttendanceSettings({
      companyId: companyId || null,
      effectiveFrom,
      config: merged,
      note: note ?? null,
      createdBy: actorId,
    });
    return NextResponse.json({ success: true, data: saved });
  } catch (err) {
    console.error('POST /api/attendance/settings error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** Validate logic cấu hình — trả về thông báo lỗi (tiếng Việt) hoặc null nếu hợp lệ. */
function validateConfig(c: ReturnType<typeof mergeAttendanceConfig>): string | null {
  const inRange = (n: number, lo: number, hi: number) => Number.isFinite(n) && n >= lo && n <= hi;
  const annual = c.annualLeavePolicy;
  if (!inRange(annual.baseDaysPerYear, 0, 366)) return 'Hạn mức phép năm phải trong khoảng 0–366 ngày';
  if (!inRange(annual.accrualDay, 1, 31)) return 'Ngày cấp phép hằng tháng phải trong khoảng 1–31';
  if (!inRange(annual.seniorityBonusDays, 0, 366)) return 'Số ngày phép thâm niên không hợp lệ';
  if (!inRange(annual.seniorityEveryYears, 1, 100)) return 'Chu kỳ thâm niên phải trong khoảng 1–100 năm';
  if (!inRange(annual.carryoverMaxDays, 0, 366)) return 'Số phép chuyển năm không hợp lệ';
  if (!/^\d{2}-\d{2}$/.test(annual.carryoverExpiryMMDD)) return 'Ngày hết hạn phép chuyển năm phải có dạng MM-DD';
  const [expiryMonth, expiryDay] = annual.carryoverExpiryMMDD.split('-').map(Number);
  if (!inRange(expiryMonth, 1, 12) || !inRange(expiryDay, 1, 31)) return 'Ngày hết hạn phép chuyển năm không hợp lệ';
  // Ngày bắt đầu 1–28 (1 = theo tháng dương lịch; >1 = cross-month). Không cho 29–31
  // để tránh tháng ngắn thiếu ngày bắt đầu.
  if (!inRange(c.payrollStartDay, 1, 28)) return 'Ngày bắt đầu kỳ công phải trong khoảng 1–28';
  // Ngày cuối kỳ 1–31 (sẽ tự kẹp về ngày cuối tháng). Bỏ qua nếu bật "ngày cuối tháng".
  if (!c.payrollEndDayIsLastOfMonth && !inRange(c.payrollEndDay, 1, 31))
    return 'Ngày cuối kỳ công phải trong khoảng 1–31 (hoặc bật "ngày cuối tháng")';
  if (!inRange(c.lunchStartHour, 0, 23) || !inRange(c.lunchEndHour, 0, 24) || c.lunchStartHour >= c.lunchEndHour)
    return 'Giờ nghỉ trưa không hợp lệ (giờ bắt đầu phải trước giờ kết thúc)';
  if (!inRange(c.fullWorkdayMinutes, 1, 1440)) return 'Ngưỡng đủ công (phút) phải trong khoảng 1–1440';
  const w = c.punchWindows;
  if (!(w.checkInStart < w.checkInEnd && w.checkInEnd <= w.checkOutStart))
    return 'Khung phân loại chấm không hợp lệ (vào < hết-vào ≤ bắt-đầu-ra)';
  // Ngày hạn 1–31 (tự kẹp về ngày cuối tháng khi tháng ngắn hơn); giờ 0–23; phút 0–59.
  if (!inRange(c.adjustmentDeadline.day, 1, 31) || !inRange(c.adjustmentDeadline.hour, 0, 23) || !inRange(c.adjustmentDeadline.minute ?? 0, 0, 59))
    return 'Hạn bù công không hợp lệ (ngày 1–31, giờ 0–23, phút 0–59)';
  if (!inRange(c.sheetSubmitDeadline.day, 1, 31) || !inRange(c.sheetSubmitDeadline.hour, 0, 23) || !inRange(c.sheetSubmitDeadline.minute ?? 0, 0, 59))
    return 'Hạn nộp bảng công không hợp lệ (ngày 1–31, giờ 0–23, phút 0–59)';
  if (!inRange(c.adjustmentSameDayEarliestHour, 0, 23)) return 'Giờ sớm nhất gửi bù công không hợp lệ';
  // Lịch giờ làm theo tuần (7 phần tử; ngày MỞ phải có giờ vào < giờ ra, trong 0–1439).
  if (c.weeklySchedule !== undefined) {
    if (!Array.isArray(c.weeklySchedule) || c.weeklySchedule.length !== 7)
      return 'Lịch giờ làm trong tuần phải đủ 7 ngày';
    for (const s of c.weeklySchedule) {
      if (s.open && !(inRange(s.startMin, 0, 1439) && inRange(s.endMin, 1, 1440) && s.startMin < s.endMin))
        return 'Giờ làm trong tuần không hợp lệ (giờ vào phải trước giờ ra)';
    }
  }
  // Khung buổi sáng / chiều (nếu có).
  for (const [label, ses] of [['sáng', c.morningSession], ['chiều', c.afternoonSession]] as const) {
    if (ses && !(inRange(ses.startMin, 0, 1439) && inRange(ses.endMin, 1, 1440) && ses.startMin < ses.endMin))
      return `Khung buổi ${label} không hợp lệ (bắt đầu phải trước kết thúc)`;
  }
  // Nghỉ nửa buổi cố định (nếu bật): 0 < giá trị ≤ 1 ngày.
  if (c.halfDayLeaveValue != null && !(typeof c.halfDayLeaveValue === 'number' && c.halfDayLeaveValue > 0 && c.halfDayLeaveValue <= 1))
    return 'Số ngày phép trừ mỗi buổi phải trong khoảng 0–1';
  const ot = c.overtimeBrackets;
  if (!(ot.eveningStartMin < ot.eveningEndMin && ot.eveningEndMin < ot.nightEndMin))
    return 'Khung tăng ca không hợp lệ (tối-bắt-đầu < tối-kết-thúc < đêm-kết-thúc)';
  return null;
}
