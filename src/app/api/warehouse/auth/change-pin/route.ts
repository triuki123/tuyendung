import { NextRequest, NextResponse } from 'next/server';
import { getWorkerSession, workerUnauthorized } from '@/lib/warehouse/workerAuth';
import { changeWorkerPin } from '@/lib/services/warehouseService';

export const dynamic = 'force-dynamic';

/** POST: công nhân tự đổi PIN. Body { currentPin, newPin } */
export async function POST(request: NextRequest) {
  try {
    const session = getWorkerSession(request);
    if (!session) return workerUnauthorized();
    const { currentPin, newPin } = await request.json();
    if (!currentPin || !newPin) {
      return NextResponse.json({ error: 'Nhập PIN hiện tại và PIN mới' }, { status: 400 });
    }
    if (!/^\d{6}$/.test(String(newPin))) {
      return NextResponse.json({ error: 'PIN mới phải đúng 6 chữ số' }, { status: 400 });
    }
    if (String(newPin) === String(currentPin)) {
      return NextResponse.json({ error: 'PIN mới phải khác PIN hiện tại' }, { status: 400 });
    }
    if (/^(\d)\1{5}$/.test(String(newPin)) || String(newPin) === '123456') {
      return NextResponse.json({ error: 'PIN quá dễ đoán (VD 111111, 123456) — chọn PIN khác' }, { status: 400 });
    }
    const result = await changeWorkerPin(session.workerId, String(currentPin), String(newPin));
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/warehouse/auth/change-pin error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
