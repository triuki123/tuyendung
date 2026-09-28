import { NextRequest, NextResponse } from 'next/server';
import { getTodayStatus } from '@/lib/services/attendanceService';

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa xác thực' }, { status: 401 });
    const data = await getTodayStatus(userId);
    // Không trả về photo (BYTEA) trong listing — dùng endpoint riêng
    const safeRecords = data.records.map(({ ...r }) => r);
    return NextResponse.json({ success: true, data: { ...data, records: safeRecords } });
  } catch (err) {
    console.error('GET /api/attendance/today error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
