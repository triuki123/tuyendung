import { query, queryOne } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveContext } from '@/lib/services/userCompanyService';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params;
    const currentUserId = request.headers.get('x-current-user-id');
    if (!currentUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const activeCompany = request.headers.get('x-current-user-company');
    const ctx = await getEffectiveContext(currentUserId, activeCompany);
    const currentUserRole = ctx?.role ?? 'user';

    const limit = request.nextUrl.searchParams.get('limit') || '100';
    const offset = request.nextUrl.searchParams.get('offset') || '0';
    const eventType = request.nextUrl.searchParams.get('type'); // optional filter
    const actorId = request.nextUrl.searchParams.get('actor'); // optional filter by actor

    if (!id) {
      return NextResponse.json({ error: 'ticket ID required' }, { status: 400 });
    }

    // Chỉ admin/super_admin mới xem audit log đầy đủ; user thường chỉ xem ticket của mình
    const ticket = await queryOne<any>('SELECT id, created_by, assigned_to FROM tickets WHERE id = $1', [id]);
    if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });

    const isAdminOrManager = currentUserRole === 'admin' || currentUserRole === 'super_admin' || currentUserRole === 'manager';
    const isRelated = ticket.created_by === currentUserId || ticket.assigned_to === currentUserId;
    if (!isAdminOrManager && !isRelated) {
      return NextResponse.json({ error: 'Không có quyền xem lịch sử' }, { status: 403 });
    }

    // Build audit query with optional filters
    let auditQuery = `
      SELECT
        a.id, a.ticket_id, a.event_type, a.actor_id, a.actor_name,
        a.old_value, a.new_value, a.related_entity_id, a.metadata, a.created_at
      FROM ticket_audit_events a
      WHERE a.ticket_id = $1
    `;

    const params_arr = [id];
    let paramCount = 2;

    if (eventType && eventType !== 'all') {
      auditQuery += ` AND a.event_type = $${paramCount}`;
      params_arr.push(eventType);
      paramCount++;
    }

    if (actorId) {
      auditQuery += ` AND a.actor_id = $${paramCount}`;
      params_arr.push(actorId);
      paramCount++;
    }

    auditQuery += ` ORDER BY a.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params_arr.push(limit, offset);

    const events = await query<any>(auditQuery, params_arr);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as count FROM ticket_audit_events WHERE ticket_id = $1';
    const countParams = [id];

    if (eventType && eventType !== 'all') {
      countQuery += ` AND event_type = $2`;
      countParams.push(eventType);
    }

    if (actorId) {
      const nextParam = countParams.length + 1;
      countQuery += ` AND actor_id = $${nextParam}`;
      countParams.push(actorId);
    }

    const total = await queryOne<{ count: string }>(countQuery, countParams);

    return NextResponse.json({
      success: true,
      events,
      total: parseInt(total?.count || '0'),
      has_more: parseInt(offset) + parseInt(limit) < parseInt(total?.count || '0'),
    });
  } catch (error) {
    console.error('GET /api/tickets/[id]/audit-log error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch audit log' },
      { status: 500 }
    );
  }
}
