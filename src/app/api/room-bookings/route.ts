import { query, queryOne, buildInsert, execute } from '@/lib/db';
import { sendRoomBookingCreatedNotification, sendNewRoomBookingNotificationToAdmin } from '@/lib/services/notificationsService';
import { NextRequest, NextResponse } from 'next/server';
import { getCompanyMemberUserIds, getEffectiveContext } from '@/lib/services/userCompanyService';
import { checkUnitAccess } from '@/lib/api-permissions';
import { getOrgSubtreeUserIds } from '@/lib/services/attendanceService';

export async function GET(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'room-bookings', 'view')) {
      return NextResponse.json({ error: 'Khong co quyen' }, { status: 403 });
    }
    const currentUserId = request.headers.get('x-current-user-id');
    const currentUserCompany = request.headers.get('x-current-user-company');
    const ctx = currentUserId
      ? await getEffectiveContext(currentUserId, currentUserCompany || null)
      : null;

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const requestedBy = searchParams.get('requested_by');

    const conditions: string[] = [];
    const params: any[] = [];

    if (status) {
      params.push(status);
      conditions.push(`b.status = $${params.length}`);
    }
    if (requestedBy) {
      params.push(requestedBy);
      conditions.push(`b.requested_by = $${params.length}`);
    }
    if (ctx?.role === 'admin' && ctx.company_id) {
      const companyUserIds = await getCompanyMemberUserIds(ctx.company_id);
      params.push(companyUserIds.length ? companyUserIds : ['__none__']);
      conditions.push(`b.requested_by::text = ANY($${params.length}::text[])`);
    } else if (ctx?.role === 'manager' && currentUserId) {
      const visibleIds = [currentUserId, ...(await getOrgSubtreeUserIds(currentUserId, ctx.company_id || null))];
      params.push(visibleIds);
      conditions.push(`b.requested_by::text = ANY($${params.length}::text[])`);
    } else if (ctx?.role && ctx.role !== 'super_admin' && currentUserId) {
      params.push(currentUserId);
      conditions.push(`b.requested_by::text = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT b.*,
             COALESCE(p.participants, '[]'::jsonb) AS participants
      FROM room_bookings b
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object(
          'id',    rbp.participant_id,
          'email', rbp.participant_email,
          'name',  rbp.participant_name
        ) ORDER BY rbp.created_at) AS participants
        FROM room_booking_participants rbp
        WHERE rbp.booking_id = b.id
      ) p ON true
      ${where}
      ORDER BY b.booking_date ASC, b.start_time ASC
    `;
    const data = await query(sql, params);

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching room bookings:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch room bookings' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'room-bookings', 'create')) {
      return NextResponse.json({ error: 'Khong co quyen' }, { status: 403 });
    }
    const body = await request.json();
    const { participants, ...bookingFields } = body;
    const currentUserId = request.headers.get('x-current-user-id');
    const currentUserCompany = request.headers.get('x-current-user-company');
    const ctx = currentUserId
      ? await getEffectiveContext(currentUserId, currentUserCompany || null)
      : null;

    if (ctx?.role === 'admin' && ctx.company_id) {
      const requester = await queryOne<{ company_id: string | null }>(
        'SELECT company_id::text AS company_id FROM users WHERE id = $1',
        [bookingFields.requested_by]
      );
      if (!requester || requester.company_id !== ctx.company_id) {
        return NextResponse.json(
          { error: 'Admin chỉ được tạo booking cho nhân sự trong công ty đang được gán' },
          { status: 403 }
        );
      }
    } else if (ctx?.role === 'manager' && currentUserId) {
      const allowedIds = [currentUserId, ...(await getOrgSubtreeUserIds(currentUserId, ctx.company_id || null))];
      if (!allowedIds.includes(bookingFields.requested_by)) {
        return NextResponse.json(
          { error: 'Manager chi duoc tao booking cho ban than hoac cap duoi' },
          { status: 403 }
        );
      }
    } else if (ctx?.role && ctx.role !== 'super_admin' && bookingFields.requested_by !== currentUserId) {
      return NextResponse.json(
        { error: 'Ban chi duoc tao booking cho chinh minh' },
        { status: 403 }
      );
    }

    const { randomUUID } = await import('crypto');
    const bookingId = body.id || randomUUID();

    const bookingData = {
      id: bookingId,
      ...bookingFields,
      num_participants: body.num_participants || 1,
      has_online_meeting: body.has_online_meeting || false,
      needs_room_setup: body.needs_room_setup || false,
    };

    const { text, params } = buildInsert('room_bookings', bookingData);
    const row = await queryOne(text, params);

    if (participants && Array.isArray(participants) && participants.length > 0) {
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
        const { text: pText, params: pParams } = buildInsert('room_booking_participants', participantData);
        await execute(pText, pParams);
      }
    }

    try {
      const creator = {
        id: bookingData.requested_by,
        name: bookingData.requested_by_name,
      };
      await sendRoomBookingCreatedNotification(
        bookingId,
        creator,
        participants || [],
        bookingData.room_name,
        bookingData.booking_date,
        bookingData.start_time,
        bookingData.end_time,
        bookingData.purpose
      );

      if (row) {
        await sendNewRoomBookingNotificationToAdmin(row);
      }
    } catch (notifError) {
      console.error('Error sending booking notifications:', notifError);
    }

    return NextResponse.json(
      { ...row, participants: participants ?? [] },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating room booking:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create room booking' },
      { status: 500 }
    );
  }
}
