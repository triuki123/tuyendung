import { NextRequest, NextResponse } from 'next/server';
import { ZKTecoClient } from '@/lib/zkteco/zkClient';

/**
 * GET /api/attendance/zkteco-raw
 * Debug: Show raw data from ZKTeco machine
 */
export async function GET(request: NextRequest) {
  try {
    const role = request.headers.get('x-current-user-role');
    if (role !== 'super_admin') {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }

    const zkClient = new ZKTecoClient('115.79.205.119', 1111);

    try {
      await zkClient.connect();

      // Get raw response từ máy
      const records = await zkClient.getAttendanceRecords();

      console.log('Raw ZKTeco data:', JSON.stringify(records.slice(0, 5), null, 2));

      return NextResponse.json({
        success: true,
        message: 'Raw data from ZKTeco machine (first 5 records)',
        total_records: records.length,
        first_5_records: records.slice(0, 5),
        sample_keys: records.length > 0 ? Object.keys(records[0]) : [],
      });
    } finally {
      await zkClient.disconnect();
    }
  } catch (error) {
    console.error('Error fetching raw data:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi server' },
      { status: 500 }
    );
  }
}
