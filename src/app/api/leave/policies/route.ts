import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/leaveAccrualService';
import { checkUnitAccess } from '@/lib/api-permissions';

export const dynamic = 'force-dynamic';

/** GET — danh sách chính sách cộng phép năm (admin). */
export async function GET(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'cham-cong-leave-config', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const role = request.headers.get('x-current-user-role') || '';
    const companyId = request.headers.get('x-current-user-company');
    const data = await svc.getPolicies(role === 'super_admin' ? null : companyId);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/leave/policies error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST — admin tạo chính sách mới. */
export async function POST(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'cham-cong-leave-config', 'create')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const body = await request.json();
    if (!body.name || !body.employment_type_id || body.base_days_per_year == null) {
      return NextResponse.json({ error: 'Thiếu tên, hình thức lao động hoặc số ngày phép/năm' }, { status: 400 });
    }
    const role = request.headers.get('x-current-user-role') || '';
    const companyId = request.headers.get('x-current-user-company');
    if (role !== 'super_admin' && !companyId) {
      return NextResponse.json({ error: 'Tài khoản chưa được gán công ty' }, { status: 403 });
    }
    const data = await svc.createPolicy({
      name: body.name,
      employment_type_id: body.employment_type_id,
      base_days_per_year: Number(body.base_days_per_year),
      accrual_frequency: body.accrual_frequency,
      seniority_bonus_days: body.seniority_bonus_days != null ? Number(body.seniority_bonus_days) : undefined,
      seniority_every_years: body.seniority_every_years != null ? Number(body.seniority_every_years) : undefined,
      carryover_max_days: body.carryover_max_days != null ? Number(body.carryover_max_days) : undefined,
      carryover_expiry_mmdd: body.carryover_expiry_mmdd || undefined,
      accrual_day: body.accrual_day != null ? Number(body.accrual_day) : undefined,
      valid_from: body.valid_from ?? null,
      valid_until: body.valid_until ?? null,
      company_ids: role === 'super_admin' ? (body.company_ids ?? []) : [companyId!],
    });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error('POST /api/leave/policies error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
