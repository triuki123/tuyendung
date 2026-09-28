import { NextRequest, NextResponse } from 'next/server';
import { requireLegal } from '@/lib/legal/legalGuard';
import {
  listAuthorizations, getAuthorization, createAuthorization,
  updateAuthorization, deleteAuthorization,
} from '@/lib/services/legalService';
import { logLegalRecord, buildLegalChanges } from '@/lib/services/legalAuditService';

export const dynamic = 'force-dynamic';

/** GET: giấy ủy quyền (?companyId=) */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireLegal(request, 'view');
    if ('response' in guard) return guard.response;
    const rows = await listAuthorizations({
      companyId: request.nextUrl.searchParams.get('companyId') || undefined,
    });
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/legal/authorizations error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST: thêm ủy quyền */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireLegal(request, 'create');
    if ('response' in guard) return guard.response;
    const body = await request.json();
    if (!body.companyId) return NextResponse.json({ error: 'Chọn công ty' }, { status: 400 });
    if (!body.grantor?.trim() || !body.grantee?.trim()) {
      return NextResponse.json({ error: 'Nhập người ủy quyền và người được ủy quyền' }, { status: 400 });
    }
    const { id } = await createAuthorization({ ...body, createdBy: guard.actor.id });
    await logLegalRecord({
      entityType: 'authorization', entityId: id, action: 'create',
      details: `Thêm ủy quyền ${body.grantor.trim()} → ${body.grantee.trim()}`,
      performedBy: guard.actor.id,
    });
    return NextResponse.json({ success: true, data: { id } });
  } catch (err) {
    console.error('POST /api/legal/authorizations error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** PUT: sửa ủy quyền (kèm diff). Body { id, ... } */
export async function PUT(request: NextRequest) {
  try {
    const guard = await requireLegal(request, 'edit');
    if ('response' in guard) return guard.response;
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 });

    const before = await getAuthorization(body.id);
    if (!before) return NextResponse.json({ error: 'Không tìm thấy ủy quyền' }, { status: 404 });

    await updateAuthorization(body.id, body);

    const { changes, details } = buildLegalChanges('authorization', before as any, body);
    if (Object.keys(changes).length) {
      await logLegalRecord({
        entityType: 'authorization', entityId: body.id,
        action: 'status' in changes ? 'status_change' : 'update',
        details, changes, performedBy: guard.actor.id,
      });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT /api/legal/authorizations error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE: xóa ủy quyền (?id=) */
export async function DELETE(request: NextRequest) {
  try {
    const guard = await requireLegal(request, 'delete');
    if ('response' in guard) return guard.response;
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 });
    const auth = await getAuthorization(id);
    if (!auth) return NextResponse.json({ error: 'Không tìm thấy ủy quyền' }, { status: 404 });
    await deleteAuthorization(id);
    await logLegalRecord({
      entityType: 'authorization', entityId: id, action: 'delete',
      details: `Xóa ủy quyền ${auth.grantor} → ${auth.grantee}`, performedBy: guard.actor.id,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/legal/authorizations error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
