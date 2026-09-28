import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import * as pool from '@/lib/services/hrPoolService';
import { listApplicationHistoryForCv } from '@/lib/services/applicationService';

export const dynamic = 'force-dynamic';

/** GET /api/hr/cv/:id/detail — CV + applications + notes + lịch sử pipeline + lịch sử theo vị trí */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkUnitAccess(request, 'hr-cv', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const cv = await pool.getCvById(params.id, request.headers.get('x-current-user-id'));
    if (!cv) return NextResponse.json({ error: 'Không tìm thấy CV' }, { status: 404 });
    const [applications, notes, history, positionHistory] = await Promise.all([
      pool.listApplications(params.id),
      pool.listNotes(params.id),
      pool.listStageHistory(params.id),
      listApplicationHistoryForCv(params.id),
    ]);
    return NextResponse.json({ success: true, data: { cv, applications, notes, history, positionHistory } });
  } catch (err) {
    console.error('GET /api/hr/cv/:id/detail error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
