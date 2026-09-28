import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import * as pool from '@/lib/services/hrPoolService';
import { getApplication } from '@/lib/services/applicationService';

export const dynamic = 'force-dynamic';

/** Ai xem được yêu cầu tuyển dụng thì ghi/đọc đánh giá ứng viên của nó. */
function canView(request: NextRequest): boolean {
  const role = request.headers.get('x-current-user-role') || '';
  return (
    role === 'manager' || role === 'admin' || role === 'super_admin' ||
    checkUnitAccess(request, 'recruitment-order', 'view') ||
    checkUnitAccess(request, 'hr-requisitions', 'view') ||
    checkUnitAccess(request, 'hr-cv', 'view')
  );
}

/**
 * POST /api/hr/requisitions/:id/candidates/:appId/notes
 * Người yêu cầu (không cần quyền hr-cv) ghi đánh giá/ghi chú cho ứng viên trong yêu cầu này.
 * Ghi chú lưu ở cấp CV (hr_cv_notes) nên Tuyển Dụng cũng thấy được.
 */
import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const POST = withRecruitmentUpdate(POSTHandler, 'Yêu cầu tuyển dụng', '/nguon-nhan-luc/yeu-cau-tuyen-dung');
async function POSTHandler(request: NextRequest, { params }: { params: { id: string; appId: string } }) {
  try {
    if (!canView(request)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

    const app = await getApplication(params.appId, params.id);
    if (!app) return NextResponse.json({ error: 'Không tìm thấy ứng viên trong yêu cầu này' }, { status: 404 });

    const body = await request.json();
    const text = typeof body.body === 'string' ? body.body.trim() : '';
    const rating = typeof body.rating === 'number' ? body.rating : null;
    if (!text && rating == null) {
      return NextResponse.json({ error: 'Nhập nội dung hoặc chọn sao đánh giá' }, { status: 400 });
    }

    const authorId = request.headers.get('x-current-user-id');
    const note = await pool.addNote(app.cv_id, {
      kind: typeof body.kind === 'string' ? body.kind : 'evaluation',
      rating,
      body: text || null,
      authorId,
    });

    // Báo cho người PHỤ TRÁCH tuyển dụng + người YÊU CẦU (trừ chính người vừa ghi).
    void notifyCandidateNote(params.id, app.cv_id, authorId, text, rating).catch((e) =>
      console.error('notify candidate note error:', e)
    );

    return NextResponse.json({ success: true, data: note });
  } catch (err) {
    console.error('POST /api/hr/requisitions/:id/candidates/:appId/notes error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * Thông báo khi có đánh giá/ghi chú mới cho ứng viên.
 * Người nhận: người phụ trách tuyển dụng (owner_id) + người yêu cầu (requested_by) + người tạo
 * yêu cầu (created_by) — bỏ trùng và bỏ chính người vừa ghi.
 */
async function notifyCandidateNote(
  requisitionId: string,
  cvId: string,
  authorId: string | null,
  text: string,
  rating: number | null
): Promise<void> {
  const { getRequisitionById } = await import('@/lib/services/requisitionService');
  const { getCvById } = await import('@/lib/services/hrPoolService');
  const { queryOne } = await import('@/lib/db');
  const { notify } = await import('@/lib/notifications/engine');

  const req = await getRequisitionById(requisitionId);
  if (!req) return;

  const recipients = Array.from(
    new Set([req.owner_id, req.requested_by, req.created_by].filter((x): x is string => !!x))
  ).filter((uid) => uid !== authorId);
  if (!recipients.length) return;

  const cv = await getCvById(cvId).catch(() => null);
  const author = authorId
    ? await queryOne<{ name: string }>(`SELECT name FROM users WHERE id::text = $1`, [authorId]).catch(() => null)
    : null;

  const stars = rating != null ? ` (${rating}★)` : '';
  const excerpt = (text || '').slice(0, 200) + ((text || '').length > 200 ? '…' : '');

  await notify(
    'requisition.candidateNote',
    {
      candidate: cv?.candidate_name || 'Ứng viên',
      reqTitle: req.title,
      author: (author?.name || 'Một thành viên') + stars,
      excerpt: excerpt || '(chỉ chấm sao, không có nội dung)',
    },
    { recipients, relatedId: requisitionId }
  );
}
