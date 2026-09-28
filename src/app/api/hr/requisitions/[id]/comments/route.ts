import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';

export const dynamic = 'force-dynamic';

function genId() { return `rqc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`; }

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const rows = await query(
      `SELECT id, requisition_id, user_id, user_name, content, created_at
         FROM requisition_comments WHERE requisition_id = $1 ORDER BY created_at ASC`,
      [params.id]
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/hr/requisitions/:id/comments error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const POST = withRecruitmentUpdate(POSTHandler, 'Yêu cầu tuyển dụng', '/nguon-nhan-luc/yeu-cau-tuyen-dung');
async function POSTHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id') || '';
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const { content } = await request.json();
    if (!String(content || '').trim()) return NextResponse.json({ error: 'Nội dung không được để trống' }, { status: 400 });
    const userRow = await queryOne<{ name: string }>(`SELECT name FROM users WHERE id::text = $1`, [userId]);
    const row = await queryOne(
      `INSERT INTO requisition_comments (id, requisition_id, user_id, user_name, content, created_at)
       VALUES ($1,$2,$3,$4,$5,NOW()) RETURNING *`,
      [genId(), params.id, userId, userRow?.name || null, String(content).trim()]
    );
    return NextResponse.json({ success: true, data: row });
  } catch (err) {
    console.error('POST /api/hr/requisitions/:id/comments error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
