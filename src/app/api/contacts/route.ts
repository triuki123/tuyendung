import { NextRequest, NextResponse } from 'next/server';
import * as contactsService from '@/lib/services/contactsService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') ?? undefined;
    const data = await contactsService.getAllContacts(search);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/contacts error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const role = request.headers.get('x-current-user-role');
    if (role !== 'super_admin' && role !== 'admin') {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const userId = request.headers.get('x-current-user-id') ?? undefined;
    const body = await request.json();

    if (!body.responsibility?.trim()) {
      return NextResponse.json({ error: 'Thiếu công việc phụ trách' }, { status: 400 });
    }

    const data = await contactsService.createContact({
      user_id: body.user_id ?? null,
      responsibility: body.responsibility.trim(),
      note: body.note ?? null,
      sort_order: body.sort_order ?? 0,
      created_by: userId,
    });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error('POST /api/contacts error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
