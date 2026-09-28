import { NextRequest, NextResponse } from 'next/server';
import * as contractService from '@/lib/services/contractService';
import { canManageContracts } from '@/lib/services/contractPermissionService';
import { archiveContractToHrDocs } from '@/lib/services/contractArchiveService';
import { logHrRecord } from '@/lib/services/hrAuditService';

export const dynamic = 'force-dynamic';

/** POST /api/contracts/[id]/renew — gia hạn (tạo HĐ mới kế thừa, HĐ cũ -> renewed). */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const activeCompany = request.headers.get('x-current-user-company');
    if (!(await canManageContracts(userId, 'create', activeCompany))) {
      return NextResponse.json({ error: 'Không có quyền gia hạn hợp đồng' }, { status: 403 });
    }

    const body = await request.json();
    if (!body.contract_number?.trim()) {
      return NextResponse.json({ error: 'Thiếu số hợp đồng mới' }, { status: 400 });
    }

    const created = await contractService.renewContract(params.id, {
      contract_number: body.contract_number,
      contract_type_id: body.contract_type_id ?? undefined,
      employment_type_id: body.employment_type_id ?? undefined,
      sign_date: body.sign_date || null,
      start_date: body.start_date || null,
      end_date: body.end_date || null,
      salary_info: body.salary_info ?? undefined,
      notes: body.notes || null,
      created_by: userId,
    });

    // Lịch sử: ghi ở CẢ HAI bản ghi — HĐ cũ (bị gia hạn) và HĐ mới (được tạo từ gia hạn).
    await logHrRecord({
      entityType: 'contract', entityId: params.id, action: 'renew',
      details: `Gia hạn — tạo hợp đồng mới ${created.contract_number}`,
      performedBy: userId,
    });
    await logHrRecord({
      entityType: 'contract', entityId: created.id, action: 'create',
      details: `Tạo hợp đồng ${created.contract_number} từ gia hạn`,
      performedBy: userId,
    });

    // HĐ cũ vừa chuyển 'renewed' → lưu trữ vào kho Hồ Sơ nhân viên (await để chắc chắn hoàn thành)
    let archivedDocs = 0;
    try {
      archivedDocs = await archiveContractToHrDocs(params.id, userId);
    } catch (e) {
      console.error('[Contract renew] archive error:', e);
    }

    return NextResponse.json({ success: true, data: created, archivedDocs }, { status: 201 });
  } catch (err: any) {
    if (err?.code === '23505') {
      return NextResponse.json({ error: 'Số hợp đồng đã tồn tại' }, { status: 409 });
    }
    if (err?.message?.includes('Không tìm thấy')) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    console.error('POST /api/contracts/[id]/renew error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
