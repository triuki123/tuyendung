import { execute } from '@/lib/db';

export async function runArchiveOldBookings(): Promise<{ archived: number }> {
  // Copy bookings > 7 ngày vào archived_room_bookings rồi xóa
  const result = await execute(
    `WITH moved AS (
       DELETE FROM room_bookings
       WHERE booking_date < (CURRENT_DATE AT TIME ZONE 'Asia/Ho_Chi_Minh' - INTERVAL '7 days')::date::text
       RETURNING *
     )
     INSERT INTO archived_room_bookings
       (id, room_name, booking_date, start_time, end_time, purpose,
        requested_by, requested_by_name, status, approved_by, approved_at,
        confirmed_at, confirmed_by, created_at, updated_at, archived_at)
     SELECT
       id::text, room_name, booking_date, start_time, end_time, purpose,
       requested_by, requested_by_name, status, approved_by, approved_at,
       confirmed_at, confirmed_by::text, created_at, updated_at, NOW()
     FROM moved`
  );

  const archived = (result as any).rowCount || 0;
  if (archived > 0) console.log(`[ArchiveBookings] Đã lưu trữ ${archived} booking cũ`);
  return { archived };
}
