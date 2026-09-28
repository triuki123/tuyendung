import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/leaveAccrualService';
import { checkUnitAccess } from '@/lib/api-permissions';

export const dynamic = 'force-dynamic';

async function canManagePolicy(request: NextRequest, id: string): Promise<boolean> {
  const role = request.headers.get('x-current-user-role') || '';
  if (role === 'super_admin') return true;
  const companyId = request.headers.get('x-current-user-company');
  if (!companyId) return false;
  const policy = await svc.getPolicyById(id);
  return !!policy?.companies?.some(company => company.id === companyId);
}

/** PUT — admin cập nhật chính sách cộng phép năm. */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (
      !checkUnitAccess(request, 'cham-cong-leave-config', 'edit') ||
      !(await canManagePolicy(request, params.id))
    ) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const body = await request.json();
    const role = request.headers.get('x-current-user-role') || '';
    const companyId = request.headers.get('x-current-user-company');
    const data = await svc.updatePolicy(params.id, {
      name: body.name,
      base_days_per_year: body.base_days_per_year != null ? Number(body.base_days_per_year) : undefined,
      accrual_frequency: body.accrual_frequency,
      seniority_bonus_days: body.seniority_bonus_days != null ? Number(body.seniority_bonus_days) : undefined,
      seniority_every_years: body.seniority_every_years != null ? Number(body.seniority_every_years) : undefined,
      carryover_max_days: body.carryover_max_days != null ? Number(body.carryover_max_days) : undefined,
      carryover_expiry_mmdd: body.carryover_expiry_mmdd || undefined,
      accrual_day: body.accrual_day != null ? Number(body.accrual_day) : undefined,
      valid_from: body.valid_from ?? null,
      valid_until: body.valid_until ?? null,
      active: body.active,
      company_ids: role === 'super_admin' ? body.company_ids : [companyId!],
    });
    if (!data) return NextResponse.json({ error: 'Không tìm thấy chính sách' }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('PUT /api/leave/policies/:id error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE — admin xóa chính sách (cascade xóa gán công ty). */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (
      !checkUnitAccess(request, 'cham-cong-leave-config', 'delete') ||
      !(await canManagePolicy(request, params.id))
    ) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const ok = await svc.deletePolicy(params.id);
    if (!ok) return NextResponse.json({ error: 'Không tìm thấy chính sách' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/leave/policies/:id error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
