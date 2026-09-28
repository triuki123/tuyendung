import { NextRequest, NextResponse } from 'next/server';
import { requireLegal } from '@/lib/legal/legalGuard';
import {
  listDocumentTypes, createDocumentType, updateDocumentType, deleteDocumentType,
} from '@/lib/services/legalService';

export const dynamic = 'force-dynamic';

/** GET: danh mục loại văn bản (?all=1 gồm cả loại đã ẩn) */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireLegal(request, 'view');
    if ('response' in guard) return guard.response;
    const rows = await listDocumentTypes(request.nextUrl.searchParams.get('all') === '1');
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/legal/document-types error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST: thêm loại văn bản (danh mục cấu hình được — luật đổi thì thêm/sửa ở đây) */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireLegal(request, 'edit');
    if ('response' in guard) return guard.response;
    const body = await request.json();
    if (!body.name?.trim()) return NextResponse.json({ error: 'Nhập tên loại văn bản' }, { status: 400 });
    if (!['dang_ky_dn', 'giay_phep_con', 'noi_bo'].includes(body.groupKey)) {
      return NextResponse.json({ error: 'Nhóm không hợp lệ' }, { status: 400 });
    }
    const row = await createDocumentType({
      name: body.name, groupKey: body.groupKey,
      defaultValidityMonths: body.defaultValidityMonths == null || body.defaultValidityMonths === ''
        ? null : Number(body.defaultValidityMonths),
    });
    return NextResponse.json({ success: true, data: row });
  } catch (err) {
    console.error('POST /api/legal/document-types error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** PUT: sửa/ẩn loại văn bản. Body { id, name?, group_key?, default_validity_months?, active? } */
export async function PUT(request: NextRequest) {
  try {
    const guard = await requireLegal(request, 'edit');
    if ('response' in guard) return guard.response;
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 });
    await updateDocumentType(body.id, body);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT /api/legal/document-types error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE: xóa loại văn bản (?id=) — chặn khi đang có văn bản dùng (dùng "Ẩn" thay thế). */
export async function DELETE(request: NextRequest) {
  try {
    const guard = await requireLegal(request, 'delete');
    if ('response' in guard) return guard.response;
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 });
    const result = await deleteDocumentType(id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/legal/document-types error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
