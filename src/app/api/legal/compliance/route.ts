import { NextRequest, NextResponse } from 'next/server';
import { requireLegal } from '@/lib/legal/legalGuard';
import {
  listComplianceItems, getComplianceItem, createComplianceItem,
  updateComplianceItem, deleteComplianceItem,
} from '@/lib/services/legalService';
import { logLegalRecord } from '@/lib/services/legalAuditService';

export const dynamic = 'force-dynamic';

/** GET: mốc tuân thủ + các kỳ đã hoàn thành (?all=1 gồm mốc đã tắt) */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireLegal(request, 'view');
    if ('response' in guard) return guard.response;
    const rows = await listComplianceItems(request.nextUrl.searchParams.get('all') === '1');
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/legal/compliance error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST: thêm mốc tuân thủ. Body { name, frequency, companyId?, agency?, dueMonth?, dueDay?, linkUrl?, note? } */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireLegal(request, 'create');
    if ('response' in guard) return guard.response;
    const body = await request.json();
    if (!body.name?.trim()) return NextResponse.json({ error: 'Nhập tên nghĩa vụ' }, { status: 400 });
    if (!['yearly', 'quarterly', 'monthly', 'once'].includes(body.frequency)) {
      return NextResponse.json({ error: 'Chu kỳ không hợp lệ' }, { status: 400 });
    }
    const { id } = await createComplianceItem({
      ...body,
      dueMonth: body.dueMonth ? Number(body.dueMonth) : null,
      dueDay: body.dueDay ? Number(body.dueDay) : null,
      createdBy: guard.actor.id,
    });
    await logLegalRecord({
      entityType: 'compliance_item', entityId: id, action: 'create',
      details: `Thêm nghĩa vụ "${body.name.trim()}"`, performedBy: guard.actor.id,
    });
    return NextResponse.json({ success: true, data: { id } });
  } catch (err) {
    console.error('POST /api/legal/compliance error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** PUT: sửa mốc tuân thủ. Body { id, ... } */
export async function PUT(request: NextRequest) {
  try {
    const guard = await requireLegal(request, 'edit');
    if ('response' in guard) return guard.response;
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 });
    await updateComplianceItem(body.id, body);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT /api/legal/compliance error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE: xóa mốc + toàn bộ log kỳ (CASCADE). (?id=) */
export async function DELETE(request: NextRequest) {
  try {
    const guard = await requireLegal(request, 'delete');
    if ('response' in guard) return guard.response;
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 });
    const item = await getComplianceItem(id);
    if (!item) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    await deleteComplianceItem(id);
    await logLegalRecord({
      entityType: 'compliance_item', entityId: id, action: 'delete',
      details: `Xóa nghĩa vụ "${item.name}"`, performedBy: guard.actor.id,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/legal/compliance error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
