/**
 * bookingBotService — dữ liệu cho luồng /booking của bot FADO Notification:
 * tài khoản liên kết, danh sách phòng, các khoảng giờ đã bận (chống trùng),
 * lưu/đọc trạng thái hội thoại, và tạo booking (pending) + bắn thông báo.
 */
import { query, queryOne, execute, buildInsert } from '@/lib/db';
import { sendRoomBookingCreatedNotification, sendNewRoomBookingNotificationToAdmin } from '@/lib/services/notificationsService';

export interface LinkedUser { id: string; name: string; role: string }

/** Tài khoản FADO gắn với 1 chat Telegram (null nếu chưa liên kết). */
export async function getLinkedUser(tgId: string): Promise<LinkedUser | null> {
  return queryOne<LinkedUser>(
    `SELECT id::text AS id, name, role FROM users WHERE telegram_chat_id = $1 AND status = 'active'`,
    [tgId]
  );
}

export interface RoomLite { id: string; name: string; capacity: number | null; location: string | null }

/** Phòng đang hoạt động (cho nút chọn phòng). */
export async function getActiveRooms(): Promise<RoomLite[]> {
  return query<RoomLite>(
    `SELECT id, name, capacity, location FROM rooms WHERE is_active = TRUE ORDER BY name ASC`
  );
}

export interface BusyInterval { start: string; end: string } // 'HH:MM'

/**
 * Các khoảng giờ ĐANG GIỮ CHỖ của 1 phòng trong 1 ngày — dùng để tô đỏ slot trùng.
 * Chỉ tính status thực sự chiếm phòng (giống checkBookingConflict + occupying statuses).
 */
export async function getBusyIntervals(roomName: string, date: string): Promise<BusyInterval[]> {
  return query<BusyInterval>(
    `SELECT start_time AS start, end_time AS end
       FROM room_bookings
      WHERE room_name = $1 AND booking_date = $2
        AND status IN ('approved', 'confirmed', 'checked_in')
      ORDER BY start_time ASC`,
    [roomName, date]
  );
}

// ─── Trạng thái hội thoại theo chat ──────────────────────────────────────────
export type BookingStep = 'room' | 'date' | 'start' | 'end' | 'purpose' | 'confirm';
export interface BookingState {
  step: BookingStep;
  roomId?: string;
  roomName?: string;
  date?: string;        // YYYY-MM-DD
  start?: string;       // HH:MM
  end?: string;         // HH:MM
  purpose?: string;
  awaitingPurpose?: boolean; // đang chờ user gõ mục đích
}

export async function getState(tgId: string): Promise<BookingState | null> {
  const r = await queryOne<{ data: BookingState }>(`SELECT data FROM booking_tg_state WHERE telegram_id = $1`, [tgId]);
  return r?.data ?? null;
}

export async function saveState(tgId: string, data: BookingState): Promise<void> {
  await execute(
    `INSERT INTO booking_tg_state (telegram_id, data, updated_at) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (telegram_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    [tgId, JSON.stringify(data)]
  );
}

export async function clearState(tgId: string): Promise<void> {
  await execute(`DELETE FROM booking_tg_state WHERE telegram_id = $1`, [tgId]);
}

/**
 * Tạo booking từ bot (status 'pending') + bắn thông báo (in-app + Telegram admin
 * có nút Duyệt/Từ chối) — TÁI DÙNG đúng luồng của POST /api/room-bookings.
 */
export async function createBookingFromBot(input: {
  user: LinkedUser; roomName: string; date: string; start: string; end: string; purpose: string;
}): Promise<{ id: string }> {
  const { randomUUID } = await import('crypto');
  const bookingId = randomUUID();
  const bookingData = {
    id: bookingId,
    room_name: input.roomName,
    booking_date: input.date,
    start_time: input.start,
    end_time: input.end,
    purpose: input.purpose || 'Đặt qua Telegram',
    requested_by: input.user.id,
    requested_by_name: input.user.name,
    status: 'pending',
    num_participants: 1,
    has_online_meeting: false,
    needs_room_setup: false,
  };
  const { text, params } = buildInsert('room_bookings', bookingData);
  const row = await queryOne(text, params);

  try {
    await sendRoomBookingCreatedNotification(
      bookingId,
      { id: input.user.id, name: input.user.name },
      [],
      bookingData.room_name,
      bookingData.booking_date,
      bookingData.start_time,
      bookingData.end_time,
      bookingData.purpose
    );
    if (row) await sendNewRoomBookingNotificationToAdmin(row);
  } catch (e) {
    console.error('createBookingFromBot notify error:', e);
  }
  return { id: bookingId };
}
