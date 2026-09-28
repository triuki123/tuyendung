/**
 * ADMS Adapter — Ronald Jack / ZKTeco attendance machines
 *
 * Máy Ronald Jack giao tiếp theo giao thức ADMS:
 *   GET  /api/attendance/adms?SN={serial}             — handshake, trả cấu hình
 *   POST /api/attendance/adms?SN={serial}&table=ATTLOG — máy đẩy dữ liệu chấm công
 *
 * Cấu hình trên máy Ronald Jack:
 *   Địa chỉ máy chủ : assetflow.fadoai.com
 *   Cổng             : 443
 *   Đường dẫn (URI)  : /api/attendance/adms
 *   HTTPS            : Bật
 *   Realtime         : Bật
 */

import { NextRequest, NextResponse } from 'next/server';
import * as attendanceService from '@/lib/services/attendanceService';
import * as mappingService from '@/lib/services/machineMappingService';
import * as adjustmentService from '@/lib/services/attendanceAdjustmentService';
import { getMachineById, updateLastSync } from '@/lib/services/machineService';
import { attendanceBroadcaster } from '@/lib/attendanceBroadcaster';
import {
  sendAttendanceCheckinNotification,
  sendAttendanceCheckoutNotification,
} from '@/lib/services/notificationsService';

/**
 * Xác định machine_id cho dữ liệu push:
 * 1. SN máy gửi lên khớp với "Mã máy" đã khai báo trong webapp → dùng SN đó
 *    (hỗ trợ NHIỀU máy push, mỗi máy nhận đúng dữ liệu của mình).
 * 2. SN không khớp máy nào → fallback ADMS_MACHINE_ID (tương thích hệ 1 máy cũ,
 *    SN thật của máy khác với mã đã đặt).
 * 3. Không có env → dùng SN thô.
 */
async function resolveMachineId(sn: string | null): Promise<string> {
  if (sn) {
    const m = await getMachineById(sn).catch(() => null);
    if (m) return m.id;
  }
  return process.env.ADMS_MACHINE_ID || sn || 'default';
}

