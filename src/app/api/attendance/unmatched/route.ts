import { NextRequest, NextResponse } from 'next/server';
import { getUnmatchedFromPunches } from '@/lib/services/machineMappingService';
import { checkUnitAccess } from '@/lib/api-permissions';

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
    // Suy ra từ device_punches chưa có mapping (Projection Model)
    const data = await getUnmatchedFromPunches(role === 'super_admin' ? null : companyId);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/attendance/unmatched error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
