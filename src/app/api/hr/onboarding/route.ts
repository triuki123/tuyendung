import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import * as onboarding from '@/lib/services/onboardingService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/hr/onboarding — danh sách bài nộp Onboarding (+ đếm theo trạng thái)
 * Chỉ tính submission thuộc biểu mẫu onboarding. Query: ?status=
 */
export async function GET(request: NextRequest) {
  try {
    if (
      !checkUnitAccess(request, 'hr-onboarding', 'view') &&
      !checkUnitAccess(request, 'users', 'approve')
    ) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const status = request.nextUrl.searchParams.get('status') || undefined;
    const [data, counts] = await Promise.all([
      onboarding.listSubmissions({ status, onboardingOnly: true }),
      onboarding.countByStatus(),
    ]);
    return NextResponse.json({ success: true, data, counts });
  } catch (err) {
    console.error('GET /api/hr/onboarding error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
