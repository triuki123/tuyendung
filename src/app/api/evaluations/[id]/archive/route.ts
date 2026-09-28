import { NextRequest, NextResponse } from 'next/server';
import { setEvaluationArchived, getEvaluationById } from '@/lib/services/evaluationService';
import { canManageEvaluations } from '@/lib/services/evaluationPermissionService';
import { logHrRecord } from '@/lib/services/hrAuditService';

/**
 * POST /api/evaluations/[id]/archive — Lưu trữ / bỏ lưu trữ thẻ đánh giá (thủ công).
 * body: { archived: boolean }. Cần quyền quản lý đánh giá (approve).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const activeCompany = request.headers.get('x-current-user-company');

    const canApprove = await canManageEvaluations(userId, 'approve', activeCompany);
    if (!canApprove) return NextResponse.json({ error: 'Không có quyền lưu trữ đánh giá' }, { status: 403 });

    const before = await getEvaluationById(params.id);
    if (!before) return NextResponse.json({ error: 'Không tìm thấy thẻ đánh giá' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const archived = body.archived !== false; // mặc định = lưu trữ

    const res = await setEvaluationArchived(params.id, archived, userId);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });

    await logHrRecord({
      entityType: 'evaluation', entityId: params.id, action: 'update',
      details: archived ? 'Lưu trữ thẻ đánh giá' : 'Bỏ lưu trữ thẻ đánh giá',
      performedBy: userId,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/evaluations/[id]/archive error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
