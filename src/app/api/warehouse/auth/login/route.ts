import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerLogin } from '@/lib/services/warehouseService';
import { setWorkerCookie } from '@/lib/warehouse/workerAuth';

export const dynamic = 'force-dynamic';

/**
 * Rate-limit chống dò PIN: 5 lần sai / CCCD → khóa 15 phút.
 * In-memory là đủ (1 instance app); restart chỉ reset bộ đếm.
 */
const FAIL_LIMIT = 5;
const LOCK_MS = 15 * 60 * 1000;
const failMap = new Map<string, { count: number; lockedUntil: number }>();

function checkLock(key: string): number {
  const f = failMap.get(key);
  if (f && f.lockedUntil > Date.now()) return Math.ceil((f.lockedUntil - Date.now()) / 60000);
  return 0;
}

function recordFail(key: string): void {
  const f = failMap.get(key) || { count: 0, lockedUntil: 0 };
  f.count += 1;
  if (f.count >= FAIL_LIMIT) {
    f.lockedUntil = Date.now() + LOCK_MS;
    f.count = 0;
  }
  failMap.set(key, f);
  // Dọn map để không phình vô hạn
  if (failMap.size > 5000) {
    for (const [k, v] of failMap) if (v.lockedUntil < Date.now() && v.count === 0) failMap.delete(k);
  }
}

/** Đăng nhập công nhân: CCCD + PIN → cookie warehouse_session */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cccd, pin } = body;
    if (!cccd || !pin) {
      return NextResponse.json({ error: 'Nhập số CCCD và mã PIN' }, { status: 400 });
    }
    const key = String(cccd).trim();
    const lockedMinutes = checkLock(key);
    if (lockedMinutes > 0) {
      return NextResponse.json(
        { error: `Sai PIN quá ${FAIL_LIMIT} lần — thử lại sau ${lockedMinutes} phút hoặc nhờ quản lý cấp lại PIN.` },
        { status: 429 }
      );
    }
    const warehouseId = body.warehouseId ? String(body.warehouseId) : null;
    const { worker, choices } = await verifyWorkerLogin(String(cccd), String(pin), warehouseId);

    // PIN đúng nhưng làm nhiều kho → yêu cầu chọn kho (không tính là sai PIN)
    if (choices && choices.length > 0) {
      failMap.delete(key);
      return NextResponse.json({ chooseWarehouse: choices }, { status: 409 });
    }
    if (!worker) {
      recordFail(key);
      return NextResponse.json({ error: 'CCCD hoặc mã PIN không đúng, hoặc tài khoản đã ngưng hoạt động' }, { status: 401 });
    }
    failMap.delete(key);
    const res = NextResponse.json({
      success: true,
      data: { id: worker.id, full_name: worker.full_name, warehouse_id: worker.warehouse_id },
    });
    return setWorkerCookie(res, { workerId: worker.id, warehouseId: worker.warehouse_id });
  } catch (err) {
    console.error('POST /api/warehouse/auth/login error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
