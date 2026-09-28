import { query, execute, buildInsert } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const now = new Date();
    // Phải dùng timezone VN (+7) để so sánh giờ đặt phòng — không dùng UTC
    const currentDate = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    const currentTime = now.toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });

    console.log(`[Auto-complete Job] Running at ${currentDate} ${currentTime}`);

    // Find all checked-in bookings where end_time has passed
    const expiredBookings = await query<{
      id: string;
      booking_date: string;
      end_time: string;
      room_name: string;
      requested_by_name: string;
    }>(
      `SELECT id, booking_date, end_time, room_name, requested_by_name
       FROM room_bookings
       WHERE status = $1 AND end_time < $2`,
      ['checked-in', currentTime]
    );

    if (expiredBookings.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Không có đơn đặt phòng cần hoàn thành',
        completedCount: 0,
        timestamp: new Date().toISOString(),
      });
    }

    const bookingIds = expiredBookings.map((b) => b.id);

    // Update all expired bookings to "completed"
    await execute(
      `UPDATE room_bookings SET status = $1, updated_at = $2 WHERE id = ANY($3)`,
      ['completed', new Date().toISOString(), bookingIds]
    );

    // Log auto-completion events — fire-and-forget, failure must not abort
    try {
      const { randomUUID } = await import('crypto');
      for (const booking of expiredBookings) {
        const { text, params } = buildInsert('admin_audit_logs', {
          id: randomUUID(),
          booking_id: booking.id,
          action: 'auto-completed',
          admin_id: 'system',
          admin_name: 'System Auto-Complete',
          reason: `Auto-completed at ${currentTime} (scheduled end time: ${booking.end_time})`,
          created_at: new Date().toISOString(),
        });
        await execute(text, params);
      }
    } catch (logError) {
      console.error('Error logging auto-completion:', logError);
    }

    console.log(`[Auto-complete Job] Successfully completed ${bookingIds.length} bookings`);

    return NextResponse.json({
      success: true,
      message: `Đã hoàn thành ${bookingIds.length} đơn đặt phòng`,
      completedCount: bookingIds.length,
      completedBookings: expiredBookings.map((b) => ({
        bookingId: b.id,
        roomName: b.room_name,
        endTime: b.end_time,
        requestedBy: b.requested_by_name,
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in auto-complete job:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        error: `Lỗi trong công việc auto-complete: ${errorMessage}`,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'healthy',
    endpoint: '/api/room-bookings/auto-complete',
    method: 'POST',
    description: 'Auto-complete endpoint for marking expired check-ins as completed',
    lastCheck: new Date().toISOString(),
    usage: {
      trigger: 'POST /api/room-bookings/auto-complete',
      frequency: 'Recommended: Every 5-10 minutes via external cron service',
      documentation: 'See comments in route.ts for setup instructions',
    },
  });
}
