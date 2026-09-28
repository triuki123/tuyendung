import { NextRequest, NextResponse } from 'next/server';
import { requireLegal, requireLegalUnlocked } from '@/lib/legal/legalGuard';
import {
  listContracts, getContract, createContract, updateContract, deleteContract,
} from '@/lib/services/legalService';
import { logLegalRecord, buildLegalChanges } from '@/lib/services/legalAuditService';

export const dynamic = 'force-dynamic';

/** GET: hợp đồng thương mại (?companyId=&status=) */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireLegal(request, 'view');
    if ('response' in guard) return guard.response;
    const sp = request.nextUrl.searchParams;
    const rows = await listContracts({
      companyId: sp.get('companyId') || undefined,
      status: sp.get('status') || undefined,
    });
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/legal/contracts error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST: thêm hợp đồng. value = SỐ NGUYÊN ĐỒNG (từ MoneyInput). */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireLegal(request, 'create');
    if ('response' in guard) return guard.response;
    const body = await request.json();
    if (!body.companyId) return NextResponse.json({ error: 'Chọn công ty ký' }, { status: 400 });
    if (!body.partnerName?.trim()) return NextResponse.json({ error: 'Nhập tên đối tác' }, { status: 400 });
    if (!body.title?.trim()) return NextResponse.json({ error: 'Nhập tiêu đề hợp đồng' }, { status: 400 });
    if (body.value != null && body.value !== '' && !Number.isFinite(Number(body.value))) {
      return NextResponse.json({ error: 'Giá trị hợp đồng không hợp lệ' }, { status: 400 });
    }

    const { id } = await createContract({
      ...body,
      value: body.value == null || body.value === '' ? null : Math.round(Number(body.value)),
      createdBy: guard.actor.id,
    });
    await logLegalRecord({
      entityType: 'contract', entityId: id, action: 'create',
      details: `Thêm hợp đồng "${body.title.trim()}" — đối tác ${body.partnerName.trim()}`,
      performedBy: guard.actor.id,
    });
    return NextResponse.json({ success: true, data: { id } });
  } catch (err) {
    console.error('POST /api/legal/contracts error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** PUT: sửa hợp đồng (kèm diff lịch sử). Body { id, ... } */
export async function PUT(request: NextRequest) {
  try {
    const guard = await requireLegal(request, 'edit');
    if ('response' in guard) return guard.response;
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 });

    const before = await getContract(body.id);
    if (!before) return NextResponse.json({ error: 'Không tìm thấy hợp đồng' }, { status: 404 });

    const denied = await requireLegalUnlocked(request, guard.actor.id, 'contract', body.id);
    if (denied) return denied;

    if ('value' in body && body.value != null && body.value !== '') {
      if (!Number.isFinite(Number(body.value))) {
        return NextResponse.json({ error: 'Giá trị hợp đồng không hợp lệ' }, { status: 400 });
      }
      body.value = Math.round(Number(body.value));
    }

    await updateContract(body.id, body);

    const { changes, details } = buildLegalChanges('contract', before as any, body);
    if (Object.keys(changes).length) {
      await logLegalRecord({
        entityType: 'contract', entityId: body.id,
        action: 'status' in changes ? 'status_change' : 'update',
        details, changes, performedBy: guard.actor.id,
      });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT /api/legal/contracts error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE: xóa hợp đồng + file (CASCADE). (?id=) */
export async function DELETE(request: NextRequest) {
  try {
    const guard = await requireLegal(request, 'delete');
    if ('response' in guard) return guard.response;
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 });
    const contract = await getContract(id);
    if (!contract) return NextResponse.json({ error: 'Không tìm thấy hợp đồng' }, { status: 404 });
    const denied = await requireLegalUnlocked(request, guard.actor.id, 'contract', id);
    if (denied) return denied;
    await deleteContract(id);
    await logLegalRecord({
      entityType: 'contract', entityId: id, action: 'delete',
      details: `Xóa hợp đồng "${contract.title}"`, performedBy: guard.actor.id,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/legal/contracts error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
