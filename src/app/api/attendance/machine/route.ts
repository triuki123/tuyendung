import { NextRequest, NextResponse } from 'next/server';
import * as attendanceService from '@/lib/services/attendanceService';
import * as mappingService from '@/lib/services/machineMappingService';
import {
  sendAttendanceCheckinNotification,
  sendAttendanceCheckoutNotification,
} from '@/lib/services/notificationsService';

/**
 * Endpoint cho máy chấm công đẩy dữ liệu lên.
 *
 * Body: {
 *   machine_id:     string   — mã máy (khớp với cấu hình mapping)
 *   employee_code:  string   — mã nhân viên trên máy
 *   event_type:     'in'|'out'|'check_in'|'check_out'
 *   recorded_at?:   ISO8601  — nếu máy gửi timestamp của nó, dùng luôn
 * }
 * Header: x-machine-key — API key bảo mật (set trong .env ATTENDANCE_MACHINE_KEY)
 */
export async function POST(request: NextRequest) {
  try {
    // Xác thực API key
    const machineKey  = request.headers.get('x-machine-key');
    const expectedKey = process.env.ATTENDANCE_MACHINE_KEY;
    if (expectedKey && machineKey !== expectedKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { machine_id, employee_code, event_type, recorded_at } = body;

    if (!employee_code || !event_type) {
      return NextResponse.json(
        { error: 'Thiếu employee_code hoặc event_type' },
        { status: 400 }
      );
    }

    // machine_id thật của máy (fallback canonical nếu máy cũ không gửi)
    const machineId = machine_id || attendanceService.CANONICAL_MACHINE_ID;

    // Chuẩn hóa event_type (chỉ dùng cho notify; KHÔNG lưu — read-path tự phân loại)
    const normalizedEvent: 'check_in' | 'check_out' =
      event_type === 'out' || event_type === 'check_out' ? 'check_out' : 'check_in';

    const punchTime = recorded_at ?? new Date().toISOString();

    // ── Ghi punch THÔ vào device_punches (Projection Model) ──
    const isNew = await attendanceService.recordDevicePunch({
      machine_id:    machineId,
      employee_code,
      punch_time:    punchTime,
    });

    // Tra mapping (chỉ ĐỌC) để quyết định side-effects
    const userId = await mappingService
      .lookupUserId(machineId, employee_code, punchTime)
      .catch(() => null);

    if (isNew && userId) {
      attendanceService.refreshSheetStatsAsync(userId, punchTime).catch(console.error);
      // In-app + Telegram qua engine (nội dung cá nhân hoá trong templates.ts).
      // Dùng giờ chấm THẬT tại máy (punchTime).
      const punchAt = new Date(punchTime);
      if (normalizedEvent === 'check_in') sendAttendanceCheckinNotification(userId, 'machine', undefined, punchAt).catch(console.error);
      else sendAttendanceCheckoutNotification(userId, 'machine', undefined, punchAt).catch(console.error);
    }

    return NextResponse.json(
      { success: true, is_new: isNew, mapped: !!userId },
      { status: 201 }
    );
  } catch (err) {
    console.error('POST /api/attendance/machine error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
