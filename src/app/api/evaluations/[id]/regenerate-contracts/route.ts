import { NextRequest, NextResponse } from 'next/server';
import { regenerateEvaluationContracts } from '@/lib/services/evaluationService';
import { canManageEvaluations } from '@/lib/services/evaluationPermissionService';

/**
 * POST /api/evaluations/[id]/regenerate-contracts
 * Sinh lại nháp hợp đồng chính thức cho thẻ đánh giá đã ĐẠT khi nháp tự động
 * bị xoá nhầm (chạy lại đúng luồng chuyển tiếp như lúc kết luận).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const activeCompany = request.headers.get('x-current-user-company');
    const canCreate = await canManageEvaluations(userId, 'create', activeCompany);
    if (!canCreate) return NextResponse.json({ error: 'Không có quyền tạo hợp đồng' }, { status: 403 });

    const { contractId } = await regenerateEvaluationContracts(params.id, userId);
    return NextResponse.json({ success: true, data: { contractId } });
  } catch (err) {
    console.error('POST /api/evaluations/[id]/regenerate-contracts error:', err);
    const msg = err instanceof Error ? err.message : 'Lỗi server';
    const known = ['Không tìm thấy', 'Chỉ sinh lại', 'vẫn còn'].some((s) => msg.includes(s));
    return NextResponse.json({ error: known ? msg : 'Lỗi server' }, { status: known ? 400 : 500 });
  }
}
