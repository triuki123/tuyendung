import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { query, queryOne } from '@/lib/db';
import { getEffectiveContext } from '@/lib/services/userCompanyService';
import { notify } from '@/lib/notifications/engine';

export const dynamic = 'force-dynamic';

async function loadRequestScoped(id: string, userId: string, companyId: string | null) {
  const ctx = await getEffectiveContext(userId, companyId);
  if (!ctx) return null;
  const row = await queryOne<{ id: string; requester_id: string; assignee_id: string; title: string }>(
    `SELECT id, requester_id, assignee_id, title FROM design_requests
      WHERE id = $1 AND ($2::text IS NULL OR company_id = $2)`,
    [id, ctx.role === 'super_admin' ? null : ctx.company_id]
  );
  if (!row) return null;
  const team = await query<{ user_id: string }>('SELECT user_id FROM design_request_assignees WHERE design_request_id = $1', [id]);
  return { ctx, req: row, teamIds: team.map(t => t.user_id) };
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkUnitAccess(request, 'design-requests', 'view')) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!(await loadRequestScoped(params.id, userId, request.headers.get('x-current-user-company'))))
      return NextResponse.json({ error: 'Không tìm thấy yêu cầu' }, { status: 404 });
    const rows = await query(
      `SELECT * FROM design_request_feedback WHERE design_request_id = $1 ORDER BY created_at ASC`,
      [params.id]
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET feedback error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

// POST — gửi feedback mới. Người nhận thông báo là "phía còn lại": nếu người
// gửi thuộc team thực hiện thì báo người gửi yêu cầu; nếu người gửi là
// người gửi yêu cầu thì báo cho CẢ TEAM thực hiện (không chỉ 1 người).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkUnitAccess(request, 'design-requests', 'edit')) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const scoped = await loadRequestScoped(params.id, userId, request.headers.get('x-current-user-company'));
    if (!scoped) return NextResponse.json({ error: 'Không tìm thấy yêu cầu' }, { status: 404 });
    const body = await request.json();
    const message = String(body.message || '').trim();
    if (!message) return NextResponse.json({ error: 'Nội dung feedback không được để trống' }, { status: 400 });
    const user = await queryOne<{ name: string }>('SELECT name FROM users WHERE id = $1', [userId]);
    const row = await queryOne(
      `INSERT INTO design_request_feedback (design_request_id, version_id, author_id, author_name, message)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [params.id, body.version_id || null, userId, user?.name || 'Người dùng', message]
    );
    const isAuthorInTeam = scoped.teamIds.includes(userId);
    const recipients = isAuthorInTeam
      ? [scoped.req.requester_id].filter(Boolean)
      : scoped.teamIds.filter(id => id !== userId);
    if (row && recipients.length) {
      await notify('design.request.feedback_new', { authorName: user?.name || 'Người dùng', title: scoped.req.title, message: message.slice(0, 160) },
        { recipients, relatedId: params.id }).catch(() => {});
    }
    return NextResponse.json({ success: true, data: row });
  } catch (err) {
    console.error('POST feedback error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
