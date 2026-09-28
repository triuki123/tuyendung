import { query, execute, buildInsert, queryOne } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveContext } from '@/lib/services/userCompanyService';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const currentUserId = request.headers.get('x-current-user-id');
    const currentUserCompany = request.headers.get('x-current-user-company');
    const ctx = currentUserId
      ? await getEffectiveContext(currentUserId, currentUserCompany || null)
      : null;
    const body = await request.json();
    const { participants } = body;

    if (!Array.isArray(participants)) {
      return NextResponse.json(
        { error: 'Participants must be an array' },
        { status: 400 }
      );
    }

    const bookingId = params.id;

    if (ctx?.role === 'admin' && ctx.company_id) {
      const scopedBooking = await queryOne<{ id: string }>(
        `SELECT b.id
         FROM room_bookings b
         INNER JOIN users u ON u.id::text = b.requested_by::text
         WHERE b.id = $1 AND u.company_id::text = $2::text`,
        [bookingId, ctx.company_id]
      );
      if (!scopedBooking) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    await execute('DELETE FROM room_booking_participants WHERE booking_id = $1', [bookingId]);

    const { randomUUID } = await import('crypto');

    for (const participant of participants) {
      const participantData = {
        id: randomUUID(),
        booking_id: bookingId,
        participant_id: participant.id || null,
        participant_email: participant.email || null,
        participant_name: participant.name || null,
        status: 'pending',
        created_at: new Date().toISOString(),
      };
      const { text, params: insertParams } = buildInsert('room_booking_participants', participantData);
      await execute(text, insertParams);
    }

    const booking = await queryOne(
      'SELECT * FROM room_bookings WHERE id = $1',
      [bookingId]
    );

    const bookingParticipants = await query(
      'SELECT * FROM room_booking_participants WHERE booking_id = $1',
      [bookingId]
    );

    return NextResponse.json({
      ...booking,
      participants: bookingParticipants,
    });
  } catch (error) {
    console.error('Error updating room booking participants:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update participants' },
      { status: 500 }
    );
  }
}
