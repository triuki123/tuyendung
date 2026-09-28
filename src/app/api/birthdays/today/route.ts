import { NextRequest, NextResponse } from 'next/server';
import { getTodayBirthdays } from '@/lib/services/birthdayService';

export const dynamic = 'force-dynamic';

/** GET /api/birthdays/today — nhân sự sinh nhật hôm nay (cho popup đăng nhập). */
export async function GET(_request: NextRequest) {
  try {
    const data = await getTodayBirthdays();
    const safe = data.map(({ telegram_chat_id, telegram_enabled, ...p }) => p);
    return NextResponse.json({ success: true, data: safe });
  } catch (err) {
    console.error('GET /api/birthdays/today error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
