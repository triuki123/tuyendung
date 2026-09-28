import { NextRequest, NextResponse } from 'next/server';
import { requireLegal, requireLegalUnlocked } from '@/lib/legal/legalGuard';
import {
  listDocuments, getDocument, createDocument, updateDocument, deleteDocument,
} from '@/lib/services/legalService';
import { logLegalRecord, buildLegalChanges } from '@/lib/services/legalAuditService';

export const dynamic = 'force-dynamic';

/** GET: sổ văn bản pháp lý (?companyId=&status=) — mọi công ty (mô hình tập trung) */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireLegal(request, 'view');
    if ('response' in guard) return guard.response;
    const sp = request.nextUrl.searchParams;
    const rows = await listDocuments({
      companyId: sp.get('companyId') || undefined,
      status: sp.get('status') || undefined,
    });
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/legal/documents error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST: thêm văn bản. Body { companyId, title, typeId?, docNumber?, ... } */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireLegal(request, 'create');
    if ('response' in guard) return guard.response;
    const body = await request.json();
    if (!body.companyId) return NextResponse.json({ error: 'Chọn công ty' }, { status: 400 });
    if (!body.title?.trim()) return NextResponse.json({ error: 'Nhập tiêu đề văn bản' }, { status: 400 });

    const { id } = await createDocument({ ...body, createdBy: guard.actor.id });
    await logLegalRecord({
      entityType: 'document', entityId: id, action: 'create',
      details: `Thêm văn bản "${body.title.trim()}"`, performedBy: guard.actor.id,
    });
    return NextResponse.json({ success: true, data: { id } });
  } catch (err) {
    console.error('POST /api/legal/documents error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** PUT: sửa văn bản. Body { id, ...cột sửa }. Ghi diff vào lịch sử. */
export async function PUT(request: NextRequest) {
  try {
    const guard = await requireLegal(request, 'edit');
    if ('response' in guard) return guard.response;
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 });

    const before = await getDocument(body.id);
    if (!before) return NextResponse.json({ error: 'Không tìm thấy văn bản' }, { status: 404 });

    const denied = await requireLegalUnlocked(request, guard.actor.id, 'document', body.id);
    if (denied) return denied;

    await updateDocument(body.id, body);

    const { changes, details } = buildLegalChanges('document', before as any, body);
    if (Object.keys(changes).length) {
      await logLegalRecord({
        entityType: 'document', entityId: body.id,
        action: 'status' in changes ? 'status_change' : 'update',
        details, changes, performedBy: guard.actor.id,
      });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT /api/legal/documents error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE: xóa văn bản + file đính kèm (CASCADE). (?id=) */
export async function DELETE(request: NextRequest) {
  try {
    const guard = await requireLegal(request, 'delete');
    if ('response' in guard) return guard.response;
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 });

    const doc = await getDocument(id);
    if (!doc) return NextResponse.json({ error: 'Không tìm thấy văn bản' }, { status: 404 });

    const denied = await requireLegalUnlocked(request, guard.actor.id, 'document', id);
    if (denied) return denied;

    await deleteDocument(id);
    await logLegalRecord({
      entityType: 'document', entityId: id, action: 'delete',
      details: `Xóa văn bản "${doc.title}"`, performedBy: guard.actor.id,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/legal/documents error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
