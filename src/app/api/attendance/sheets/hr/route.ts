import { NextRequest, NextResponse } from 'next/server';
import { decodeIdentityHeader } from '@/lib/authCookie';
import * as svc from '@/lib/services/attendanceService';

const HCNS_DEPT_ID = '74ab7673-13d6-404f-a576-5f4e87f8f7fa';

export async function GET(request: NextRequest) {
  try {
    const userId   = request.headers.get('x-current-user-id');
    const deptId   = decodeIdentityHeader(request.headers.get('x-current-user-dept'));
    const role     = request.headers.get('x-current-user-role') ?? '';
    if (!userId) return NextResponse.json({ error: 'Chưa xác thực' }, { status: 401 });

    const isHCNS      = deptId === HCNS_DEPT_ID;
    const isSuperAdmin = role === 'super_admin';
    if (!isHCNS && !isSuperAdmin) {
      return NextResponse.json({ error: 'Chỉ Phòng Hành Chính Nhân Sự mới có quyền truy cập' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    // Dùng timezone VN để lấy tháng/năm mặc định đúng
    const nowVN = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    const [defYear, defMonth] = nowVN.split('-').map(Number);
    const month = parseInt(searchParams.get('month') ?? String(defMonth));
    const year  = parseInt(searchParams.get('year')  ?? String(defYear));

    const data = await svc.getHRSheets(month, year);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/attendance/sheets/hr error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
