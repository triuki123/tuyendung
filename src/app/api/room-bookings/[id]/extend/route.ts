import { NextRequest, NextResponse } from 'next/server';
import { extendBooking } from '@/lib/services/roomCheckinService';

/**
 * POST /api/room-bookings/{id}/extend — gia hạn cuộc họp đang diễn ra thêm {minutes} phút.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id') || '';
    if (!userId) return NextResponse.json({ error: 'Thiếu thông tin người dùng' }, { status: 401 });
    let minutes = 15;
    try { minutes = Number((await request.json())?.minutes) || 15; } catch { /* body trống */ }
    if (![15, 30, 45, 60].includes(minutes)) minutes = 15;

    const res = await extendBooking(params.id, minutes, userId);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ success: true, newEnd: res.newEnd });
  } catch (err) {
    console.error('POST /api/room-bookings/[id]/extend error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
