import { NextRequest, NextResponse } from 'next/server';
import { decodeIdentityHeader } from '@/lib/authCookie';
import * as svc from '@/lib/services/attendanceService';

const HCNS_DEPT_ID = '74ab7673-13d6-404f-a576-5f4e87f8f7fa';

export async function PATCH(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    const deptId = decodeIdentityHeader(request.headers.get('x-current-user-dept')) ?? '';
    const role   = request.headers.get('x-current-user-role') ?? '';
    if (!userId) return NextResponse.json({ error: 'Chưa xác thực' }, { status: 401 });
    if (deptId !== HCNS_DEPT_ID && role !== 'super_admin')
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

    const { sheetId, note } = await request.json();
    if (!sheetId) return NextResponse.json({ error: 'Thiếu sheetId' }, { status: 400 });

    await svc.updateHRNote(sheetId, note ?? '');
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PATCH /api/attendance/sheets/hr-note error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
