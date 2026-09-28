import { NextRequest, NextResponse } from 'next/server';
import * as mappingService from '@/lib/services/machineMappingService';
import * as attendanceService from '@/lib/services/attendanceService';
import * as machineService from '@/lib/services/machineService';
import { checkUnitAccess } from '@/lib/api-permissions';
import { getCompanyMemberUserIds } from '@/lib/services/userCompanyService';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'cham-cong-machines', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const role = request.headers.get('x-current-user-role') || '';
    const companyId = request.headers.get('x-current-user-company');
    if (role !== 'super_admin' && !companyId) {
      return NextResponse.json({ error: 'Tài khoản chưa được gán công ty' }, { status: 403 });
    }
    const scope = role === 'super_admin' ? null : companyId;
    const machineId = new URL(request.url).searchParams.get('machine_id') ?? undefined;
    const data = await mappingService.getAllMappings(machineId, scope);
    const machines = machineId ? [] : await mappingService.getDistinctMachines(scope);
    return NextResponse.json({ success: true, data, machines });
  } catch (err) {
    console.error('GET /api/attendance/machine-mappings error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * Tạo / sửa mapping (Projection Model).
 * Chỉ ghi 1 dòng mapping — dữ liệu punch tự động hiện dưới user qua JOIN sống ở read-path.
 * KHÔNG copy/move/sync record. machine_id luôn chuẩn hóa về canonical để JOIN khớp.
 */
export async function POST(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'cham-cong-machines', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const currentUserId = request.headers.get('x-current-user-id');
    const { machine_id, employee_code, user_id, mode, effective_from } = await request.json();
    if (!employee_code || !user_id) {
      return NextResponse.json({ error: 'Thiếu employee_code hoặc user_id' }, { status: 400 });
    }
    if (mode === 'handover' && !effective_from) {
      return NextResponse.json({ error: 'Bàn giao cần ngày hiệu lực (effective_from)' }, { status: 400 });
    }

    const role = request.headers.get('x-current-user-role') || '';
    const companyId = request.headers.get('x-current-user-company');
    const resolvedMachineId = machine_id || attendanceService.CANONICAL_MACHINE_ID;
    if (role !== 'super_admin') {
      if (!companyId) {
        return NextResponse.json({ error: 'Tài khoản chưa được gán công ty' }, { status: 403 });
      }
      const [machine, companyUserIds] = await Promise.all([
        machineService.getMachineById(resolvedMachineId, companyId),
        getCompanyMemberUserIds(companyId),
      ]);
      if (!machine || !companyUserIds.includes(user_id)) {
        return NextResponse.json({ error: 'Máy hoặc nhân viên không thuộc công ty hiện tại' }, { status: 403 });
      }
    }

    const { mapping, oldUserId } = await mappingService.upsertMapping({
      // machine_id thật của dòng mã (fallback canonical cho tương thích cũ)
      machine_id: resolvedMachineId,
      employee_code,
      user_id,
      mode,
      effective_from,
      created_by: currentUserId ?? undefined,
    });

    // Refresh cache stats cho user mới (và user cũ nếu trước đó map nhầm)
    const nowIso = new Date().toISOString();
    attendanceService.refreshSheetStatsAsync(user_id, nowIso).catch(console.error);
    if (oldUserId) attendanceService.refreshSheetStatsAsync(oldUserId, nowIso).catch(console.error);

    return NextResponse.json(
      { success: true, data: mapping, old_user_id: oldUserId },
      { status: 201 }
    );
  } catch (err) {
    console.error('POST /api/attendance/machine-mappings error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
