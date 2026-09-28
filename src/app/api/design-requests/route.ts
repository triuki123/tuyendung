import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { execute, query, queryOne } from '@/lib/db';
import { getEffectiveContext } from '@/lib/services/userCompanyService';
import { getDesignAssignee } from '@/lib/services/designRequestAssigneeService';
import { notify } from '@/lib/notifications/engine';

export const dynamic = 'force-dynamic';

const STATUS_VALUES = ['new', 'accepted', 'in_progress', 'review', 'revision_requested', 'approved', 'completed', 'rejected', 'archived', 'blocked'];
const PRIORITY_VALUES = ['low', 'normal', 'high', 'urgent'];

async function context(request: NextRequest) {
  const userId = request.headers.get('x-current-user-id');
  if (!userId) return null;
  const company = request.headers.get('x-current-user-company');
  const effective = await getEffectiveContext(userId, company || null);
  return effective ? { userId, effective } : null;
}

// Chuẩn hoá danh sách người thực hiện từ body — chấp nhận cả assignee_ids
// (mảng, nhiều người/1 team) lẫn assignee_id cũ (tương thích ngược, 1 người).
function requestedAssigneeIds(body: any): string[] {
  const list: unknown[] = Array.isArray(body.assignee_ids) ? body.assignee_ids : (body.assignee_id ? [body.assignee_id] : []);
  return [...new Set(list.map((x) => String(x || '').trim()).filter(Boolean))] as string[];
}

const ASSIGNEES_AGG = `COALESCE((
  SELECT json_agg(json_build_object('id', a.user_id, 'name', a.user_name) ORDER BY a.created_at)
  FROM design_request_assignees a WHERE a.design_request_id = design_requests.id
), '[]'::json) AS assignees`;

