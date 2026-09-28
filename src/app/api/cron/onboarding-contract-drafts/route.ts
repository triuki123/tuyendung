import { NextRequest, NextResponse } from 'next/server';
import { runOnboardingContractDrafts } from '@/lib/services/onboardingContractDraftService';
import { requireBearerSecret } from '@/lib/requestSecurity';

/**
 * Tạo bản nháp thỏa thuận (Hợp tác + Bảo mật) cho nhân sự có hire_date = ngày mai.
 *   POST /api/cron/onboarding-contract-drafts
 *   Header: Authorization: Bearer {CRON_SECRET}
 * Scheduler in-process (src/lib/contracts/onboardingDraftScheduler.ts) đã tự chạy 9h VN;
 * route này để test thủ công hoặc lập lịch bằng cron ngoài.
 */
export async function POST(request: NextRequest) {
  try {
    const authGuard = requireBearerSecret(request, process.env.CRON_SECRET);
    if (authGuard) return authGuard;

    const result = await runOnboardingContractDrafts();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[CRON] onboarding-contract-drafts error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi server' },
      { status: 500 }
    );
  }
}

// GET — chỉ cho dev test.
export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
  }
  return NextResponse.json({
    message: 'POST /api/cron/onboarding-contract-drafts để tạo bản nháp thỏa thuận cho nhân sự vào làm ngày mai',
    note: 'Header: Authorization: Bearer {CRON_SECRET}',
  });
}
