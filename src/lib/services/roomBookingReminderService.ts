import { query, execute } from '@/lib/db';
import { notify } from '@/lib/notifications/engine';

export async function runRoomBookingReminders(): Promise<{ sent: number }> {
  // Tìm booking sắp bắt đầu trong 25-35 phút (cửa sổ nhắc 30 phút trước)
  const bookings = await query<{
    id: string;
    room_name: string;
    booking_date: string;
    start_time: string;
    end_time: string;
    purpose: string;
    requested_by: string;
    requested_by_name: string;
    telegram_chat_id: string | null;
    telegram_enabled: boolean;
  }>(
    `SELECT
       rb.id, rb.room_name, rb.booking_date, rb.start_time, rb.end_time,
       rb.purpose, rb.requested_by, rb.requested_by_name,
       u.telegram_chat_id, u.telegram_enabled
     FROM room_bookings rb
     LEFT JOIN users u ON u.id::text = rb.requested_by::text
     WHERE rb.status IN ('approved', 'confirmed')
       AND (rb.booking_date || ' ' || rb.start_time || ':00')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
           BETWEEN NOW() + INTERVAL '25 minutes' AND NOW() + INTERVAL '35 minutes'`
  );

  let sent = 0;

  for (const b of bookings) {
    const ins = await execute(
      `INSERT INTO room_booking_reminder_log (booking_id)
       VALUES ($1)
       ON CONFLICT (booking_id) DO NOTHING`,
      [b.id]
    );
    if ((ins as any).rowCount === 0) continue;

    const purposeSuffix = b.purpose ? `. Nội dung: ${b.purpose}` : '';
    await notify('roomBooking.reminder', {
      roomName: b.room_name, startTime: b.start_time, endTime: b.end_time, purposeSuffix,
    }, { recipients: [b.requested_by], relatedId: b.id });

    sent++;
  }

  if (sent > 0) console.log(`[RoomBookingReminder] Đã nhắc ${sent} booking`);
  return { sent };
}
