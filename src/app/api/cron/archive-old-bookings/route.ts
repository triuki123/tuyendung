import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';
import { requireBearerSecret } from '@/lib/requestSecurity';

/**
 * Cron job để tự động lưu trữ các booking cũ (>= 7 ngày)
 * Gọi bằng: POST /api/cron/archive-old-bookings
 *
 * Logic:
 * 1. Tìm các booking có booking_date + 7 ngày <= hôm nay
 * 2. Copy vào archived_room_bookings table
 * 3. Xóa khỏi room_bookings table
 */

export async function POST(request: NextRequest) {
  try {
    // Verify request (optional - có thể add cron secret token)
    const authGuard = requireBearerSecret(request, process.env.CRON_SECRET);
    if (authGuard) return authGuard;

    // Tính cutoff date theo timezone VN — không dùng UTC để tránh lệch ngày
    const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });

    console.log(`[CRON] Archiving room bookings older than ${cutoffDate}`);

    // 1. Find bookings to archive (booking_date + 7 days <= today)
    const oldBookings = await query(
      `SELECT * FROM room_bookings
       WHERE booking_date + INTERVAL '7 days' <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE
       AND id NOT IN (SELECT id FROM archived_room_bookings)
       ORDER BY booking_date ASC`,
      []
    );

    if (!oldBookings || oldBookings.length === 0) {
      console.log('[CRON] No old bookings to archive');
      return NextResponse.json({
        success: true,
        archived: 0,
        message: 'No old bookings to archive',
      });
    }

    console.log(`[CRON] Found ${oldBookings.length} old bookings to archive`);

    // 2. Copy each booking to archived_room_bookings
    let archivedCount = 0;
    for (const booking of oldBookings) {
      try {
        await execute(
          `INSERT INTO archived_room_bookings (
            id, room_id, room_name, booking_date, start_time, end_time,
            duration_minutes, requested_by, requested_by_name, participants,
            purpose, status, created_at, updated_at, approval_timestamp,
            approval_by_name, rejection_reason, archived_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW()
          )`,
          [
            booking.id,
            booking.room_id,
            booking.room_name,
            booking.booking_date,
            booking.start_time,
            booking.end_time,
            booking.duration_minutes,
            booking.requested_by,
            booking.requested_by_name,
            booking.participants,
            booking.purpose,
            booking.status,
            booking.created_at,
            booking.updated_at,
            booking.approval_timestamp,
            booking.approval_by_name,
            booking.rejection_reason,
          ]
        );

        // 3. Delete from room_bookings
        await execute(
          'DELETE FROM room_bookings WHERE id = $1',
          [booking.id]
        );

        archivedCount++;
      } catch (err) {
        console.error(`[CRON] Error archiving booking ${booking.id}:`, err);
        // Continue with next booking instead of failing entirely
      }
    }

    console.log(`[CRON] Successfully archived ${archivedCount}/${oldBookings.length} bookings`);

    return NextResponse.json({
      success: true,
      archived: archivedCount,
      total: oldBookings.length,
      message: `Archived ${archivedCount} room bookings`,
    });
  } catch (error) {
    console.error('[CRON] Error in archive-old-bookings:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to archive old bookings',
      },
      { status: 500 }
    );
  }
}

// GET endpoint để test
export async function GET(request: NextRequest) {
  // Chi cho phép GET nếu là local development
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'Method not allowed' },
      { status: 405 }
    );
  }

  return NextResponse.json({
    message: 'POST /api/cron/archive-old-bookings để chạy cron job',
    note: 'Cần header: Authorization: Bearer {CRON_SECRET}',
  });
}
