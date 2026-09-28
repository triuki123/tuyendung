import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { resolveAttendanceConfig } from '@/lib/services/attendanceSettingsService';

export type PresenceStatus = 'present' | 'leave' | 'away';

export interface PresenceEntry {
  status: PresenceStatus;
  /** Nhãn hiển thị trên tooltip: tên loại nghỉ khi status='leave' */
  label: string;
}

/**
 * GET /api/users/presence
 * Trả về map { [userId]: { status, label } } cho trạng thái làm việc hôm nay:
 *   present — đang có mặt tại văn phòng (lượt chấm cuối cùng trong ngày là "vào")
 *   leave   — có đơn nghỉ ĐÃ DUYỆT phủ ngày hôm nay
 *   away    — chưa chấm công hoặc đã ra về (mặc định, không nằm trong map)
 *
 * Xác định vào/ra theo đúng quy ước của module chấm công (classifyDayRecords):
 *   - Bản ghi từ APP có event_type tường minh do người dùng bấm → tin tuyệt đối,
 *     nên hễ nhân sự bấm "Chấm công vào" là chấm chuyển xanh ngay, kể cả vào muộn.
 *   - Punch từ MÁY vân tay không biết vào hay ra → phân loại theo khung giờ VN
 *     (checkInStart..checkInEnd = vào; từ checkOutStart = ra; khung trưa chồng lấp
 *     thì đã thấy "vào" trong ngày → ra, chưa thấy → vào).
 */
export async function GET(_request: NextRequest) {
  try {
    const cfg = await resolveAttendanceConfig(null);
    const w = cfg.punchWindows;

    const [records, leaves] = await Promise.all([
      // Toàn bộ lượt chấm hôm nay (app + máy), kèm giờ VN, sort tăng dần theo thời gian
      query<{ user_id: string; event_type: string; source: string; vn_hour: number }>(`
        WITH today_records AS (
          SELECT user_id::text AS user_id,
                 event_type,
                 recorded_at,
                 'app' AS source
            FROM attendance_records
           WHERE DATE(recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
               = DATE(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')

          UNION ALL

          -- Máy vân tay: map punch → user qua (machine_id, employee_code) tại đúng
          -- thời điểm quẹt. Không gán event_type vì máy không phân biệt vào/ra.
          SELECT mm.user_id::text AS user_id,
                 'punch' AS event_type,
                 dp.punch_time AS recorded_at,
                 'machine' AS source
            FROM device_punches dp
            JOIN attendance_machine_mappings mm
              ON mm.machine_id     = dp.machine_id
             AND mm.employee_code  = dp.employee_code
             AND dp.punch_time    >= mm.effective_from
             AND (mm.effective_to IS NULL OR dp.punch_time < mm.effective_to)
           WHERE DATE(dp.punch_time AT TIME ZONE 'Asia/Ho_Chi_Minh')
               = DATE(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')
        )
        SELECT user_id,
               event_type,
               source,
               EXTRACT(HOUR FROM recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS vn_hour
          FROM today_records
         ORDER BY user_id, recorded_at ASC
      `, []),

      // Đơn nghỉ đã duyệt phủ ngày hôm nay
      query<{ user_id: string; type_name: string }>(`
        SELECT DISTINCT ON (lr.user_id)
               lr.user_id::text AS user_id,
               lt.name          AS type_name
          FROM leave_requests lr
          JOIN leave_types lt ON lt.id = lr.leave_type_id
         WHERE lr.status = 'approved'
           AND DATE(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')
               BETWEEN lr.start_date AND lr.end_date
         ORDER BY lr.user_id, lr.start_date DESC
      `, []),
    ]);

    const presence: Record<string, PresenceEntry> = {};

    // Nghỉ phép trước — người thực sự có mặt sẽ ghi đè bên dưới
    // (vd nghỉ theo giờ rồi vẫn vào làm → hiện "đang có mặt").
    for (const l of leaves) {
      presence[l.user_id] = { status: 'leave', label: l.type_name || 'Nghỉ phép' };
    }

    // Chạy dọc timeline trong ngày để biết lượt chấm CUỐI CÙNG là vào hay ra.
    const lastLabel: Record<string, 'check_in' | 'check_out'> = {};
    const seenIn: Record<string, boolean> = {};

    for (const r of records) {
      let label: 'check_in' | 'check_out';

      if (r.source === 'app' && (r.event_type === 'check_in' || r.event_type === 'check_out')) {
        label = r.event_type;
      } else {
        const h = r.vn_hour;
        if (h >= w.skipStart && h < w.skipEnd) continue; // ngoài khung → bỏ qua
        if (h >= w.checkInStart && h < w.checkInEnd) label = 'check_in';
        else if (h >= w.checkOutStart || h < w.skipStart) label = 'check_out';
        else label = seenIn[r.user_id] ? 'check_out' : 'check_in'; // khung trưa chồng lấp
      }

      if (label === 'check_in') seenIn[r.user_id] = true;
      lastLabel[r.user_id] = label;
    }

    for (const [userId, label] of Object.entries(lastLabel)) {
      if (label === 'check_in') {
        presence[userId] = { status: 'present', label: 'Đang có mặt tại văn phòng' };
      }
    }

    return NextResponse.json({ presence });
  } catch (err) {
    console.error('GET /api/users/presence error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
