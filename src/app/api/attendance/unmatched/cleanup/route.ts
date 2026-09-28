import { NextRequest, NextResponse } from 'next/server';
import { execute } from '@/lib/db';
import { checkUnitAccess } from '@/lib/api-permissions';
import { getMachineById } from '@/lib/services/machineService';

/**
 * DELETE /api/attendance/unmatched/cleanup
 * Xóa unmapped records với machine_id cụ thể
 *
 * Body:
 * {
 *   "machine_id": "zkteco_ronald_jack"
 * }
 */
export async function DELETE(request: NextRequest) {
  try {
    const role = request.headers.get('x-current-user-role');
    if (!checkUnitAccess(request, 'cham-cong-machines', 'delete')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }

    const body = await request.json();
    const { machine_id } = body;

    if (!machine_id) {
      return NextResponse.json({ error: 'Thiếu machine_id' }, { status: 400 });
    }
    const companyId = request.headers.get('x-current-user-company');
    if (role !== 'super_admin') {
      if (!companyId || !(await getMachineById(machine_id, companyId))) {
        return NextResponse.json({ error: 'Máy không thuộc công ty hiện tại' }, { status: 403 });
      }
    }

    // Projection Model: dữ liệu máy nằm ở device_punches. Xóa punch của máy này.
    const punchesDeleted = await execute(
      `DELETE FROM device_punches WHERE machine_id = $1`,
      [machine_id]
    );

    console.log(`[Cleanup] Deleted ${punchesDeleted} device_punches for machine_id: ${machine_id}`);

    return NextResponse.json({
      success: true,
      message: `Đã xóa ${punchesDeleted} punch của máy ${machine_id}`,
      deleted_punches: punchesDeleted,
    });
  } catch (error) {
    console.error('DELETE /api/attendance/unmatched/cleanup error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi server' },
      { status: 500 }
    );
  }
}
