import { NextRequest, NextResponse } from 'next/server';
import { getMonthBirthdays } from '@/lib/services/birthdayService';

export const dynamic = 'force-dynamic';

/** GET /api/birthdays/month?month=6 — nhân sự sinh nhật trong tháng (mặc định tháng hiện tại). */
export async function GET(request: NextRequest) {
  try {
    const mp = request.nextUrl.searchParams.get('month');
    const month = mp ? Math.min(12, Math.max(1, parseInt(mp, 10))) : undefined;
    const data = await getMonthBirthdays(month);
    // Không trả telegram fields ra client
    const safe = data.map(({ telegram_chat_id, telegram_enabled, ...p }) => p);
    return NextResponse.json({ success: true, data: safe });
  } catch (err) {
    console.error('GET /api/birthdays/month error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
