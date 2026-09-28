import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/attendanceAdjustmentService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : undefined;
    const data = year ? await svc.getHolidaysByYear(year) : await svc.getAllHolidays();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/attendance/holidays error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const role   = request.headers.get('x-current-user-role');
    const userId = request.headers.get('x-current-user-id') ?? undefined;
    if (role !== 'super_admin' && role !== 'admin') {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const body = await request.json();
    if (!body.date || !body.name) {
      return NextResponse.json({ error: 'Thiếu date hoặc name' }, { status: 400 });
    }
    const data = await svc.createHoliday({ ...body, created_by: userId });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error('POST /api/attendance/holidays error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
