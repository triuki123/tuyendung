import { queryOne, execute } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// Columns that callers are permitted to update; id/created_at are never updatable.
const ROOMS_UPDATABLE_COLS = new Set([
  'name', 'capacity', 'location', 'description', 'is_active', 'code',
]);

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();

    const filteredEntries = Object.entries(body).filter(([k]) => ROOMS_UPDATABLE_COLS.has(k));
    if (filteredEntries.length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const cols = filteredEntries.map(([k]) => k);
    const vals = filteredEntries.map(([, v]) => v);
    const assignments = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
    const sql = `UPDATE rooms SET ${assignments} WHERE id = $${cols.length + 1} RETURNING *`;

    const row = await queryOne(sql, [...vals, params.id]);
    if (!row) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }
    return NextResponse.json(row);
  } catch (error) {
    console.error('Error updating room:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update room' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const roomData = await queryOne<{ name: string }>(
      'SELECT name FROM rooms WHERE id = $1',
      [params.id]
    );

    if (!roomData) {
      return NextResponse.json({ error: 'Phòng không tồn tại' }, { status: 404 });
    }

    // Count bookings before deletion (for logging)
    const bookingCount = await queryOne<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM room_bookings WHERE room_name = $1',
      [roomData.name]
    );
    const count = bookingCount?.count ?? 0;

    // Delete all bookings for this room first (cascade delete)
    if (count > 0) {
      console.log(`[DELETE /api/rooms/${params.id}] Deleting ${count} bookings for room "${roomData.name}"`);
      await execute('DELETE FROM room_bookings WHERE room_name = $1', [roomData.name]);
    }

    // Then delete the room itself
    await execute('DELETE FROM rooms WHERE id = $1', [params.id]);

    return NextResponse.json({
      message: `Đã xóa phòng thành công (xóa kèm ${count} booking)`,
      success: true,
      bookingsDeleted: count,
    });
  } catch (error) {
    console.error('Error deleting room:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi khi xóa phòng' },
      { status: 500 }
    );
  }
}
