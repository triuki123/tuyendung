import { NextRequest, NextResponse } from 'next/server';
import { searchUsersForContact } from '@/lib/services/contactsService';

/**
 * GET /api/contacts/search-users?q=keyword
 * Tìm kiếm users để hiển thị trong dropdown "Người Đại Diện".
 */
export async function GET(request: NextRequest) {
  try {
    const q = new URL(request.url).searchParams.get('q') ?? '';
    const data = await searchUsersForContact(q);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/contacts/search-users error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
