import { queryOne, execute, query } from '@/lib/db';
import {
  sendRoomBookingStatusChangeNotification,
  sendRoomBookingApprovalNotification,
  sendRoomBookingRejectionNotification,
  sendRoomBookingCreatedNotification,
  sendNewRoomBookingNotificationToAdmin,
} from '@/lib/services/notificationsService';
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveContext } from '@/lib/services/userCompanyService';
import { checkUnitAccess } from '@/lib/api-permissions';
import { getOrgSubtreeUserIds } from '@/lib/services/attendanceService';
import { resolveApprovalMessages } from '@/lib/telegram/approvalMessageSync';

const ROOM_BOOKINGS_UPDATABLE_COLS = new Set([
  'room_name', 'booking_date', 'start_time', 'end_time', 'purpose',
  'requested_by', 'requested_by_name', 'status', 'approved_by', 'approved_at',
  'confirmed_at', 'confirmed_by', 'confirmation_note', 'updated_at',
  'num_participants', 'has_online_meeting', 'needs_room_setup',
  'cancellation_reason', 'cancelled_by', 'cancelled_at',
  'approval_timestamp', 'approval_by_name', 'rejection_reason',
]);

async function ensureBookingCompanyScope(bookingId: string, companyId: string) {
  return queryOne<{ id: string }>(
    `SELECT b.id
     FROM room_bookings b
     INNER JOIN users u ON u.id::text = b.requested_by::text
     WHERE b.id = $1 AND u.company_id::text = $2::text`,
    [bookingId, companyId]
  );
}

async function canAccessBookingRecord(
  bookingId: string,
  userId: string,
  role: string,
  companyId: string | null
) {
  if (role === 'super_admin') return true;
  if (role === 'admin' && companyId) {
    return !!(await ensureBookingCompanyScope(bookingId, companyId));
  }
  const booking = await queryOne<{ requested_by: string }>(
    'SELECT requested_by::text AS requested_by FROM room_bookings WHERE id = $1',
    [bookingId]
  );
  if (!booking) return false;
  if (role === 'manager') {
    const visibleIds = new Set([userId, ...(await getOrgSubtreeUserIds(userId, companyId))]);
    return visibleIds.has(booking.requested_by);
  }
  return booking.requested_by === userId;
}

