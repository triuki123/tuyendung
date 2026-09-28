import { NextRequest, NextResponse } from 'next/server';
import * as documentsService from '@/lib/services/documentsService';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const data = await documentsService.getDocumentById(params.id);
    if (!data) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/documents/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Sửa được: admin/super_admin HOẶC chính người đã tạo văn bản.
    const role = request.headers.get('x-current-user-role');
    const userId = request.headers.get('x-current-user-id');
    const isAdmin = role === 'super_admin' || role === 'admin';
    if (!isAdmin) {
      const current = await documentsService.getDocumentById(params.id);
      if (!current) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
      if (!userId || current.created_by !== userId) {
        return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
      }
    }
    const body = await request.json();
    const data = await documentsService.updateDocument(params.id, body);
    if (!data) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('PUT /api/documents/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const role = request.headers.get('x-current-user-role');
    if (role !== 'super_admin' && role !== 'admin') {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const ok = await documentsService.deleteDocument(params.id);
    if (!ok) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/documents/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
