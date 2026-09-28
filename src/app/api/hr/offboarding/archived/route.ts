import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { listArchivedProcesses } from '@/lib/services/offboardingService';

export const dynamic = 'force-dynamic';

/** GET /api/hr/offboarding/archived — danh sách quy trình đã lưu trữ. */
export async function GET(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'hr-offboarding', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const data = await listArchivedProcesses();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/hr/offboarding/archived error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
