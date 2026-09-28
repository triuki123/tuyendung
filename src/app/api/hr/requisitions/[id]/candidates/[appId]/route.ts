import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import * as pool from '@/lib/services/hrPoolService';
import {
  getApplication, changeApplicationStatus, listApplicationHistoryForCv,
  APPLICATION_STAGES, type ApplicationStage, type ActorRole,
} from '@/lib/services/applicationService';

export const dynamic = 'force-dynamic';

/** Ai xem được yêu cầu tuyển dụng thì xem/thao tác được ứng viên của nó. */
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
 * Xác định vai trò người thao tác so với yêu cầu:
 *  - recruiter: có quyền hr-cv (edit) HOẶC là owner phụ trách yêu cầu.
 *  - requester: còn lại (người yêu cầu / quản lý phòng ban).
 */
function resolveActorRole(request: NextRequest, ownerId: string | null): ActorRole {
  const uid = request.headers.get('x-current-user-id') || '';
  if (checkUnitAccess(request, 'hr-cv', 'edit')) return 'recruiter';
  if (ownerId && uid && ownerId === uid) return 'recruiter';
  return 'requester';
}

/** GET — chi tiết ứng viên (cho drawer người yêu cầu): thông tin + đánh giá + lịch sử theo vị trí. */
export async function GET(request: NextRequest, { params }: { params: { id: string; appId: string } }) {
  try {
    if (!canView(request)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

    const app = await getApplication(params.appId, params.id);
    if (!app) return NextResponse.json({ error: 'Không tìm thấy ứng viên trong yêu cầu này' }, { status: 404 });

    const [cv, notes, history] = await Promise.all([
      pool.getCvById(app.cv_id),
      pool.listNotes(app.cv_id),
      listApplicationHistoryForCv(app.cv_id),
    ]);
    if (!cv) return NextResponse.json({ error: 'Không tìm thấy hồ sơ' }, { status: 404 });

    return NextResponse.json({ success: true, data: { application: app, cv, notes, history } });
  } catch (err) {
    console.error('GET /api/hr/requisitions/:id/candidates/:appId error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** PUT — đổi trạng thái ứng viên CHO VỊ TRÍ NÀY (Chọn vòng tiếp / Loại / ...). */
import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const PUT = withRecruitmentUpdate(PUTHandler, 'Yêu cầu tuyển dụng', '/nguon-nhan-luc/yeu-cau-tuyen-dung');
async function PUTHandler(request: NextRequest, { params }: { params: { id: string; appId: string } }) {
  try {
    if (!canView(request)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

    const body = await request.json();
    const status = body.status as ApplicationStage;
    if (!APPLICATION_STAGES.includes(status)) {
      return NextResponse.json({ error: 'Trạng thái không hợp lệ' }, { status: 400 });
    }

    const app = await getApplication(params.appId, params.id);
    if (!app) return NextResponse.json({ error: 'Không tìm thấy ứng viên trong yêu cầu này' }, { status: 404 });

    const actorRole = resolveActorRole(request, app.requisition_owner_id);
    const changedBy = request.headers.get('x-current-user-id');

    try {
      await changeApplicationStatus(params.appId, status, {
        actorRole,
        changedBy,
        note: typeof body.note === 'string' ? body.note : null,
        rejectReason: typeof body.reject_reason === 'string' ? body.reject_reason : null,
        rejectReasonCode: typeof body.reject_reason_code === 'string' ? body.reject_reason_code : null,
      });
    } catch (e) {
      // Lỗi khóa độc quyền / trạng thái không hợp lệ → 409 với thông điệp rõ ràng.
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Không đổi được trạng thái' }, { status: 409 });
    }

    // Thông báo chéo (Phase 3) sẽ móc vào đây.
    const updated = await getApplication(params.appId, params.id);
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error('PUT /api/hr/requisitions/:id/candidates/:appId error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
