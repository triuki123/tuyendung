import { NextRequest, NextResponse } from 'next/server';
import { checkOutBooking } from '@/lib/services/roomCheckinService';

/**
 * POST /api/room-bookings/{id}/check-out — trả phòng (kết thúc sử dụng, giải phóng phòng).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id') || '';
    if (!userId) return NextResponse.json({ error: 'Thiếu thông tin người dùng' }, { status: 401 });

    const res = await checkOutBooking(params.id, userId);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/room-bookings/[id]/check-out error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
