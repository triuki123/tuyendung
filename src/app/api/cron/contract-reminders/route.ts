import { NextRequest, NextResponse } from 'next/server';
import { runContractReminders } from '@/lib/services/contractReminderService';
import { requireBearerSecret } from '@/lib/requestSecurity';

/**
 * Chạy nhắc gia hạn hợp đồng thủ công / external cron dự phòng.
 *   POST /api/cron/contract-reminders   body: { "slot": "am" | "pm" }
 *   Header: Authorization: Bearer {CRON_SECRET}
 * Scheduler in-process (src/lib/contracts/reminderScheduler.ts) đã tự chạy 9h/15h;
 * route này để test hoặc khi muốn lập lịch bằng cron ngoài.
 */
export async function POST(request: NextRequest) {
  try {
    const authGuard = requireBearerSecret(request, process.env.CRON_SECRET);
    if (authGuard) return authGuard;

    const body = await request.json().catch(() => ({}));
    const slot: 'am' | 'pm' = body.slot === 'pm' ? 'pm' : 'am';

    const result = await runContractReminders(slot);
    return NextResponse.json({ success: true, slot, ...result });
  } catch (error) {
    console.error('[CRON] contract-reminders error:', error);
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
    message: 'POST /api/cron/contract-reminders với body {slot:"am"|"pm"} để chạy nhắc gia hạn',
    note: 'Header: Authorization: Bearer {CRON_SECRET}',
  });
}
