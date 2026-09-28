import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import * as offboarding from '@/lib/services/offboardingService';

export const dynamic = 'force-dynamic';

/** GET /api/hr/offboarding/eligible-users?q= — tìm nhân sự active để tạo quy trình. */
export async function GET(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'hr-offboarding', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const q = request.nextUrl.searchParams.get('q') || '';
    if (q.trim().length < 2) return NextResponse.json({ success: true, data: [] });
    const data = await offboarding.searchEligibleUsers(q);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/hr/offboarding/eligible-users error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
