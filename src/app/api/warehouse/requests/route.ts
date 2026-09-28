import { NextRequest, NextResponse } from 'next/server';
import { getWorkerSession, workerUnauthorized } from '@/lib/warehouse/workerAuth';
import { createLeaveRequest, createAdvanceRequest, listWorkerRequests, getWarehouse } from '@/lib/services/warehouseService';

export const dynamic = 'force-dynamic';

/** GET: đơn nghỉ + ứng lương của công nhân hiện tại */
export async function GET(request: NextRequest) {
  try {
    const session = getWorkerSession(request);
    if (!session) return workerUnauthorized();
    const data = await listWorkerRequests(session.workerId);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/warehouse/requests error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST: tạo đơn. Body: { kind: 'leave', from_date, to_date, reason } | { kind: 'advance', amount, reason } */
export async function POST(request: NextRequest) {
  try {
    const session = getWorkerSession(request);
    if (!session) return workerUnauthorized();
    const body = await request.json();
    if (body.kind === 'leave') {
      if (!body.from_date || !body.to_date) {
        return NextResponse.json({ error: 'Chọn ngày nghỉ' }, { status: 400 });
      }
      const row = await createLeaveRequest(session.warehouseId, session.workerId, body.from_date, body.to_date, body.reason || '');
      return NextResponse.json({ success: true, data: row });
    }
    if (body.kind === 'advance') {
      const wh = await getWarehouse(session.warehouseId);
      if (!wh?.advance_enabled) {
        return NextResponse.json({ error: 'Tính năng ứng lương chưa được kích hoạt tại kho này' }, { status: 403 });
      }
      const amount = Number(body.amount);
      if (!amount || amount <= 0) {
        return NextResponse.json({ error: 'Nhập số tiền muốn ứng' }, { status: 400 });
      }
      const row = await createAdvanceRequest(session.warehouseId, session.workerId, amount, body.reason || '');
      return NextResponse.json({ success: true, data: row });
    }
    return NextResponse.json({ error: 'Loại đơn không hợp lệ' }, { status: 400 });
  } catch (err) {
    console.error('POST /api/warehouse/requests error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
