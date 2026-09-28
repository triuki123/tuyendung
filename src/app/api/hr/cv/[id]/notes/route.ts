import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import * as pool from '@/lib/services/hrPoolService';

export const dynamic = 'force-dynamic';

/** POST /api/hr/cv/:id/notes — thêm ghi chú / đánh giá phỏng vấn */
import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const POST = withRecruitmentUpdate(POSTHandler, 'Kho ứng viên', '/nguon-nhan-luc/kho-ung-vien');
async function POSTHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkUnitAccess(request, 'hr-cv', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const body = await request.json();
    const rating = typeof body.rating === 'number' ? body.rating : null;
    if (!body.body?.trim() && rating === null) {
      return NextResponse.json({ error: 'Cần nhập nội dung hoặc đánh giá' }, { status: 400 });
    }
    const data = await pool.addNote(params.id, {
      kind: typeof body.kind === 'string' ? body.kind : 'note',
      rating,
      body: typeof body.body === 'string' ? body.body : null,
      authorId: request.headers.get('x-current-user-id'),
    });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('POST /api/hr/cv/:id/notes error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE /api/hr/cv/:id/notes?note_id= — xóa ghi chú */
export const DELETE = withRecruitmentUpdate(DELETEHandler, 'Kho ứng viên', '/nguon-nhan-luc/kho-ung-vien');
async function DELETEHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkUnitAccess(request, 'hr-cv', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const noteId = request.nextUrl.searchParams.get('note_id');
    if (!noteId) return NextResponse.json({ error: 'Thiếu note_id' }, { status: 400 });
    const ok = await pool.deleteNote(params.id, noteId);
    if (!ok) return NextResponse.json({ error: 'Không tìm thấy ghi chú' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/hr/cv/:id/notes error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