export async function GET(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'design-requests', 'view')) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const ctx = await context(request);
    if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const params: unknown[] = [];
    const where: string[] = [];
    if (ctx.effective.role !== 'super_admin') {
      params.push(ctx.effective.company_id || '__none__');
      where.push(`company_id = $${params.length}`);
    }
    const status = request.nextUrl.searchParams.get('status');
    if (status) { params.push(status); where.push(`status = $${params.length}`); }
    const rows = await query(
      `SELECT design_requests.*, ${ASSIGNEES_AGG} FROM design_requests
       WHERE ${where.join(' AND ') || 'TRUE'} ORDER BY archived_at NULLS FIRST, created_at DESC`,
      params
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/design-requests error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'design-requests', 'create')) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const ctx = await context(request);
    if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const body = await request.json();
    if (!String(body.title || '').trim()) return NextResponse.json({ error: 'Thiếu tên yêu cầu' }, { status: 400 });
    if (!ctx.effective.company_id) return NextResponse.json({ error: 'Vui lòng chọn công ty' }, { status: 400 });
    if (body.priority && !PRIORITY_VALUES.includes(body.priority)) return NextResponse.json({ error: 'Mức ưu tiên không hợp lệ' }, { status: 400 });
    const assigneeIds = requestedAssigneeIds(body);
    if (!assigneeIds.length) return NextResponse.json({ error: 'Vui lòng chọn ít nhất 1 người thực hiện' }, { status: 400 });
    const assignees = await replaceAssigneesPreflight(ctx.effective.company_id, assigneeIds);
    if (!assignees.length) return NextResponse.json({ error: 'Không tìm thấy người được chọn trong công ty' }, { status: 400 });
    const primary = assignees[0];
    const user = await queryOne<{ name: string }>('SELECT name FROM users WHERE id = $1', [ctx.userId]);
    const row = await queryOne<{ id: string; title: string; due_date: string | null }>(`INSERT INTO design_requests
      (company_id,title,description,request_type,priority,requester_id,requester_name,assignee_id,assignee_name,brief_url,quantity,estimated_hours,due_date,
       campaign_name,channel,brief_detail,design_spec,resources)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`, [
      ctx.effective.company_id, String(body.title).trim(), String(body.description || ''), body.request_type || 'other',
      body.priority || 'normal', ctx.userId, user?.name || '', primary.id, primary.name,
      body.brief_url || null, Math.max(1, Number(body.quantity) || 1), body.estimated_hours || null, body.due_date || null,
      body.campaign_name || null, body.channel || null,
      body.brief_detail ? JSON.stringify(body.brief_detail) : null,
      body.design_spec ? JSON.stringify(body.design_spec) : null,
      body.resources ? JSON.stringify(body.resources) : null,
    ]);
    if (row) {
      for (const a of assignees) {
        await execute(`INSERT INTO design_request_assignees (design_request_id, user_id, user_name) VALUES ($1,$2,$3) ON CONFLICT (design_request_id, user_id) DO NOTHING`, [row.id, a.id, a.name]);
      }
      const dueDate = row.due_date ? ` — hạn ${new Date(row.due_date).toLocaleDateString('vi-VN')}` : '';
      await notify('design.request.assigned', { requesterName: user?.name || 'Đồng nghiệp', title: row.title, dueDate },
        { recipients: assignees.map(a => a.id), relatedId: row.id }).catch(() => {});
    }
    return NextResponse.json({ success: true, data: { ...row, assignees } });
  } catch (err) {
    console.error('POST /api/design-requests error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

async function replaceAssigneesPreflight(companyId: string | null, ids: string[]) {
  if (!companyId) return [];
  const resolved: { id: string; name: string }[] = [];
  for (const id of ids) {
    const a = await getDesignAssignee(companyId, id);
    if (a) resolved.push({ id: a.id, name: a.name });
  }
  return resolved;
}

export async function PATCH(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'design-requests', 'edit')) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const ctx = await context(request);
    if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: 'Thiếu mã yêu cầu' }, { status: 400 });
    if (body.status && !STATUS_VALUES.includes(body.status)) return NextResponse.json({ error: 'Trạng thái không hợp lệ' }, { status: 400 });
    if (body.priority && !PRIORITY_VALUES.includes(body.priority)) return NextResponse.json({ error: 'Mức ưu tiên không hợp lệ' }, { status: 400 });
    if (body.status === 'blocked' && !String(body.block_reason || '').trim()) return NextResponse.json({ error: 'Vui lòng chọn lý do bị chặn' }, { status: 400 });

    let assignees: { id: string; name: string }[] | null = null;
    let primaryId: string | null = null;
    let primaryName: string | null = null;
    if (Array.isArray(body.assignee_ids)) {
      const ids = requestedAssigneeIds(body);
      assignees = await replaceAssigneesPreflight(ctx.effective.company_id, ids);
      if (ids.length && !assignees.length) return NextResponse.json({ error: 'Không tìm thấy người được chọn trong công ty' }, { status: 400 });
      primaryId = assignees[0]?.id || null;
      primaryName = assignees[0]?.name || null;
    }

    const completed = body.status === 'completed' ? 'NOW()' : 'completed_at';
    const archived = body.status === 'archived' ? 'NOW()' : 'archived_at';
    const row = await queryOne<any>(`UPDATE design_requests SET
      title=COALESCE($2,title), description=COALESCE($3,description), request_type=COALESCE($4,request_type),
      priority=COALESCE($5,priority), quantity=COALESCE($6,quantity), due_date=COALESCE($7,due_date),
      brief_url=COALESCE($8,brief_url), estimated_hours=COALESCE($9,estimated_hours),
      status=COALESCE($10,status), assignee_id=COALESCE($11,assignee_id), assignee_name=COALESCE($12,assignee_name),
      result_url=COALESCE($13,result_url), result_note=COALESCE($14,result_note), actual_hours=COALESCE($15,actual_hours),
      campaign_name=COALESCE($16,campaign_name), channel=COALESCE($17,channel),
      brief_detail=COALESCE($18::jsonb,brief_detail), design_spec=COALESCE($19::jsonb,design_spec), resources=COALESCE($20::jsonb,resources),
      block_reason=CASE WHEN $10='blocked' THEN $21 WHEN $10 IS NOT NULL THEN NULL ELSE block_reason END,
      block_note=CASE WHEN $10='blocked' THEN $22 WHEN $10 IS NOT NULL THEN NULL ELSE block_note END,
      completed_at=${completed}, archived_at=${archived}, updated_at=NOW()
      WHERE id=$1 AND ($23::text IS NULL OR company_id=$23) RETURNING *`, [
      body.id, body.title?.trim() || null, body.description ?? null, body.request_type || null,
      body.priority || null, body.quantity != null ? Math.max(1, Number(body.quantity) || 1) : null,
      body.due_date || null, body.brief_url ?? null, body.estimated_hours || null,
      body.status || null, primaryId, primaryName,
      body.result_url ?? null, body.result_note ?? null, body.actual_hours || null,
      body.campaign_name ?? null, body.channel ?? null,
      body.brief_detail ? JSON.stringify(body.brief_detail) : null,
      body.design_spec ? JSON.stringify(body.design_spec) : null,
      body.resources ? JSON.stringify(body.resources) : null,
      body.block_reason || null, body.block_note ?? null,
      ctx.effective.role === 'super_admin' ? null : ctx.effective.company_id]);
    if (!row) return NextResponse.json({ error: 'Không tìm thấy yêu cầu' }, { status: 404 });

    if (assignees) {
      await execute('DELETE FROM design_request_assignees WHERE design_request_id = $1', [row.id]);
      for (const a of assignees) {
        await execute(`INSERT INTO design_request_assignees (design_request_id, user_id, user_name) VALUES ($1,$2,$3) ON CONFLICT (design_request_id, user_id) DO NOTHING`, [row.id, a.id, a.name]);
      }
      row.assignees = assignees;
    } else {
      row.assignees = await query(`SELECT user_id AS id, user_name AS name FROM design_request_assignees WHERE design_request_id = $1 ORDER BY created_at`, [row.id]);
    }

    if (body.status && ['revision_requested', 'approved', 'blocked'].includes(body.status)) {
      const actor = await queryOne<{ name: string }>('SELECT name FROM users WHERE id = $1', [ctx.userId]);
      const actorName = actor?.name || 'Đồng nghiệp';
      const teamIds: string[] = (row.assignees || []).map((a: { id: string }) => a.id);
      if (body.status === 'revision_requested' && teamIds.length) {
        await notify('design.request.revision_requested', { requesterName: actorName, title: row.title },
          { recipients: teamIds, relatedId: row.id }).catch(() => {});
      } else if (body.status === 'approved' && teamIds.length) {
        await notify('design.request.approved', { requesterName: actorName, title: row.title },
          { recipients: teamIds, relatedId: row.id }).catch(() => {});
      } else if (body.status === 'blocked' && row.requester_id) {
        await notify('design.request.blocked', { assigneeName: actorName, title: row.title, reason: body.block_reason },
          { recipients: [row.requester_id], relatedId: row.id }).catch(() => {});
      }
    }
    return NextResponse.json({ success: true, data: row });
  } catch (err) {
    console.error('PATCH /api/design-requests error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'design-requests', 'delete')) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const ctx = await context(request);
    if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Thiếu mã yêu cầu' }, { status: 400 });
    await execute('DELETE FROM design_requests WHERE id=$1 AND ($2::text IS NULL OR company_id=$2)', [id, ctx.effective.role === 'super_admin' ? null : ctx.effective.company_id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/design-requests error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
