import { query, queryOne, execute } from '@/lib/db';

/**
 * Quét QR phòng họp: trạng thái thời gian thực + check-in / check-out vật lý.
 *
 * Lưu ý dữ liệu:
 * - room_bookings tham chiếu phòng qua `room_name` (text), KHÔNG có room_id.
 * - booking_date / start_time / end_time là TEXT ('YYYY-MM-DD' / 'HH:MM').
 * - Giờ "hiện tại" luôn tính theo múi giờ VN để khớp dữ liệu chấm-công/đặt-phòng.
 */

// Cửa sổ check-in: được nhận phòng từ 15' trước giờ bắt đầu (Phase 2 sẽ đưa ra config).
const CHECK_IN_EARLY_MIN = 15;

const OCCUPYING_STATUSES = ['approved', 'confirmed', 'checked_in'];

export interface RoomBriefBooking {
  id: string;
  purpose: string | null;
  start_time: string;
  end_time: string;
  requested_by: string | null;
  requested_by_name: string | null;
  status: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
}

export interface RoomScanStatus {
  room: { id: string; name: string; code: string; capacity: number; location: string | null };
  today: string;          // YYYY-MM-DD (VN)
  now: string;            // HH:MM (VN)
  isBusy: boolean;        // đang có cuộc họp diễn ra
  busyUntil: string | null;
  nextFrom: string | null;
  todayBookings: RoomBriefBooking[];
  /** Booking của CHÍNH user, đủ điều kiện check-in (chưa nhận, trong cửa sổ giờ). */
  checkInBooking: RoomBriefBooking | null;
  /** Booking của user đang nhận phòng (đã check-in, chưa trả) → cho phép check-out. */
  checkOutBooking: RoomBriefBooking | null;
  /** Phòng đang trống ngay bây giờ (gợi ý đặt nhanh). */
  isFreeNow: boolean;
}

function nowVN(): { date: string; minutes: number; hhmm: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  let hh = get('hour'); if (hh === '24') hh = '00';
  const mm = get('minute');
  return { date, minutes: parseInt(hh, 10) * 60 + parseInt(mm, 10), hhmm: `${hh}:${mm}` };
}

