import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/leaveTypeService';
import { checkUnitAccess } from '@/lib/api-permissions';

export const dynamic = 'force-dynamic';

async function canManageType(request: NextRequest, id: string): Promise<boolean> {
  const role = request.headers.get('x-current-user-role') || '';
  if (role === 'super_admin') return true;
  const companyId = request.headers.get('x-current-user-company');
  if (!companyId) return false;
  const leaveType = await svc.getLeaveTypeWithCompanies(id);
  return !!leaveType?.company_ids?.includes(companyId);
}

/** PUT — admin cập nhật loại phép. */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const existing = await svc.getLeaveTypeById(params.id);
    if (existing?.code === 'annual') {
      return NextResponse.json(
        { error: 'Phép năm được cấu hình tại Quy tắc chấm công' },
        { status: 400 },
      );
    }
    if (
      !checkUnitAccess(request, 'cham-cong-leave-config', 'edit') ||
      !(await canManageType(request, params.id))
    ) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const body = await request.json();
    const role = request.headers.get('x-current-user-role') || '';
    const companyId = request.headers.get('x-current-user-company');
    const data = await svc.updateLeaveType(params.id, {
      ...body,
      company_ids: role === 'super_admin' ? body.company_ids : [companyId!],
    });
    if (!data) return NextResponse.json({ error: 'Không tìm thấy loại phép' }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('PUT /api/leave/types/:id error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE — admin xóa loại phép (loại hệ thống / đã dùng → chỉ tắt). */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const existing = await svc.getLeaveTypeById(params.id);
    if (existing?.code === 'annual') {
      return NextResponse.json(
        { error: 'Không thể xóa loại phép năm hệ thống' },
        { status: 400 },
      );
    }
    if (
      !checkUnitAccess(request, 'cham-cong-leave-config', 'delete') ||
      !(await canManageType(request, params.id))
    ) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const result = await svc.deleteLeaveType(params.id);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('DELETE /api/leave/types/:id error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
