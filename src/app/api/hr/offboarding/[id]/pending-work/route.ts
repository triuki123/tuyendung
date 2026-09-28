import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import * as offboarding from '@/lib/services/offboardingService';

export const dynamic = 'force-dynamic';

/** GET /api/hr/offboarding/[id]/pending-work — đếm việc còn tồn của nhân sự (cảnh báo). */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkUnitAccess(request, 'hr-offboarding', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const proc = await offboarding.getProcess(params.id);
    if (!proc) return NextResponse.json({ error: 'Quy trình không tồn tại' }, { status: 404 });
    const data = await offboarding.getPendingWork(proc.user_id);
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error('GET /api/hr/offboarding pending-work error:', err);
    return NextResponse.json({ error: err?.message || 'Lỗi server' }, { status: 500 });
  }
}
