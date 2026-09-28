import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { query, queryOne } from '@/lib/db';
import { canFdv } from '@/lib/fdvAccess';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  if (!canFdv(request)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
  try {
    const data = await query('SELECT * FROM fdv_tasks WHERE user_id = $1 ORDER BY done, due_at LIMIT 200', [request.headers.get('x-current-user-id')]);
    return NextResponse.json({ success: true, data });
  } catch { return NextResponse.json({ error: 'Không tải được công việc FDV. Kiểm tra migration 303.' }, { status: 500 }); }
}
export async function POST(request: NextRequest) {
  if (!canFdv(request)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
  try {
    const body = await request.json();
    const due = new Date(body.dueAt);
    const minutes = Number(body.remindMinutes);
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 300 || !Number.isFinite(due.getTime()) || due.getTime() <= Date.now() || ![0, 15, 30, 60, 1440].includes(minutes)) {
      return NextResponse.json({ error: 'Nhập tên công việc, hạn trong tương lai và thời gian nhắc hợp lệ.' }, { status: 400 });
    }
    const remind = new Date(Math.max(Date.now(), due.getTime() - minutes * 60000));
    const data = await queryOne('INSERT INTO fdv_tasks (id, user_id, title, due_at, remind_at) VALUES ($1,$2,$3,$4,$5) RETURNING *', [randomUUID(), request.headers.get('x-current-user-id'), body.title.trim(), due.toISOString(), remind.toISOString()]);
    return NextResponse.json({ success: true, data });
  } catch { return NextResponse.json({ error: 'Không tạo được công việc.' }, { status: 500 }); }
}
export async function PATCH(request: NextRequest) {
  if (!canFdv(request)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
  try {
    const body = await request.json();
    if (typeof body.id !== 'string' || typeof body.done !== 'boolean') return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 });
    const data = await queryOne('UPDATE fdv_tasks SET done = $1 WHERE id = $2 AND user_id = $3 RETURNING *', [body.done, body.id, request.headers.get('x-current-user-id')]);
    return NextResponse.json(data ? { success: true, data } : { error: 'Không tìm thấy công việc' }, { status: data ? 200 : 404 });
  } catch { return NextResponse.json({ error: 'Không cập nhật được công việc.' }, { status: 500 }); }
}
export async function DELETE(request: NextRequest) {
  if (!canFdv(request)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
  try {
    const body = await request.json();
    const data = await queryOne('DELETE FROM fdv_tasks WHERE id = $1 AND user_id = $2 AND interview_id IS NULL RETURNING id', [body.id, request.headers.get('x-current-user-id')]);
    return NextResponse.json(data ? { success: true } : { error: 'Không tìm thấy công việc' }, { status: data ? 200 : 404 });
  } catch { return NextResponse.json({ error: 'Không xoá được công việc.' }, { status: 500 }); }
}
