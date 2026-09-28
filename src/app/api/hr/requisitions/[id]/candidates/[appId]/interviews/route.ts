import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { getApplication } from '@/lib/services/applicationService';
import { listInterviews, createInterview } from '@/lib/services/interviewService';

export const dynamic = 'force-dynamic';

function canView(request: NextRequest): boolean {
  const role = request.headers.get('x-current-user-role') || '';
  return (
    role === 'manager' || role === 'admin' || role === 'super_admin' ||
    checkUnitAccess(request, 'recruitment-order', 'view') ||
    checkUnitAccess(request, 'hr-requisitions', 'view') ||
    checkUnitAccess(request, 'hr-cv', 'view')
  );
}

/** GET — danh sách lịch phỏng vấn của ứng viên trong yêu cầu này. */
export async function GET(request: NextRequest, { params }: { params: { id: string; appId: string } }) {
  try {
    if (!canView(request)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const app = await getApplication(params.appId, params.id);
    if (!app) return NextResponse.json({ error: 'Không tìm thấy ứng viên trong yêu cầu này' }, { status: 404 });
    return NextResponse.json({ success: true, data: await listInterviews(params.appId) });
  } catch (err) {
    console.error('GET interviews error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST — đặt lịch phỏng vấn mới. */
import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const POST = withRecruitmentUpdate(POSTHandler, 'Yêu cầu tuyển dụng', '/nguon-nhan-luc/yeu-cau-tuyen-dung');
async function POSTHandler(request: NextRequest, { params }: { params: { id: string; appId: string } }) {
  try {
    if (!canView(request)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const app = await getApplication(params.appId, params.id);
    if (!app) return NextResponse.json({ error: 'Không tìm thấy ứng viên trong yêu cầu này' }, { status: 404 });

    const body = await request.json();
    // scheduled_at = giờ ĐỊA PHƯƠNG 'YYYY-MM-DDTHH:MM' (từ input datetime-local).
    const local = typeof body.scheduled_at === 'string' ? body.scheduled_at : '';
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(local)) {
      return NextResponse.json({ error: 'Thiếu thời gian phỏng vấn hợp lệ' }, { status: 400 });
    }
    const mode = ['onsite', 'online', 'phone'].includes(body.mode) ? body.mode : 'onsite';

    let created;
    try {
      created = await createInterview(params.appId, {
        cvId: app.cv_id,
        requisitionId: app.requisition_id,
        roundLabel: typeof body.round_label === 'string' && body.round_label.trim() ? body.round_label.trim() : 'Vòng 1',
        scheduledLocal: local.slice(0, 16),
        durationMin: body.duration_min ? Number(body.duration_min) : 60,
        mode,
        location: typeof body.location === 'string' ? body.location : null,
        roomName: typeof body.room_name === 'string' ? body.room_name : null,
        allowRoomConflict: body.allow_room_conflict === true,
        meetingLink: typeof body.meeting_link === 'string' ? body.meeting_link : null,
        interviewerIds: Array.isArray(body.interviewer_ids) ? body.interviewer_ids.filter((x: any) => typeof x === 'string') : [],
        note: typeof body.note === 'string' ? body.note : null,
        createdBy: request.headers.get('x-current-user-id'),
      });
    } catch (e) {
      // Trùng phòng → 409 để UI báo rõ.
      const code = e instanceof Error && 'code' in e ? e.code : undefined;
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Không đặt được lịch', code: code === 'ROOM_CONFLICT' ? code : undefined }, { status: 409 });
    }
    return NextResponse.json({ success: true, data: created });
  } catch (err) {
    console.error('POST interviews error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
