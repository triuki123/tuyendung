import { queryOne, execute } from '@/lib/db';
import { sendTicketAssignmentTelegram, sendTicketEscalationAlert, sendTicketStatusChangeTelegram, notifyTicketWatchers } from '@/lib/services/notificationsService';
import { MOCK_TICKETS } from '@/lib/mockData';
import { NextRequest, NextResponse } from 'next/server';
import { checkModuleAccess } from '@/lib/api-permissions';
import { getCompanyMemberUserIds, getEffectiveContext } from '@/lib/services/userCompanyService';
import { getOrgSubtreeUserIds } from '@/lib/services/attendanceService';

// In-memory mock store (mirrors original behaviour for non-UUID users)
let mockTicketsStore = MOCK_TICKETS.map((t: any) => ({
  id: t.id,
  code: t.code,
  title: t.title,
  description: t.description,
  asset_code: t.assetCode,
  asset_name: t.assetName,
  priority: t.priority,
  status: t.status,
  created_by: t.createdBy,
  created_by_name: t.createdByName,
  assigned_to: t.assignedTo,
  assigned_to_name: t.assignedToName,
  support_category: t.support_category,
  created_at: t.createdAt,
  updated_at: t.updatedAt,
}));

function isValidUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

async function canAccessTicketData(
  userId: string,
  effectiveRole: string,
  companyId: string | null,
  ticket: { created_by?: string | null; assigned_to?: string | null }
): Promise<boolean> {
  if (effectiveRole === 'super_admin') return true;
  if (ticket.created_by === userId || ticket.assigned_to === userId) return true;

  if (effectiveRole === 'admin') {
    const ids = companyId ? await getCompanyMemberUserIds(companyId) : [];
    return ids.includes(ticket.created_by || '') || ids.includes(ticket.assigned_to || '');
  }
  if (effectiveRole === 'manager') {
    const ids = await getOrgSubtreeUserIds(userId, companyId);
    return ids.includes(ticket.created_by || '') || ids.includes(ticket.assigned_to || '');
  }
  return false;
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkModuleAccess(request, 'tickets', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const { id } = await params;
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const activeCompany = request.headers.get('x-current-user-company');
    const effectiveContext = isValidUUID(userId)
      ? await getEffectiveContext(userId, activeCompany)
      : null;
    const effectiveRole = effectiveContext?.role ?? 'user';

    let ticket: any = null;
    if (!isValidUUID(userId)) {
      ticket = mockTicketsStore.find((t) => t.id === id);
    } else {
      ticket = await queryOne('SELECT * FROM tickets WHERE id = $1', [id]);
    }

    if (!ticket) {
      return NextResponse.json({ error: 'Không tìm thấy ticket' }, { status: 404 });
    }

    if (!(await canAccessTicketData(userId, effectiveRole, activeCompany, ticket))) {
      return NextResponse.json({ error: 'Không có quyền truy cập ticket này' }, { status: 403 });
    }

    return NextResponse.json(ticket);
  } catch (error) {
    console.error('Ticket fetch error:', error);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkModuleAccess(request, 'tickets', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const { id } = await params;
    const body = await request.json();
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const activeCompany = request.headers.get('x-current-user-company');
    const effectiveContext = isValidUUID(userId)
      ? await getEffectiveContext(userId, activeCompany)
      : null;
    const effectiveRole = effectiveContext?.role ?? 'user';

    // Fetch existing ticket for permission check and status-change detection
    let existingTicket: any = null;
    if (!isValidUUID(userId)) {
      existingTicket = mockTicketsStore.find((t) => t.id === id);
    } else {
      existingTicket = await queryOne('SELECT * FROM tickets WHERE id = $1', [id]);
    }

    if (!existingTicket) {
      return NextResponse.json({ error: 'Không tìm thấy ticket' }, { status: 404 });
    }

    const isAssigned = existingTicket.assigned_to === userId;
    const isAdmin = effectiveRole === 'super_admin' || effectiveRole === 'admin';

    if (!(await canAccessTicketData(userId, effectiveRole, activeCompany, existingTicket))) {
      return NextResponse.json({ error: 'Không có quyền cập nhật ticket này' }, { status: 403 });
    }

    // Only admin or currently assigned user can reassign
    if (!isAdmin && !isAssigned && body.assigned_to !== existingTicket.assigned_to) {
      return NextResponse.json(
        { error: 'Chỉ Admin hoặc người được giao hiện tại mới có quyền thay đổi người được giao' },
        { status: 403 }
      );
    }

    let updatedTicket: any;

    if (!isValidUUID(userId)) {
      console.log('Updating mock ticket:', id);
      const idx = mockTicketsStore.findIndex((t) => t.id === id);
      if (idx === -1) {
        return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
      }
      updatedTicket = {
        ...mockTicketsStore[idx],
        title: body.title ?? mockTicketsStore[idx].title,
        description: body.description ?? mockTicketsStore[idx].description,
        priority: body.priority ?? mockTicketsStore[idx].priority,
        status: body.status ?? mockTicketsStore[idx].status,
        assigned_to: body.assigned_to ?? mockTicketsStore[idx].assigned_to,
        assigned_to_name: body.assigned_to_name ?? mockTicketsStore[idx].assigned_to_name,
        support_category: body.support_category ?? mockTicketsStore[idx].support_category,
        updated_at: new Date().toISOString(),
      };
      mockTicketsStore[idx] = updatedTicket;
    } else {
      const newStatus = body.status ?? existingTicket.status;
      const oldStatus = existingTicket.status;
      const now = new Date().toISOString();

      const rejectionReason = body.rejection_reason ?? null;
      const isRejecting = newStatus === 'rejected';

      updatedTicket = await queryOne(
        `UPDATE tickets
         SET title = $1, description = $2, priority = $3, status = $4,
             assigned_to = $5, assigned_to_name = $6, support_category = $7, updated_at = $8,
             rejection_reason = CASE WHEN $10::text IS NOT NULL THEN $10::text ELSE rejection_reason END,
             rejected_by      = CASE WHEN $11 = true THEN $12 ELSE rejected_by END,
             rejected_at      = CASE WHEN $11 = true THEN $8::timestamptz ELSE rejected_at END
         WHERE id = $9
         RETURNING *`,
        [
          body.title ?? existingTicket.title,       // $1
          body.description ?? existingTicket.description, // $2
          body.priority ?? existingTicket.priority,       // $3
          newStatus,                                      // $4
          body.assigned_to ?? existingTicket.assigned_to, // $5
          body.assigned_to_name ?? existingTicket.assigned_to_name, // $6
          body.support_category ?? existingTicket.support_category, // $7
          now,                                            // $8
          id,                                             // $9
          rejectionReason,                                // $10
          isRejecting,                                    // $11
          userId,                                         // $12
        ]
      );

      if (!updatedTicket) throw new Error('Update returned no row');

      // Get user name for audit trail
      const changedUser = await queryOne<{ name: string }>(
        'SELECT name FROM users WHERE id = $1',
        [userId]
      );
      const userName = changedUser?.name || 'Unknown';

      // Log status change to audit events
      if (newStatus !== oldStatus) {
        console.log(`Ticket ${id} status changed from ${oldStatus} to ${newStatus}`);
        await execute(
          `INSERT INTO ticket_status_history
             (ticket_id, old_status, new_status, changed_by, changed_by_name, reason, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, oldStatus, newStatus, userId, userName, body.reason || null, now]
        );

        // Log to audit events
        await execute(
          `INSERT INTO ticket_audit_events
            (ticket_id, event_type, actor_id, actor_name, old_value, new_value, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
          [
            id,
            'status_changed',
            userId,
            userName,
            JSON.stringify({ status: oldStatus }),
            JSON.stringify({ status: newStatus }),
            JSON.stringify({ reason: body.reason || null }),
          ]
        );
      }

      // Log assignment change to audit events
      if (body.assigned_to && body.assigned_to !== existingTicket.assigned_to) {
        await execute(
          `INSERT INTO ticket_audit_events
            (ticket_id, event_type, actor_id, actor_name, old_value, new_value, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [
            id,
            'assigned',
            userId,
            userName,
            JSON.stringify({ assigned_to: existingTicket.assigned_to, assigned_to_name: existingTicket.assigned_to_name }),
            JSON.stringify({ assigned_to: body.assigned_to, assigned_to_name: body.assigned_to_name }),
          ]
        );
      }

      // Log priority change to audit events
      if (body.priority && body.priority !== existingTicket.priority) {
        await execute(
          `INSERT INTO ticket_audit_events
            (ticket_id, event_type, actor_id, actor_name, old_value, new_value, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [
            id,
            'priority_changed',
            userId,
            userName,
            JSON.stringify({ priority: existingTicket.priority }),
            JSON.stringify({ priority: body.priority }),
          ]
        );
      }

      // Send Telegram notification if assignment changed
      const assignmentChanged = body.assigned_to && body.assigned_to !== existingTicket.assigned_to;
      if (assignmentChanged && isValidUUID(body.assigned_to)) {
        await sendTicketAssignmentTelegram(updatedTicket);
      }

      // Send status change notification to assignee and creator
      if (newStatus !== oldStatus) {
        await sendTicketStatusChangeTelegram(updatedTicket, oldStatus, newStatus, userName);

        // Notify watchers (bỏ qua assigned_to và created_by đã nhận ở trên)
        await notifyTicketWatchers({
          ticket: updatedTicket,
          eventType: 'status',
          actorId: userId,
          actorName: userName,
          oldStatus,
          newStatus,
          excludeUserIds: [updatedTicket.assigned_to, updatedTicket.created_by].filter(Boolean),
        }).catch((err) => console.error('[Watcher status notify] error:', err));
      }

      // Send escalation alert if priority increased to CRITICAL/URGENT
      const priorityChanged = body.priority && body.priority !== existingTicket.priority;
      if (priorityChanged && isValidUUID(updatedTicket.assigned_to)) {
        await sendTicketEscalationAlert(updatedTicket, existingTicket.priority);
      }
    }

    return NextResponse.json(updatedTicket);
  } catch (error) {
    console.error('Ticket update error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update ticket' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkModuleAccess(request, 'tickets', 'delete')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const { id } = await params;
    const body = await request.json();
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const activeCompany = request.headers.get('x-current-user-company');
    const effectiveContext = isValidUUID(userId)
      ? await getEffectiveContext(userId, activeCompany)
      : null;
    const effectiveRole = effectiveContext?.role ?? 'user';

    let existingTicket: any = null;
    if (!isValidUUID(userId)) {
      existingTicket = mockTicketsStore.find((t) => t.id === id);
    } else {
      existingTicket = await queryOne('SELECT * FROM tickets WHERE id = $1', [id]);
    }

    if (!existingTicket) {
      return NextResponse.json({ error: 'Không tìm thấy ticket' }, { status: 404 });
    }

    if (!(await canAccessTicketData(userId, effectiveRole, activeCompany, existingTicket))) {
      return NextResponse.json(
        { error: 'Chỉ người tạo hoặc Admin có quyền xóa ticket này' },
        { status: 403 }
      );
    }

    if (!isValidUUID(userId)) {
      mockTicketsStore = mockTicketsStore.filter((t) => t.id !== id);
    } else {
      await execute('DELETE FROM tickets WHERE id = $1', [id]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Ticket delete error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete ticket' },
      { status: 500 }
    );
  }
}
