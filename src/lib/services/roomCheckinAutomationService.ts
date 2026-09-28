import { query, execute, queryOne } from '@/lib/db';
import { notify } from '@/lib/notifications/engine';
import { sendTelegramCheckoutReminder } from '@/lib/services/telegramService';
import { autoCompleteBooking } from '@/lib/services/roomCheckinService';

/**
 * Tự động hoá vòng đời nhận/trả phòng (chạy định kỳ vài phút/lần):
 *  - Nhắc nhận phòng khi đến giờ mà chưa check-in.
 *  - Tự nhả phòng (no-show) nếu quá ngưỡng mà vẫn chưa check-in.
 *  - Nhắc trả phòng khi cuộc họp sắp kết thúc mà chưa check-out.
 * Thông báo đi QUA engine tập trung (notify). Chống trùng bằng room_checkin_log
 * (nhắc) và bằng việc đổi status (auto-release).
 *
 * PHASE 2 config: các ngưỡng dưới nên đưa ra system_settings (giống resolveAttendanceConfig).
 */
const NO_SHOW_GRACE_MIN = 15;     // nhả phòng nếu chưa check-in sau 15' kể từ giờ bắt đầu
const CHECKIN_REMIND_WINDOW = 5;  // nhắc nhận phòng trong 5' đầu sau giờ bắt đầu
const CHECKOUT_LEAD_1 = 10;       // nhắc trả phòng lần 1: 10' trước giờ kết thúc
const CHECKOUT_LEAD_2 = 5;        // nhắc trả phòng lần 2: 5' trước giờ kết thúc
const COMPLETE_GRACE_MIN = 10;    // quá giờ kết thúc 10' mà chưa trả → tự hoàn tất

const OCCUPYING = ['approved', 'confirmed', 'checked_in'];

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://assetflow.fadoai.com').replace(/\/$/, '');

/** Lấy telegram_chat_id của user (nếu đã liên kết & còn active). */
async function getChatId(userId: string): Promise<string | null> {
  const row = await queryOne<{ chat: string | null }>(
    `SELECT telegram_chat_id AS chat FROM users WHERE id::text = $1 AND status = 'active'`,
    [userId],
  );
  return row?.chat || null;
}

function nowVN(): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00';
  let hh = get('hour'); if (hh === '24') hh = '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: parseInt(hh, 10) * 60 + parseInt(get('minute'), 10) };
}
function toMin(t: string | null): number | null {
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
}

interface Row {
  id: string; room_name: string; start_time: string; end_time: string;
  status: string; requested_by: string; confirmed_at: string | null; checked_in_at: string | null; checked_out_at: string | null;
}