async function checkBookingConflict(
  roomName: string,
  bookingDate: string,
  startTime: string,
  endTime: string,
  excludeBookingId: string
): Promise<boolean> {
  const conflicts = await query(
    `SELECT id FROM room_bookings
     WHERE room_name = $1
       AND booking_date = $2
       AND status IN ('approved', 'confirmed')
       AND id != $3
       AND NOT (end_time <= $4 OR start_time >= $5)`,
    [roomName, bookingDate, excludeBookingId, startTime, endTime]
  );
  return conflicts.length > 0;
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const currentUserId = request.headers.get('x-current-user-id');
    const currentUserCompany = request.headers.get('x-current-user-company');
    const ctx = currentUserId
      ? await getEffectiveContext(currentUserId, currentUserCompany || null)
      : null;
    const body = await request.json();
    const { action } = body;
    const participantsInBody: any[] | undefined = Array.isArray(body.participants)
      ? body.participants
      : undefined;

    // Quyền truy cập bản ghi: owner / manager(subtree) / admin(company) / super_admin.
    if (currentUserId && ctx?.role) {
      let allowed = await canAccessBookingRecord(params.id, currentUserId, ctx.role, ctx.company_id);
      // NGƯỜI THAM GIA cũng được XÁC NHẬN sử dụng phòng (dù không phải người đặt).
      if (!allowed && action === 'confirm') {
        const isParticipant = await queryOne<{ id: string }>(
          `SELECT id FROM room_booking_participants
            WHERE booking_id = $1 AND participant_id::text = $2::text LIMIT 1`,
          [params.id, currentUserId]
        );
        allowed = !!isParticipant;
      }
      if (!allowed) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Xác nhận / huỷ là thao tác TỰ PHỤC VỤ của người đặt → KHÔNG đòi quyền module 'edit'
    // (đã kiểm quyền truy cập ở trên). Các sửa khác (đổi phòng/giờ/duyệt) mới cần 'edit'.
    const SELF_SERVICE = new Set(['confirm', 'confirm_usage', 'cancel']);
    if (!SELF_SERVICE.has(action) && !checkUnitAccess(request, 'room-bookings', 'edit')) {
      return NextResponse.json({ error: 'Khong co quyen' }, { status: 403 });
    }

    let updateData: Record<string, unknown>;

    if (action === 'confirm_usage') {
      updateData = {
        status: 'completed',
        confirmed_at: new Date().toISOString(),
        confirmed_by: body.confirmed_by,
        confirmation_note: body.confirmation_note ?? null,
        updated_at: new Date().toISOString(),
      };
    } else if (action === 'confirm') {
      // HỢP NHẤT với quét QR: "xác nhận" tại webapp = NHẬN PHÒNG (check-in) thật,
      // đặt status='checked_in' + checked_in_at + ghi check_in_history — để dù xác
      // nhận qua webapp hay quét QR đều về CÙNG một trạng thái "Đã Nhận Phòng".
      const actorId = currentUserId || body.confirmed_by;
      if (!actorId) return NextResponse.json({ error: 'Thiếu thông tin người dùng' }, { status: 401 });
      const nameRow = await queryOne<{ name: string }>('SELECT name FROM users WHERE id::text = $1', [String(actorId)]);
      const { checkInBooking } = await import('@/lib/services/roomCheckinService');
      const res = await checkInBooking(params.id, String(actorId), nameRow?.name ?? '');
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      const updated = await queryOne<any>('SELECT * FROM room_bookings WHERE id = $1', [params.id]);
      return NextResponse.json({ success: true, data: updated });
    } else if (action === 'cancel') {
      updateData = {
        status: 'cancelled',
        cancellation_reason: body.cancellation_reason || null,
        cancelled_by: body.cancelled_by,
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    } else {
      const { action: _action, ...rest } = body;
      void _action;

      const currentBooking = await queryOne<any>('SELECT * FROM room_bookings WHERE id = $1', [params.id]);
      if (!currentBooking) {
        return NextResponse.json({ error: 'Room booking not found' }, { status: 404 });
      }

      const newRoomName = rest.room_name || currentBooking.room_name;
      const newBookingDate = rest.booking_date || currentBooking.booking_date;
      const newStartTime = rest.start_time || currentBooking.start_time;
      const newEndTime = rest.end_time || currentBooking.end_time;

      const fieldChanged =
        newRoomName !== currentBooking.room_name ||
        newBookingDate !== currentBooking.booking_date ||
        newStartTime !== currentBooking.start_time ||
        newEndTime !== currentBooking.end_time;

      if (fieldChanged) {
        const hasConflict = await checkBookingConflict(
          newRoomName,
          newBookingDate,
          newStartTime,
          newEndTime,
          params.id
        );

        if (hasConflict) {
          return NextResponse.json(
            { error: 'Thời gian này đã có đặt phòng khác' },
            { status: 409 }
          );
        }

        if (currentBooking.confirmed_at) {
          rest.confirmed_at = null;
          rest.confirmed_by = null;
        }
      }

      const filteredEntries = Object.entries(rest).filter(([k]) =>
        ROOM_BOOKINGS_UPDATABLE_COLS.has(k)
      );
      if (filteredEntries.length === 0) {
        return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
      }
      updateData = Object.fromEntries(filteredEntries);

      if (!updateData.updated_at) {
        updateData.updated_at = new Date().toISOString();
      }
    }

    let oldStatus: string | undefined;
    if (updateData.status) {
      const bookingBeforeUpdate = await queryOne<{ status: string }>('SELECT status FROM room_bookings WHERE id = $1', [params.id]);
      oldStatus = bookingBeforeUpdate?.status;
    }

    const cols = Object.keys(updateData);
    const vals = Object.values(updateData);
    const assignments = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
    const sql = `UPDATE room_bookings SET ${assignments} WHERE id = $${cols.length + 1} RETURNING *`;

    const row = await queryOne<any>(sql, [...vals, params.id]);
    if (!row) {
      return NextResponse.json({ error: 'Room booking not found' }, { status: 404 });
    }

    if (participantsInBody) {
      await execute(
        'DELETE FROM room_booking_participants WHERE booking_id = $1',
        [params.id]
      );
      for (const p of participantsInBody) {
        await execute(
          `INSERT INTO room_booking_participants
             (id, booking_id, participant_id, participant_email, participant_name, status, created_at)
           VALUES ($1, $2, $3, $4, $5, 'pending', NOW())`,
          [crypto.randomUUID(), params.id, p.id || null, p.email || null, p.name || null]
        );
      }
    }

    try {
      const newStatus = updateData.status as string || row.status;

      const participants = await query(
        `SELECT id, name FROM users WHERE id::text IN (
          SELECT participant_id FROM room_booking_participants
          WHERE booking_id = $1 AND participant_id IS NOT NULL
        )`,
        [params.id]
      );
      row.participants = participants;

      if (newStatus === 'approved' && oldStatus && oldStatus !== 'approved') {
        const approvedBy = body.approval_by_name || body.approvedBy || body.approved_by || 'Admin';
        updateData.approval_timestamp = new Date().toISOString();
        updateData.approval_by_name = approvedBy;
        await execute(
          `UPDATE room_bookings SET approval_timestamp = $1, approval_by_name = $2, updated_at = $3 WHERE id = $4`,
          [updateData.approval_timestamp, updateData.approval_by_name, new Date().toISOString(), params.id]
        );
        await sendRoomBookingApprovalNotification(row, approvedBy);
        resolveApprovalMessages('room', params.id, 'approved', approvedBy).catch(console.error);
      }

      if (newStatus === 'rejected' && oldStatus && oldStatus !== 'rejected') {
        const rejectedBy = body.approval_by_name || body.rejectedBy || body.approved_by || 'Admin';
        const reason = body.rejection_reason || body.rejectionReason || body.cancellation_reason || undefined;
        updateData.approval_timestamp = new Date().toISOString();
        updateData.approval_by_name = rejectedBy;
        updateData.rejection_reason = reason || null;
        await execute(
          `UPDATE room_bookings SET approval_timestamp = $1, approval_by_name = $2, rejection_reason = $3, updated_at = $4 WHERE id = $5`,
          [updateData.approval_timestamp, updateData.approval_by_name, updateData.rejection_reason, new Date().toISOString(), params.id]
        );
        await sendRoomBookingRejectionNotification(row, rejectedBy, reason);
        resolveApprovalMessages('room', params.id, 'rejected', rejectedBy).catch(console.error);
      }

      if (action === 'confirm' || action === 'cancel' || (action && updateData.status && newStatus !== 'approved' && newStatus !== 'rejected')) {
        const changedBy = body.confirmed_by || body.cancelled_by || 'system';

        const participants = await query(
          `SELECT participant_id FROM room_booking_participants WHERE booking_id = $1 AND participant_id IS NOT NULL`,
          [params.id]
        );
        const participantIds = participants.map((p: any) => p.participant_id);

        await sendRoomBookingStatusChangeNotification(
          params.id,
          newStatus,
          changedBy,
          row.requested_by_name || 'User',
          row.room_name,
          row.booking_date,
          participantIds
        );
        // Booking bị huỷ → gỡ nút duyệt còn treo trên Telegram.
        if (newStatus === 'cancelled') {
          resolveApprovalMessages('room', params.id, 'cancelled', changedBy).catch(console.error);
        }
      }

      if (newStatus === 'pending' && oldStatus && oldStatus !== 'pending') {
        const partsForNotif = await query<{ id: string; name: string }>(
          `SELECT u.id, u.name FROM users u
           WHERE u.id::text IN (
             SELECT participant_id FROM room_booking_participants
             WHERE booking_id = $1 AND participant_id IS NOT NULL
           )`,
          [params.id]
        );
        await sendRoomBookingCreatedNotification(
          params.id,
          { id: row.requested_by, name: row.requested_by_name || 'User' },
          partsForNotif,
          row.room_name,
          row.booking_date,
          row.start_time,
          row.end_time,
          row.purpose || '',
          true
        );
        await sendNewRoomBookingNotificationToAdmin(
          { ...row, participants: partsForNotif },
          true
        );
      }
    } catch (notifError) {
      console.error('Error sending booking status notification:', notifError);
    }

    const finalParticipants = await query(
      `SELECT participant_id AS id, participant_email AS email, participant_name AS name
       FROM room_booking_participants
       WHERE booking_id = $1
       ORDER BY created_at ASC`,
      [params.id]
    );
    return NextResponse.json({ ...row, participants: finalParticipants });
  } catch (error) {
    console.error('Error updating room booking:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update room booking' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const currentUserId = request.headers.get('x-current-user-id');
    const currentUserCompany = request.headers.get('x-current-user-company');
    const ctx = currentUserId
      ? await getEffectiveContext(currentUserId, currentUserCompany || null)
      : null;
    if (ctx?.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Chỉ Super Admin mới có thể xóa booking' },
        { status: 403 }
      );
    }

    const booking = await queryOne(
      'SELECT id, room_name, booking_date FROM room_bookings WHERE id = $1',
      [params.id]
    );

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking không tồn tại' },
        { status: 404 }
      );
    }

    await execute('DELETE FROM room_bookings WHERE id = $1', [params.id]);

    return NextResponse.json({
      message: 'Booking đã được xóa vĩnh viễn',
      id: params.id,
      deletedBooking: {
        room_name: booking.room_name,
        booking_date: booking.booking_date,
      },
    });
  } catch (error) {
    console.error('Error deleting room booking:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi khi xóa booking' },
      { status: 500 }
    );
  }
}
