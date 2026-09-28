import { NextRequest, NextResponse } from 'next/server';
import * as mappingService from '@/lib/services/machineMappingService';
import * as attendanceService from '@/lib/services/attendanceService';
import * as machineService from '@/lib/services/machineService';
import { checkUnitAccess } from '@/lib/api-permissions';
import { getCompanyMemberUserIds } from '@/lib/services/userCompanyService';

/**
 * Admin "resolve" 1 nhóm punch chưa khớp = TẠO MAPPING cho (machine_id, employee_code) → user.
 * Trong Projection Model, ngay khi mapping được tạo, toàn bộ punch của mã đó tự động
 * hiển thị dưới user (JOIN sống) — không cần ghi attendance riêng.
 *
 * params.id = composite "machine_id|employee_code" (do GET /unmatched sinh ra).
 */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const role = request.headers.get('x-current-user-role');
    if (!checkUnitAccess(request, 'cham-cong-machines', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const adminId = request.headers.get('x-current-user-id') ?? undefined;
    const { user_id } = await request.json();
    if (!user_id) return NextResponse.json({ error: 'Thiếu user_id' }, { status: 400 });

    // Tách composite id
    const sep = params.id.lastIndexOf('|');
    if (sep < 0) return NextResponse.json({ error: 'ID không hợp lệ' }, { status: 400 });
    const machine_id    = params.id.slice(0, sep);
    const employee_code = params.id.slice(sep + 1);
    const companyId = request.headers.get('x-current-user-company');
    if (role !== 'super_admin') {
      if (!companyId) {
        return NextResponse.json({ error: 'Tài khoản chưa được gán công ty' }, { status: 403 });
      }
      const [machine, companyUserIds] = await Promise.all([
        machineService.getMachineById(machine_id, companyId),
        getCompanyMemberUserIds(companyId),
      ]);
      if (!machine || !companyUserIds.includes(user_id)) {
        return NextResponse.json({ error: 'Máy hoặc nhân viên không thuộc công ty hiện tại' }, { status: 403 });
      }
    }

    const { oldUserId } = await mappingService.upsertMapping({
      machine_id,
      employee_code,
      user_id,
      created_by: adminId,
    });

    // Refresh stats cho user mới (và user cũ nếu trước đó map nhầm)
    const nowIso = new Date().toISOString();
    attendanceService.refreshSheetStatsAsync(user_id, nowIso).catch(console.error);
    if (oldUserId) attendanceService.refreshSheetStatsAsync(oldUserId, nowIso).catch(console.error);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT attendance/unmatched/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
