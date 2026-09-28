import { NextRequest, NextResponse } from 'next/server';
import { runRequisitionReminders } from '@/lib/services/requisitionReminderService';
import { requireBearerSecret } from '@/lib/requestSecurity';

/**
 * Nhắc Yêu Cầu Tuyển Dụng sắp hết hạn (5 ngày & 1 ngày trước) — thủ công / cron ngoài.
 *   POST /api/cron/requisition-reminders
 *   Header: Authorization: Bearer {CRON_SECRET}
 * Scheduler in-process đã tự chạy 9h VN.
 */
export async function POST(request: NextRequest) {
  try {
    const authGuard = requireBearerSecret(request, process.env.CRON_SECRET);
    if (authGuard) return authGuard;
    const result = await runRequisitionReminders();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[CRON] requisition-reminders error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Lỗi server' }, { status: 500 });
  }
}

export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
  }
  return NextResponse.json({ message: 'POST /api/cron/requisition-reminders để nhắc yêu cầu tuyển dụng sắp hết hạn', note: 'Header: Authorization: Bearer {CRON_SECRET}' });
}
