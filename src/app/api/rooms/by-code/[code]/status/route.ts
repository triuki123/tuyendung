import { NextRequest, NextResponse } from 'next/server';
import { getRoomScanStatus } from '@/lib/services/roomCheckinService';

/**
 * GET /api/rooms/by-code/{code}/status — trạng thái phòng + hành động khả dụng khi quét QR.
 */
export async function GET(request: NextRequest, { params }: { params: { code: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id') || '';
    const status = await getRoomScanStatus(decodeURIComponent(params.code), userId);
    if (!status) {
      return NextResponse.json({ error: 'Không tìm thấy phòng với mã này' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: status });
  } catch (err) {
    console.error('GET /api/rooms/by-code/[code]/status error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
