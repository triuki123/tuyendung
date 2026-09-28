import { NextRequest, NextResponse } from 'next/server';
import { decodeIdentityHeader } from '@/lib/authCookie';
import * as svc from '@/lib/services/attendanceService';

const HCNS_DEPT_ID = '74ab7673-13d6-404f-a576-5f4e87f8f7fa';

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    const deptId = decodeIdentityHeader(request.headers.get('x-current-user-dept')) ?? '';
    const role   = request.headers.get('x-current-user-role') ?? '';
    if (!userId) return NextResponse.json({ error: 'Chưa xác thực' }, { status: 401 });
    if (deptId !== HCNS_DEPT_ID && role !== 'super_admin')
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

    const { sheetIds, action } = await request.json();
    if (!Array.isArray(sheetIds) || sheetIds.length === 0)
      return NextResponse.json({ error: 'Thiếu sheetIds' }, { status: 400 });

    const updated = action === 'unlock'
      ? await svc.unlockSheets(sheetIds)
      : await svc.lockSheets(sheetIds, userId);

    return NextResponse.json({ success: true, updated });
  } catch (err) {
    console.error('POST /api/attendance/sheets/lock error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
