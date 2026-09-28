import { NextRequest, NextResponse } from 'next/server';
import { getDeviceCodeDirectory } from '@/lib/services/machineMappingService';
import { checkUnitAccess } from '@/lib/api-permissions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/attendance/device-codes
 * Danh bạ mã chấm công: mọi employee_code từng có punch + thống kê + trạng thái gán.
 * Dùng cho trang Cấu Hình để admin gán mã "correct-by-construction".
 */
export async function GET(request: NextRequest) {
  try {
    const role = request.headers.get('x-current-user-role');
    if (!checkUnitAccess(request, 'cham-cong-machines', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const companyId = request.headers.get('x-current-user-company');
    if (role !== 'super_admin' && !companyId) {
      return NextResponse.json({ error: 'Tài khoản chưa được gán công ty' }, { status: 403 });
    }
    const data = await getDeviceCodeDirectory(role === 'super_admin' ? null : companyId);
    const mapped   = data.filter(d => d.user_id).length;
    const unmapped = data.length - mapped;
    const totalPunches = data.reduce((s, d) => s + d.punch_count, 0);
    return NextResponse.json({
      success: true,
      data,
      summary: { total: data.length, mapped, unmapped, totalPunches },
    });
  } catch (err) {
    console.error('GET /api/attendance/device-codes error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
