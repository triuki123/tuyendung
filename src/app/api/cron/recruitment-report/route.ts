import { NextRequest, NextResponse } from 'next/server';
import { runWeeklyRecruitmentReport, buildWeeklyReportText } from '@/lib/services/recruitmentReportService';
import { requireBearerSecret } from '@/lib/requestSecurity';

/**
 * Gửi báo cáo tuyển dụng tuần qua Telegram (thủ công / cron ngoài).
 *   POST /api/cron/recruitment-report          — gửi thật
 *   POST /api/cron/recruitment-report {preview:true} — chỉ trả nội dung, không gửi
 *   Header: Authorization: Bearer {CRON_SECRET}
 * Scheduler in-process đã tự chạy Thứ Hai 8h VN.
 */
export async function POST(request: NextRequest) {
  try {
    const authGuard = requireBearerSecret(request, process.env.CRON_SECRET);
    if (authGuard) return authGuard;
    const body = await request.json().catch(() => ({}));
    if (body.preview) {
      return NextResponse.json({ success: true, preview: await buildWeeklyReportText() });
    }
    const result = await runWeeklyRecruitmentReport();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[CRON] recruitment-report error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Lỗi server' }, { status: 500 });
  }
}

export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
  }
  return NextResponse.json({ message: 'POST /api/cron/recruitment-report (body {preview:true} để xem trước)', note: 'Header: Authorization: Bearer {CRON_SECRET}' });
}