function toMin(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/** Lấy phòng theo mã (không phân biệt hoa thường). */
export async function getRoomByCode(code: string) {
  return queryOne<{ id: string; name: string; code: string; capacity: number; location: string | null; is_active: boolean }>(
    `SELECT id, name, code, capacity, location, is_active FROM rooms WHERE lower(code) = lower($1) LIMIT 1`,
    [code],
  );
}

/** Trạng thái phòng + hành động khả dụng cho user khi quét QR. */
export async function getRoomScanStatus(code: string, userId: string): Promise<RoomScanStatus | null> {
  const room = await getRoomByCode(code);
  if (!room) return null;

  const { date: today, minutes: nowMin, hhmm } = nowVN();

  const bookings = await query<RoomBriefBooking>(
    `SELECT id, purpose, start_time, end_time, requested_by, requested_by_name, status,
            checked_in_at, checked_out_at
       FROM room_bookings
      WHERE room_name = $1 AND booking_date = $2
        AND status <> 'cancelled' AND status <> 'rejected'
      ORDER BY start_time ASC`,
    [room.name, today],
  );

  let isBusy = false;
  let busyUntil: string | null = null;
  let nextFrom: string | null = null;

  for (const b of bookings) {
    if (!OCCUPYING_STATUSES.includes(b.status)) continue;
    const s = toMin(b.start_time); const e = toMin(b.end_time);
    if (s == null || e == null) continue;
    if (nowMin >= s && nowMin < e) { isBusy = true; if (!busyUntil || e > (toMin(busyUntil) ?? 0)) busyUntil = b.end_time; }
    else if (s > nowMin && (nextFrom == null || s < (toMin(nextFrom) ?? Infinity))) nextFrom = b.start_time;
  }

  // Booking của chính user cho check-in / check-out
  let checkInBooking: RoomBriefBooking | null = null;
  let checkOutBooking: RoomBriefBooking | null = null;
  for (const b of bookings) {
    if (b.requested_by !== userId) continue;
    const s = toMin(b.start_time); const e = toMin(b.end_time);
    if (s == null || e == null) continue;
    if (b.checked_in_at && !b.checked_out_at) { checkOutBooking = b; continue; }
    if (!b.checked_in_at && !b.checked_out_at && OCCUPYING_STATUSES.includes(b.status)) {
      // trong cửa sổ: từ (start - 15') đến hết end
      if (nowMin >= s - CHECK_IN_EARLY_MIN && nowMin <= e && !checkInBooking) checkInBooking = b;
    }
  }

  return {
    room: { id: room.id, name: room.name, code: room.code, capacity: room.capacity, location: room.location },
    today, now: hhmm,
    isBusy, busyUntil, nextFrom,
    todayBookings: bookings,
    checkInBooking, checkOutBooking,
    isFreeNow: !isBusy,
  };
}

/** Ghi nhận check-in: cập nhật booking + ghi vết check_in_history. */
export async function checkInBooking(bookingId: string, userId: string, userName: string): Promise<{ ok: boolean; error?: string }> {
  const b = await queryOne<{ id: string; room_name: string; requested_by: string; status: string; checked_in_at: string | null; checked_out_at: string | null }>(
    `SELECT id, room_name, requested_by, status, checked_in_at, checked_out_at FROM room_bookings WHERE id = $1`,
    [bookingId],
  );
  if (!b) return { ok: false, error: 'Không tìm thấy lượt đặt phòng' };
  if (b.checked_out_at) return { ok: false, error: 'Lượt đặt đã trả phòng' };
  if (b.checked_in_at) return { ok: false, error: 'Đã nhận phòng trước đó' };

  const { date: today, hhmm } = nowVN();
  await execute(
    `UPDATE room_bookings
        SET checked_in_at = now(),
            status = CASE WHEN status IN ('approved', 'confirmed') THEN 'checked_in' ELSE status END,
            updated_at = now()
      WHERE id = $1`,
    [bookingId],
  );
  const room = await queryOne<{ id: string }>(`SELECT id FROM rooms WHERE name = $1 LIMIT 1`, [b.room_name]);
  await execute(
    `INSERT INTO check_in_history (id, booking_id, room_id, room_name, checked_in_by, checked_in_by_name, check_in_time, check_in_date, status)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'checked-in')`,
    [bookingId, room?.id ?? null, b.room_name, userId, userName, hhmm, today],
  ).catch(() => { /* audit không chặn nghiệp vụ */ });
  return { ok: true };
}

/**
 * Hệ thống TỰ trả phòng & hoàn tất khi quá giờ mà người dùng không thao tác:
 * set status='completed', checked_out_at (nếu chưa), đóng check_in_history.
 * Idempotent nhờ điều kiện status='checked_in' (chạy lại không đổi gì).
 */
export async function autoCompleteBooking(bookingId: string): Promise<boolean> {
  const upd = await execute(
    `UPDATE room_bookings
        SET status = 'completed',
            checked_out_at = COALESCE(checked_out_at, now()),
            updated_at = now()
      WHERE id = $1 AND status = 'checked_in'`,
    [bookingId],
  );
  if ((upd as any).rowCount === 0) return false;
  await execute(
    `UPDATE check_in_history
        SET check_out_time = to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI'),
            check_out_date = to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD'),
            status = 'checked-out', updated_at = now()
      WHERE booking_id = $1 AND status = 'checked-in'`,
    [bookingId],
  ).catch(() => { /* audit không chặn */ });
  return true;
}

function minToHHMM(m: number): string {
  const mm = ((m % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
}

/**
 * Gia hạn cuộc họp đang diễn ra (kéo dài end_time thêm addMinutes) nếu phòng còn trống
 * sau giờ kết thúc hiện tại (không đè lịch kế tiếp).
 */
export async function extendBooking(bookingId: string, addMinutes: number, userId: string): Promise<{ ok: boolean; error?: string; newEnd?: string }> {
  const b = await queryOne<{ id: string; room_name: string; booking_date: string; start_time: string; end_time: string; requested_by: string; checked_out_at: string | null }>(
    `SELECT id, room_name, booking_date, start_time, end_time, requested_by, checked_out_at FROM room_bookings WHERE id = $1`,
    [bookingId],
  );
  if (!b) return { ok: false, error: 'Không tìm thấy lượt đặt phòng' };
  if (b.checked_out_at) return { ok: false, error: 'Đã trả phòng, không thể gia hạn' };
  if (b.requested_by !== userId) return { ok: false, error: 'Chỉ người đặt mới gia hạn được' };

  const curEnd = toMin(b.end_time);
  if (curEnd == null) return { ok: false, error: 'Giờ kết thúc không hợp lệ' };
  const newEndMin = curEnd + addMinutes;
  if (newEndMin >= 24 * 60) return { ok: false, error: 'Không thể gia hạn qua nửa đêm' };
  const newEnd = minToHHMM(newEndMin);

  // Có lịch nào của phòng đè vào [curEnd, newEnd) không?
  const others = await query<{ start_time: string; end_time: string; status: string }>(
    `SELECT start_time, end_time, status FROM room_bookings
      WHERE room_name = $1 AND booking_date = $2 AND id <> $3
        AND status <> 'cancelled' AND status <> 'rejected'`,
    [b.room_name, b.booking_date, bookingId],
  );
  for (const o of others) {
    if (!OCCUPYING_STATUSES.includes(o.status)) continue;
    const s = toMin(o.start_time);
    if (s != null && s < newEndMin && s >= curEnd) {
      return { ok: false, error: `Phòng có lịch lúc ${o.start_time}, chỉ gia hạn được tới đó` };
    }
  }

  await execute(`UPDATE room_bookings SET end_time = $2, updated_at = now() WHERE id = $1`, [bookingId, newEnd]);
  return { ok: true, newEnd };
}

/** Ghi nhận check-out: trả phòng, đóng lịch sử. */
export async function checkOutBooking(bookingId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  const b = await queryOne<{ id: string; checked_in_at: string | null; checked_out_at: string | null }>(
    `SELECT id, checked_in_at, checked_out_at FROM room_bookings WHERE id = $1`,
    [bookingId],
  );
  if (!b) return { ok: false, error: 'Không tìm thấy lượt đặt phòng' };
  if (!b.checked_in_at) return { ok: false, error: 'Chưa nhận phòng nên không thể trả' };
  if (b.checked_out_at) return { ok: false, error: 'Đã trả phòng rồi' };

  const { date: today, hhmm } = nowVN();
  await execute(
    `UPDATE room_bookings SET checked_out_at = now(), updated_at = now() WHERE id = $1`,
    [bookingId],
  );
  await execute(
    `UPDATE check_in_history
        SET check_out_time = $2, check_out_date = $3, status = 'checked-out', updated_at = now()
      WHERE booking_id = $1 AND status = 'checked-in'`,
    [bookingId, hhmm, today],
  ).catch(() => { /* audit không chặn */ });
  return { ok: true };
}
