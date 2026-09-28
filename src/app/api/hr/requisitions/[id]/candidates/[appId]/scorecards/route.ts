import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { getApplication } from '@/lib/services/applicationService';
import { listScorecards, addScorecard, type ScorecardCriterion } from '@/lib/services/scorecardService';

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

/** GET — danh sách scorecard phỏng vấn của ứng viên trong yêu cầu này. */
export async function GET(request: NextRequest, { params }: { params: { id: string; appId: string } }) {
  try {
    if (!canView(request)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const app = await getApplication(params.appId, params.id);
    if (!app) return NextResponse.json({ error: 'Không tìm thấy ứng viên trong yêu cầu này' }, { status: 404 });
    return NextResponse.json({ success: true, data: await listScorecards(params.appId) });
  } catch (err) {
    console.error('GET scorecards error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST — thêm 1 scorecard phỏng vấn. */
import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const POST = withRecruitmentUpdate(POSTHandler, 'Yêu cầu tuyển dụng', '/nguon-nhan-luc/yeu-cau-tuyen-dung');
async function POSTHandler(request: NextRequest, { params }: { params: { id: string; appId: string } }) {
  try {
    if (!canView(request)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const app = await getApplication(params.appId, params.id);
    if (!app) return NextResponse.json({ error: 'Không tìm thấy ứng viên trong yêu cầu này' }, { status: 404 });

    const body = await request.json();
    const criteria: ScorecardCriterion[] = Array.isArray(body.criteria)
      ? body.criteria
          .filter((c: any) => c && typeof c.name === 'string')
          .map((c: any) => ({ name: c.name, rating: c.rating == null ? null : Number(c.rating), comment: c.comment ?? null }))
      : [];

    const overall = body.overall == null ? null : Number(body.overall);
    const hasContent = criteria.length > 0 || overall != null || body.recommendation || (typeof body.summary === 'string' && body.summary.trim());
    if (!hasContent) {
      return NextResponse.json({ error: 'Nhập điểm/khuyến nghị hoặc tiêu chí' }, { status: 400 });
    }

    const created = await addScorecard(params.appId, {
      cvId: app.cv_id,
      requisitionId: app.requisition_id,
      roundLabel: typeof body.round_label === 'string' && body.round_label.trim() ? body.round_label.trim() : 'Vòng 1',
      interviewerId: request.headers.get('x-current-user-id'),
      recommendation: typeof body.recommendation === 'string' ? body.recommendation : null,
      overall,
      criteria,
      summary: typeof body.summary === 'string' ? body.summary : null,
    });
    return NextResponse.json({ success: true, data: created });
  } catch (err) {
    console.error('POST scorecards error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
