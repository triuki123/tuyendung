import { query, queryOne, execute, buildInsert } from '@/lib/db';
import { sendTicketNotification, sendTicketAssignmentTelegram } from '@/lib/services/notificationsService';
import { getOrgSubtreeUserIds } from '@/lib/services/attendanceService';
import { getCompanyMemberUserIds, getEffectiveContext } from '@/lib/services/userCompanyService';
import { MOCK_TICKETS } from '@/lib/mockData';
import { NextRequest, NextResponse } from 'next/server';
import { checkModuleAccess } from '@/lib/api-permissions';
import { decodeIdentityHeader } from '@/lib/authCookie';

function isValidUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

// Sinh ma ticket TK-YYYY-NNNN tu DB dung sequence (prevent race condition)
async function generateTicketCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `TK-${year}-`;

  // Use database sequence to get next number (thread-safe, no race condition)
  const result = await queryOne<{ nextval: string }>(
    `SELECT nextval('ticket_code_seq')::text AS nextval`
  );

  const number = result?.nextval || '1';
  return `${prefix}${String(parseInt(number)).padStart(4, '0')}`;
}

function useMockTickets(userId: string, userRole: string): any[] {
  const isAdmin = userRole === 'super_admin' || userRole === 'admin';
  const transformedTickets = MOCK_TICKETS.map((t: any) => ({
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
  if (isAdmin) return transformedTickets;
  return transformedTickets.filter(
    (t: any) => t.created_by === userId || t.assigned_to === userId
  );
}

export async function GET(request: NextRequest) {
  try {
    if (!checkModuleAccess(request, 'tickets', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);

    // Role is resolved server-side from the DB; client role header is not trusted.
    // Note: real session/JWT authentication is still required and not implemented here.
    let currentUserId = request.headers.get('x-current-user-id');

    if (!currentUserId) currentUserId = searchParams.get('userId');

    if (!currentUserId) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    }

    const activeCompany = request.headers.get('x-current-user-company');

    // Resolve role từ DB — không tin header x-current-user-role
    let role: string = 'user';
    if (isValidUUID(currentUserId)) {
      const effectiveContext = await getEffectiveContext(currentUserId, activeCompany);
      role = effectiveContext?.role ?? 'user';
    }

    // Mặc định ẩn ticket đã lưu trữ; truyền ?include_archived=true để lấy cả.
    const includeArchived = searchParams.get('include_archived') === 'true';
    const archiveClause = includeArchived ? '' : 'archived_at IS NULL';

    let tickets: any[] = [];

    if (!isValidUUID(currentUserId)) {
      tickets = useMockTickets(currentUserId, role);
    } else if (role === 'super_admin') {
      tickets = await query(
        `SELECT * FROM tickets${archiveClause ? ` WHERE ${archiveClause}` : ''} ORDER BY created_at DESC`
      );
    } else if (role === 'admin') {
      const companyUserIds = activeCompany ? await getCompanyMemberUserIds(activeCompany) : [];
      if (companyUserIds.length === 0) return NextResponse.json([]);
      tickets = await query(
        `SELECT * FROM tickets
         WHERE (created_by::text = ANY($1::text[]) OR assigned_to::text = ANY($1::text[]))
         ${archiveClause ? `AND ${archiveClause}` : ''}
         ORDER BY created_at DESC`,
        [companyUserIds]
      );
    } else if (role === 'manager') {
      // Manager xem ticket của mình + toàn bộ cấp dưới trong công ty active
      const subordinateIds = await getOrgSubtreeUserIds(currentUserId, activeCompany);
      const allIds = [currentUserId, ...subordinateIds];
      tickets = await query(
        `SELECT * FROM tickets
         WHERE (created_by::text = ANY($1::text[]) OR assigned_to::text = ANY($1::text[]))
         ${archiveClause ? `AND ${archiveClause}` : ''}
         ORDER BY created_at DESC`,
        [allIds]
      );
    } else {
      // Người dùng thường: chỉ xem ticket của chính mình
      const extra = archiveClause ? ` AND ${archiveClause}` : '';
      const [created, assigned] = await Promise.all([
        query(`SELECT * FROM tickets WHERE created_by = $1${extra} ORDER BY created_at DESC`, [currentUserId]),
        query(`SELECT * FROM tickets WHERE assigned_to = $1${extra} ORDER BY created_at DESC`, [currentUserId]),
      ]);
      const ticketMap = new Map<string, any>();
      [...created, ...assigned].forEach((t) => ticketMap.set(t.id, t));
      tickets = Array.from(ticketMap.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }

    return NextResponse.json(tickets);
  } catch (error) {
    console.error('Tickets fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch tickets' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!checkModuleAccess(request, 'tickets', 'create')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const body = await request.json();
    const actorId = request.headers.get('x-current-user-id');
    if (!actorId) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    }
    const actorName = decodeIdentityHeader(request.headers.get('x-current-user-name')) || body.created_by_name;
    body.created_by = actorId;
    body.created_by_name = actorName;
    body.requester_id = actorId;
    body.requester_name = actorName;

    // Non-UUID user → return mock ticket without persisting
    if (!isValidUUID(body.created_by)) {
      console.log('Creating mock ticket for non-UUID userId:', body.created_by);
      const mockTicket = {
        id: `ticket-${Date.now()}`,
        code: body.code || `TK-${new Date().getFullYear()}-MOCK`,
        title: body.title,
        description: body.description,
        asset_code: body.asset_code,
        asset_name: body.asset_name,
        priority: body.priority,
        status: body.status || 'open',
        created_by: body.created_by,
        created_by_name: body.created_by_name,
        assigned_to: body.assigned_to,
        assigned_to_name: body.assigned_to_name,
        support_category: body.support_category,
        assigned_unit_tag_id: body.assigned_unit_tag_id || null,
        assigned_unit_name: body.assigned_unit_name || null,
        request_type: body.request_type || null,
        category_id: body.category_id || null,
        category_name: body.category_name || null,
        custom_fields: body.custom_fields || {},
        requester_id: body.requester_id || body.created_by || null,
        requester_name: body.requester_name || body.created_by_name || null,
        requester_department: body.requester_department || null,
        requester_position: body.requester_position || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (mockTicket.support_category) {
        console.log(`[MOCK] Would send notification to users with tag: ${mockTicket.support_category}`);
      } else if (mockTicket.assigned_to) {
        console.log(`[MOCK] Would send notification to assigned user: ${mockTicket.assigned_to}`);
      }
      return NextResponse.json(mockTicket);
    }

    // Assign to support_category when no explicit assignee
    let assignedTo = body.assigned_to;
    let assignedToName = body.assigned_to_name;
    if (body.support_category && !assignedTo) {
      assignedTo = body.support_category;
      assignedToName = body.support_category;
      console.log('Assigned to support category:', body.support_category);
    }

    // Resolve ten phong ban (va chuc danh) cua nguoi yeu cau tu DB -> tranh luu UUID.
    // users.department la TEXT chua UUID phong ban; department_id la UUID.
    const requesterId = body.requester_id || body.created_by || null;
    let requesterDepartment = body.requester_department || null;
    let requesterPosition = body.requester_position || null;
    if (requesterId && isValidUUID(requesterId)) {
      const info = await queryOne<{ dept_name: string | null; position: string | null }>(
        `SELECT COALESCE(d1.name, d2.name) AS dept_name, u."position" AS position
           FROM users u
           LEFT JOIN departments d1 ON d1.id::text = u.department_id::text
           LEFT JOIN departments d2 ON d2.id::text = NULLIF(u.department, '')
          WHERE u.id = $1`,
        [requesterId]
      );
      if (info?.dept_name) requesterDepartment = info.dept_name;
      if (!requesterPosition && info?.position) requesterPosition = info.position;
    }

    const ticketData = {
      code: await generateTicketCode(),
      title: body.title,
      description: body.description,
      asset_code: body.asset_code,
      asset_name: body.asset_name,
      priority: body.priority || 'medium',
      status: body.status || 'open',
      created_by: body.created_by,
      created_by_name: body.created_by_name,
      assigned_to: assignedTo || null,
      assigned_to_name: assignedToName || null,
      support_category: body.support_category,
      assigned_unit_tag_id: body.assigned_unit_tag_id || null,
      assigned_unit_name: body.assigned_unit_name || null,
      request_type: body.request_type || null,
      category_id: body.category_id || null,
      category_name: body.category_name || null,
      custom_fields: body.custom_fields || {},
      requester_id: requesterId,
      requester_name: body.requester_name || body.created_by_name || null,
      requester_department: requesterDepartment,
      requester_position: requesterPosition,
    };

    const { text, params } = buildInsert('tickets', ticketData);
    const newTicket = await queryOne<any>(text, params);
    if (!newTicket) throw new Error('Insert returned no row');

    // Record initial status in history
    await execute(
      `INSERT INTO ticket_status_history
         (ticket_id, old_status, new_status, changed_by, changed_by_name, reason, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        newTicket.id,
        null,
        newTicket.status || 'open',
        body.created_by,
        body.created_by_name,
        'Ticket created',
        new Date().toISOString(),
      ]
    );

    if (newTicket.support_category || newTicket.assigned_to) {
      await sendTicketNotification(newTicket);
    }

    // Send Telegram notification to assigned user
    if (newTicket.assigned_to && isValidUUID(newTicket.assigned_to)) {
      await sendTicketAssignmentTelegram(newTicket);
    }

    // Add followers vào ticket_watchers để họ nhận thông báo như watcher
    const followers: string[] = Array.isArray(body.followers) ? body.followers : [];
    if (followers.length > 0) {
      await Promise.all(
        followers
          .filter(id => isValidUUID(id))
          .map(userId =>
            execute(
              `INSERT INTO ticket_watchers (ticket_id, user_id, watch_type, muted, created_at)
               VALUES ($1, $2, 'all', false, NOW())
               ON CONFLICT (ticket_id, user_id) DO NOTHING`,
              [newTicket.id, userId]
            )
          )
      );
    }

    return NextResponse.json(newTicket);
  } catch (error) {
    console.error('Ticket creation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create ticket' },
      { status: 500 }
    );
  }
}
