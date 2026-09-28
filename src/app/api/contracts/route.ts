import { NextRequest, NextResponse } from 'next/server';
import * as contractService from '@/lib/services/contractService';
import {
  canManageContracts,
  getContractVisibility,
} from '@/lib/services/contractPermissionService';
import { checkBmhsGate } from '@/lib/services/bmhsService';
import { logHrRecord } from '@/lib/services/hrAuditService';

export const dynamic = 'force-dynamic';

/** GET /api/contracts — danh sách hợp đồng (lọc theo quyền xem). */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const activeCompany = request.headers.get('x-current-user-company');
    const sp = request.nextUrl.searchParams;

    // Cổng BMHS: khi xem hồ sơ của MỘT nhân viên cụ thể (employee_id) và hồ sơ đã khóa.
    const empParam = sp.get('employee_id');
    if (empParam) {
      const gate = await checkBmhsGate(userId, empParam, request.headers.get('x-bmhs-token'));
      if (!gate.allowed) {
        return NextResponse.json({ error: 'Hồ sơ được bảo mật — cần nhập mật khẩu', requireBmhs: true, employeeId: empParam }, { status: 403 });
      }
    }

    const vis = await getContractVisibility(userId, activeCompany);

    const expiryParam = sp.get('expiry');
    const data = await contractService.listContracts({
      employee_id: sp.get('employee_id') || undefined,
      contract_type_id: sp.get('contract_type_id') || undefined,
      status: sp.get('status')
        ? (sp.get('status')!.includes(',')
            ? (sp.get('status')!.split(',') as contractService.ContractStatus[])
            : (sp.get('status') as contractService.ContractStatus))
        : undefined,
      expiringWithinDays: expiryParam && /^\d+$/.test(expiryParam) ? parseInt(expiryParam, 10) : undefined,
      overdue: expiryParam === 'overdue' ? true : undefined,
      indefinite: expiryParam === 'indefinite' ? true : undefined,
      department_id: sp.get('department_id') || undefined,
      // KHÔNG lọc theo company_id ở đây: phạm vi công ty đã được siết qua
      // allowedEmployeeIds (getContractVisibility). Lọc thêm company_id (suy từ
      // công ty của PHÒNG BAN nhân viên) khiến super_admin đang ở công ty khác
      // KHÔNG thấy hợp đồng/nháp của công ty còn lại → bỏ để thấy đúng phạm vi.
      allowedEmployeeIds: vis.all ? null : vis.allowedEmployeeIds,
      excludeDraft: !vis.all,
    });

    return NextResponse.json({ success: true, data });
  } catch (err) {
    // A local database may be initialized without the optional Contracts module.
    // Keep the HR overview usable; write operations still return their real error.
    if (process.env.LOCAL_DEV_BYPASS_AUTH === 'true') {
      console.warn('GET /api/contracts skipped: Contracts schema is not initialized in local development.');
      return NextResponse.json({ success: true, data: [] });
    }
    console.error('GET /api/contracts error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST /api/contracts — tạo hợp đồng (cần quyền hr.create). */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const activeCompany = request.headers.get('x-current-user-company');
    if (!(await canManageContracts(userId, 'create', activeCompany))) {
      return NextResponse.json({ error: 'Không có quyền tạo hợp đồng' }, { status: 403 });
    }

    const body = await request.json();
    if (!body.employee_id || !body.contract_number?.trim()) {
      return NextResponse.json(
        { error: 'Thiếu nhân viên hoặc số hợp đồng' },
        { status: 400 }
      );
    }

    const contract = await contractService.createContract({
      employee_id: body.employee_id,
      contract_type_id: body.contract_type_id || null,
      employment_type_id: body.employment_type_id || null,
      contract_number: body.contract_number,
      sign_date: body.sign_date || null,
      start_date: body.start_date || null,
      end_date: body.end_date || null,
      salary_info: body.salary_info || null,
      notes: body.notes || null,
      status: body.status || 'active',
      created_by: userId,
    });

    await logHrRecord({
      entityType: 'contract', entityId: contract.id, action: 'create',
      details: `Tạo hợp đồng ${contract.contract_number}`,
      performedBy: userId,
    });

    return NextResponse.json({ success: true, data: contract }, { status: 201 });
  } catch (err: any) {
    if (err?.code === '23505') {
      return NextResponse.json({ error: 'Số hợp đồng đã tồn tại' }, { status: 409 });
    }
    console.error('POST /api/contracts error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
