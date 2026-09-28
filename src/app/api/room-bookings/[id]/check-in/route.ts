import { NextRequest, NextResponse } from 'next/server';
import { checkInBooking } from '@/lib/services/roomCheckinService';

/**
 * POST /api/room-bookings/{id}/check-in — xác nhận đã nhận phòng (qua quét QR vật lý).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id') || '';
    let name = '';
    try { name = (await request.json())?.userName || ''; } catch { /* body trống */ }
    if (!userId) return NextResponse.json({ error: 'Thiếu thông tin người dùng' }, { status: 401 });

    const res = await checkInBooking(params.id, userId, name);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/room-bookings/[id]/check-in error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
