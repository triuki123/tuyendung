import { NextRequest, NextResponse } from 'next/server';
import { requireLegal } from '@/lib/legal/legalGuard';
import { listSealLogs, createSealLog, deleteSealLog } from '@/lib/services/legalService';
import { logLegalRecord } from '@/lib/services/legalAuditService';

export const dynamic = 'force-dynamic';

/** GET: sổ theo dõi sử dụng con dấu (?companyId=) */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireLegal(request, 'view');
    if ('response' in guard) return guard.response;
    const rows = await listSealLogs({
      companyId: request.nextUrl.searchParams.get('companyId') || undefined,
    });
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/legal/seal-logs error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST: ghi 1 lượt dùng con dấu. Body { companyId, usedAt, documentDesc, usedBy, note? } */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireLegal(request, 'create');
    if ('response' in guard) return guard.response;
    const body = await request.json();
    if (!body.companyId) return NextResponse.json({ error: 'Chọn công ty' }, { status: 400 });
    if (!body.usedAt) return NextResponse.json({ error: 'Chọn ngày sử dụng' }, { status: 400 });
    if (!body.documentDesc?.trim()) return NextResponse.json({ error: 'Nhập văn bản được đóng dấu' }, { status: 400 });
    if (!body.usedBy?.trim()) return NextResponse.json({ error: 'Nhập người thực hiện' }, { status: 400 });

    const { id } = await createSealLog({ ...body, createdBy: guard.actor.id });
    await logLegalRecord({
      entityType: 'seal_log', entityId: id, action: 'create',
      details: `Ghi sổ con dấu: ${body.documentDesc.trim()}`, performedBy: guard.actor.id,
    });
    return NextResponse.json({ success: true, data: { id } });
  } catch (err) {
    console.error('POST /api/legal/seal-logs error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE: xóa 1 dòng sổ (ghi nhầm). (?id=) */
export async function DELETE(request: NextRequest) {
  try {
    const guard = await requireLegal(request, 'delete');
    if ('response' in guard) return guard.response;
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 });
    const ok = await deleteSealLog(id);
    if (!ok) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    await logLegalRecord({
      entityType: 'seal_log', entityId: id, action: 'delete',
      details: 'Xóa 1 dòng sổ con dấu', performedBy: guard.actor.id,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/legal/seal-logs error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