export async function runRoomCheckinAutomation(): Promise<{ reminded: number; released: number; completed: number }> {
  const { date: today, minutes: now } = nowVN();
  const rows = await query<Row>(
    `SELECT id, room_name, start_time, end_time, status, requested_by, confirmed_at, checked_in_at, checked_out_at
       FROM room_bookings
      WHERE booking_date = $1 AND status = ANY($2)`,
    [today, OCCUPYING],
  );

  let reminded = 0, released = 0, completed = 0;

  for (const b of rows) {
    const s = toMin(b.start_time); const e = toMin(b.end_time);
    if (s == null || e == null || !b.requested_by) continue;
    const alreadyAccepted = !!b.confirmed_at || !!b.checked_in_at;
    const notCheckedIn = !b.checked_in_at;
    const inUse = !!b.checked_in_at && !b.checked_out_at;

    // 1) Tự nhả phòng no-show: chưa nhận, quá ngưỡng, vẫn còn trong khung giờ họp
    if (!alreadyAccepted && !b.checked_out_at && now >= s + NO_SHOW_GRACE_MIN && now < e) {
      const upd = await execute(
        `UPDATE room_bookings
            SET status = 'cancelled', cancellation_reason = $2, cancelled_at = now(), updated_at = now()
          WHERE id = $1 AND status = ANY($3) AND checked_in_at IS NULL AND confirmed_at IS NULL`,
        [b.id, `Tự nhả do không nhận phòng sau ${NO_SHOW_GRACE_MIN} phút`, OCCUPYING],
      );
      if ((upd as any).rowCount > 0) {
        await notify('roomBooking.autoReleased', {
          roomName: b.room_name, startTime: b.start_time, endTime: b.end_time, graceMin: NO_SHOW_GRACE_MIN,
        }, { recipients: [b.requested_by], relatedId: b.id }).catch(() => {});
        released++;
      }
      continue; // đã nhả thì bỏ qua nhắc
    }

    // 2) Nhắc nhận phòng: vừa tới giờ (trong 5'), chưa nhận
    if (!alreadyAccepted && notCheckedIn && now >= s && now < s + CHECKIN_REMIND_WINDOW) {
      if (await logOnce(b.id, 'checkin_reminder')) {
        await notify('roomBooking.checkinReminder', {
          roomName: b.room_name, startTime: b.start_time, endTime: b.end_time,
        }, { recipients: [b.requested_by], relatedId: b.id }).catch(() => {});
        reminded++;
      }
    }

    // 3) Nhắc trả phòng 2 mốc: 10' và 5' trước giờ kết thúc — kèm nút GIA HẠN NHANH.
    if (inUse && now >= e - CHECKOUT_LEAD_1 && now < e - CHECKOUT_LEAD_2) {
      if (await sendCheckoutReminder(b, CHECKOUT_LEAD_1, 'checkout_reminder_10')) reminded++;
    }
    if (inUse && now >= e - CHECKOUT_LEAD_2 && now < e) {
      if (await sendCheckoutReminder(b, CHECKOUT_LEAD_2, 'checkout_reminder_5')) reminded++;
    }

    // 4) Quá giờ kết thúc + ân hạn mà chưa trả phòng → TỰ hoàn tất & trả phòng.
    if (inUse && now >= e + COMPLETE_GRACE_MIN) {
      if (await autoCompleteBooking(b.id)) {
        await notify('roomBooking.autoCompleted', {
          roomName: b.room_name, startTime: b.start_time, endTime: b.end_time,
        }, { recipients: [b.requested_by], relatedId: b.id }).catch(() => {});
        completed++;
      }
    }
  }

  // 5) Dọn booking checked_in sót từ NGÀY CŨ (chưa trả phòng) → tự hoàn tất.
  const stale = await query<{ id: string }>(
    `SELECT id FROM room_bookings
      WHERE status = 'checked_in' AND checked_out_at IS NULL AND booking_date < $1`,
    [today],
  );
  for (const s of stale) {
    if (await autoCompleteBooking(s.id)) completed++;
  }

  if (reminded || released || completed) console.log(`[RoomCheckinAutomation] nhắc ${reminded}, nhả ${released}, tự hoàn tất ${completed}`);
  return { reminded, released, completed };
}

/**
 * Gửi 1 lượt nhắc trả phòng (in-app qua engine + Telegram kèm nút gia hạn nhanh).
 * Chống trùng bằng room_checkin_log (kind). Trả true nếu vừa gửi (lần đầu).
 */
async function sendCheckoutReminder(
  b: Row,
  minsLeft: number,
  kind: string,
): Promise<boolean> {
  if (!(await logOnce(b.id, kind))) return false;
  // In-app qua engine (KHÔNG gửi Telegram ở đây để tránh trùng — Telegram gửi kèm nút riêng).
  await notify('roomBooking.checkoutReminder', {
    roomName: b.room_name, endTime: b.end_time, minsLeft,
  }, { recipients: [b.requested_by], relatedId: b.id, skipTelegram: true }).catch(() => {});
  // Telegram: tin nhắn kèm nút gia hạn nhanh (＋15/＋30/＋60 phút).
  const chat = await getChatId(b.requested_by);
  if (chat) {
    const text =
      `🔔 *Phòng ${b.room_name}* sắp hết giờ lúc *${b.end_time}* (còn ~${minsLeft} phút).\n\n` +
      `Nếu xong sớm hãy trả phòng để người khác dùng.\n` +
      `*Cần họp thêm?* Bấm gia hạn bên dưới — chỉ được duyệt nếu không có lịch đã đặt kế tiếp.`;
    await sendTelegramCheckoutReminder(chat, text, b.id, `${APP_URL}/room-bookings`).catch(() => {});
  }
  return true;
}

/** Trả true nếu đây là lần đầu ghi log cho (booking, kind) → được phép gửi. */
async function logOnce(bookingId: string, kind: string): Promise<boolean> {
  const ins = await execute(
    `INSERT INTO room_checkin_log (booking_id, kind) VALUES ($1, $2) ON CONFLICT (booking_id, kind) DO NOTHING`,
    [bookingId, kind],
  );
  return (ins as any).rowCount > 0;
}
