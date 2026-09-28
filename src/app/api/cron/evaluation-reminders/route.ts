import { NextRequest, NextResponse } from 'next/server';
import { runEvaluationTasks } from '@/lib/services/evaluationReminderService';
import { requireBearerSecret } from '@/lib/requestSecurity';

export async function POST(request: NextRequest) {
  try {
    const authGuard = requireBearerSecret(request, process.env.CRON_SECRET);
    if (authGuard) return authGuard;

    const body = await request.json().catch(() => ({}));
    const slot: 'am' | 'pm' = body.slot === 'pm' ? 'pm' : 'am';

    const result = await runEvaluationTasks(slot);
    return NextResponse.json({ success: true, slot, ...result });
  } catch (err) {
    console.error('POST /api/cron/evaluation-reminders error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
