import { NextRequest, NextResponse } from 'next/server';
import { getUserActivityHistory } from '@/lib/services/activityHistoryService';

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Chưa xác thực' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') ?? undefined;
    const limit = parseInt(searchParams.get('limit') ?? '100', 10);

    const data = await getUserActivityHistory(userId, { type, limit });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/activity-history error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
