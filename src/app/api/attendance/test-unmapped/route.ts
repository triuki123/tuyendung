import { NextRequest, NextResponse } from 'next/server';
import { execute } from '@/lib/db';
import { checkUnitAccess } from '@/lib/api-permissions';
import { getMachineById } from '@/lib/services/machineService';

/**
 * POST /api/attendance/test-unmapped
 * Tạo test unmapped record để test mapping
 */
export async function POST(request: NextRequest) {
  try {
    const role = request.headers.get('x-current-user-role');
    if (!checkUnitAccess(request, 'cham-cong-machines', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }

    const body = await request.json();
    const { machine_id, employee_code, recorded_at } = body;

    if (!machine_id || !employee_code) {
      return NextResponse.json({ error: 'Thiếu machine_id hoặc employee_code' }, { status: 400 });
    }
    const companyId = request.headers.get('x-current-user-company');
    if (
      role !== 'super_admin' &&
      (!companyId || !(await getMachineById(machine_id, companyId)))
    ) {
      return NextResponse.json({ error: 'Máy không thuộc công ty hiện tại' }, { status: 403 });
    }

    // Projection Model: tạo punch test trong device_punches
    const result = await execute(
      `INSERT INTO device_punches (machine_id, employee_code, punch_time)
       VALUES ($1, $2, $3)
       ON CONFLICT (machine_id, employee_code, punch_time) DO NOTHING`,
      [machine_id, employee_code, recorded_at || new Date().toISOString()]
    );

    return NextResponse.json({
      success: true,
      message: `Tạo test device_punch thành công`,
      affected_rows: result,
    });
  } catch (error) {
    console.error('POST /api/attendance/test-unmapped error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi server' },
      { status: 500 }
    );
  }
}