// ─── GET: Máy handshake — trả về cấu hình cho máy ───────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sn = searchParams.get('SN') ?? 'UNKNOWN';

  console.log(`[ADMS] Handshake từ máy SN=${sn}`);

  // Máy bắt tay được = máy online → cập nhật status/last_sync để UI hiện Online
  resolveMachineId(searchParams.get('SN'))
    .then((mid) => updateLastSync(mid))
    .catch(() => {});

  // Response chuẩn ADMS — máy đọc các thông số này
  const config = [
    `GET OPTION FROM: ${sn}`,
    `ATTLOGStamp=9999999999`,
    `OPERLOGStamp=9999999999`,
    `ATTPHOTOStamp=9999999999`,
    `ErrorDelay=30`,
    `Delay=10`,
    `TransTimes=00:00;14:05`,
    `TransInterval=1`,
    `TransFlag=1111000000`,
    `TimeZone=7`,       // GMT+7 (Việt Nam)
    `Realtime=1`,       // Đẩy realtime
    `Encrypt=None`,
    `ServerVer=2.4.1 2015-04-14`,
    `PushProtVer=2.4.1 2015-04-14`,
  ].join('\n');

  return new NextResponse(config, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

// ─── POST: Máy đẩy dữ liệu chấm công ────────────────────────────────────────
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  // SN khớp máy đã khai báo → dùng SN (đa máy); không khớp → fallback ADMS_MACHINE_ID (hệ 1 máy cũ)
  const machineId = await resolveMachineId(searchParams.get('SN'));
  const table     = searchParams.get('table') ?? '';

  // Chỉ xử lý bảng ATTLOG (attendance log)
  if (table !== 'ATTLOG') {
    return new NextResponse('OK', {
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  const body = await request.text();
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);

  console.log(`[ADMS] Máy SN=${machineId} đẩy ${lines.length} bản ghi`);

  let processed = 0;
  let skipped   = 0;

  for (const line of lines) {
    try {
      // Format: PIN\tDATETIME\tSTATUS\tVERIFY\tWORKCODE\n
      const parts = line.split('\t');
      if (parts.length < 2) continue;

      const employeeCode = parts[0].trim();
      const datetimeStr  = parts[1].trim(); // "2026-06-05 08:23:45"
      const attStatus    = parseInt(parts[2] ?? '0', 10);

      // Chuyển datetime string từ máy → ISO string (đúng thời gian punch)
      const punchTime = parseDateTime(datetimeStr);

      // Ghi punch THÔ vào device_punches (Projection Model, canonical machine_id)
      const isNew = await attendanceService.recordDevicePunch({
        machine_id:    machineId,
        employee_code: employeeCode,
        punch_time:    punchTime,
        raw_status:    attStatus,
      });

      if (!isNew) { skipped++; continue; } // đã có → bỏ qua

      // Tra mapping (chỉ ĐỌC) để quyết định side-effects
      let userId = await mappingService
        .lookupUserId(machineId, employeeCode, punchTime)
        .catch(() => null);

      // AUTO-MAPPING: Nếu không có mapping, tìm user từ employee_code
      if (!userId) {
        userId = await autoMapFromEmployeeCode(machineId, employeeCode, punchTime).catch(() => null);
      }

      if (userId) {
        // Nhãn vào/ra dùng CHUNG bộ não với bảng công (classifyDayRecords day-aware),
        // thống nhất với Pull và không phụ thuộc raw_status của máy. Punch đã ghi vào
        // device_punches ở trên nên có mặt trong tập ngày → nhãn khớp bảng công.
        const eventType = await attendanceService.classifyPunchForUser(userId, punchTime);

        attendanceService.refreshSheetStatsAsync(userId, punchTime).catch(console.error);

        // Broadcast SSE → UI webapp cập nhật realtime ngay khi máy đẩy punch
        const userInfo = await getUserName(userId);
        attendanceBroadcaster.broadcast({
          type: eventType,
          user_id: userId,
          user_name: userInfo ?? undefined,
          recorded_at: punchTime,
          machine_id: machineId,
          timestamp: Date.now(),
        });

        // Auto-resolve Bù Công nếu vân tay đã về (giống poller)
        const workDateStr = new Date(punchTime)
          .toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
        adjustmentService
          .autoResolveAdjustments(userId, workDateStr, eventType)
          .catch((err) => console.error('[ADMS] autoResolve error:', err));

        // In-app + Telegram qua engine (nội dung cá nhân hoá trong templates.ts).
        // Truyền giờ chấm THẬT tại máy (punchTime) vì máy có thể đẩy trễ.
        const punchAt = new Date(punchTime);
        if (eventType === 'check_in') sendAttendanceCheckinNotification(userId, 'machine', userInfo ?? undefined, punchAt).catch(console.error);
        else sendAttendanceCheckoutNotification(userId, 'machine', userInfo ?? undefined, punchAt).catch(console.error);
      }
      processed++;

    } catch (lineErr) {
      console.error(`[ADMS] Lỗi xử lý dòng: ${line}`, lineErr);
    }
  }

  console.log(`[ADMS] Xử lý xong: ${processed} punch mới, ${skipped} đã có/bỏ qua`);

  // Máy push dữ liệu về thành công → cập nhật last_sync/status cho UI
  updateLastSync(machineId).catch(() => {});

  // Response chuẩn ADMS — máy nhận OK mới dừng gửi lại
  return new NextResponse(`OK: ${processed}`, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

/** Parse datetime string từ máy: "2026-06-05 08:23:45" → ISO string */
function parseDateTime(str: string): string {
  try {
    // Máy Ronald Jack gửi giờ theo múi giờ máy (đã cài GMT+7)
    // Thêm offset để lưu đúng UTC
    const [datePart, timePart] = str.split(' ');
    return new Date(`${datePart}T${timePart}+07:00`).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

/** Lấy tên user để broadcast SSE */
async function getUserName(userId: string): Promise<string | null> {
  try {
    const { queryOne } = await import('@/lib/db');
    const user = await queryOne<{ name: string }>(
      `SELECT name FROM users WHERE id = $1`,
      [userId]
    );
    return user?.name ?? null;
  } catch {
    return null;
  }
}

/** AUTO-MAPPING: Tìm user từ employee_code, tạo mapping tự động */
async function autoMapFromEmployeeCode(
  machineId: string,
  employeeCode: string,
  punchTime: string
): Promise<string | null> {
  try {
    const { queryOne } = await import('@/lib/db');

    // Tìm user có employee_code khớp
    const user = await queryOne<{ id: string }>(
      `SELECT id FROM users WHERE employee_code = $1 AND status = 'active' LIMIT 1`,
      [employeeCode]
    );

    if (!user) return null;

    // Tạo mapping tự động (mode = 'assign')
    const mapping = await mappingService.upsertMapping({
      machine_id: machineId,
      employee_code: employeeCode,
      user_id: user.id,
      mode: 'assign',
      created_by: 'system',
    });

    console.log(`[ADMS] AUTO-MAPPED: ${employeeCode} → ${user.id}`);
    return user.id;
  } catch (err) {
    console.error(`[ADMS] autoMapFromEmployeeCode error:`, err);
    return null;
  }
}

