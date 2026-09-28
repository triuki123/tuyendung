import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { moveCvsToIndustry } from '@/lib/services/hrPoolService';

export const dynamic = 'force-dynamic';

import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const POST = withRecruitmentUpdate(POSTHandler, 'Kho ứng viên', '/nguon-nhan-luc/kho-ung-vien');
async function POSTHandler(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'hr-cv', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const body = await request.json();
    const ids = Array.isArray(body.ids) ? body.ids.filter((id: unknown) => typeof id === 'string') : [];
    const industry = typeof body.industry === 'string' ? body.industry.trim() : '';
    if (!ids.length) return NextResponse.json({ error: 'Chưa chọn CV' }, { status: 400 });
    if (!industry) return NextResponse.json({ error: 'Chưa chọn thư mục đích' }, { status: 400 });
    const count = await moveCvsToIndustry(ids, industry);
    return NextResponse.json({ success: true, count });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Lỗi server' }, { status: 400 });
  }
}
