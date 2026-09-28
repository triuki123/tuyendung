import { NextRequest, NextResponse } from 'next/server';
import { globalSearch } from '@/lib/services/globalSearchService';

/**
 * GET /api/search?q=... — tìm kiếm toàn cục (tài sản · ticket · người dùng · công việc · văn bản).
 * Lọc theo quyền dựa trên header x-current-user-id / x-current-user-role.
 */
export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q')?.trim() || '';
    if (q.length < 2) {
      return NextResponse.json({ success: true, data: [] });
    }

    const userId = request.headers.get('x-current-user-id') || '';
    const role = request.headers.get('x-current-user-role') || 'user';

    const data = await globalSearch(q, { userId, role });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/search error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
