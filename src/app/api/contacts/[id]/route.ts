import { NextRequest, NextResponse } from 'next/server';
import * as contactsService from '@/lib/services/contactsService';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const data = await contactsService.getContactById(params.id);
    if (!data) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/contacts/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const role = request.headers.get('x-current-user-role');
    if (role !== 'super_admin' && role !== 'admin') {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const body = await request.json();
    const data = await contactsService.updateContact(params.id, body);
    if (!data) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('PUT /api/contacts/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const role = request.headers.get('x-current-user-role');
    if (role !== 'super_admin' && role !== 'admin') {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const ok = await contactsService.deleteContact(params.id);
    if (!ok) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/contacts/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
