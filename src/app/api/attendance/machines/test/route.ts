import { NextRequest, NextResponse } from 'next/server';
import { ZKTecoClient } from '@/lib/zkteco/zkClient';
import { updateLastSync } from '@/lib/services/machineService';
import { pollerManager } from '@/lib/zkteco/pollerManager';
import { checkUnitAccess } from '@/lib/api-permissions';
import { getMachineById } from '@/lib/services/machineService';

/**
 * POST /api/attendance/machines/test
 * Kiểm tra kết nối tới máy ZKTeco trước khi lưu.
 * Body: { host, port }
 * Trả về: { ok: true } hoặc { ok: false, error }
 */
export async function POST(request: NextRequest) {
  try {
    const role = request.headers.get('x-current-user-role');
    if (!checkUnitAccess(request, 'cham-cong-machines', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }

    const { host, port, machineId } = await request.json();
    if (!host || !port) {
      return NextResponse.json({ ok: false, error: 'Thiếu host hoặc port' }, { status: 400 });
    }
    const companyId = request.headers.get('x-current-user-company');
    if (
      role !== 'super_admin' &&
      (!companyId || (machineId && !(await getMachineById(machineId, companyId))))
    ) {
      return NextResponse.json({ error: 'Máy không thuộc công ty hiện tại' }, { status: 403 });
    }

    const client = new ZKTecoClient(String(host), parseInt(String(port), 10));

    // Bọc timeout 15s — tránh treo request nếu máy không phản hồi
    const TIMEOUT_MS = 15000;
    let ok = false;
    let msg = '';
    try {
      await Promise.race([
        client.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Hết thời gian chờ kết nối (15s)')), TIMEOUT_MS)),
      ]);
      ok = true;
      msg = 'Kết nối thành công';
      // Cập nhật status → active ngay, không chờ poll cycle tiếp theo
      if (machineId) {
        updateLastSync(machineId).catch(() => {});
        // Kick poller restart nếu đang bị lỗi (fire-and-forget)
        pollerManager.restartMachine(machineId).catch(() => {});
      }
    } catch (err) {
      ok = false;
      msg = err instanceof Error ? err.message : 'Không kết nối được tới máy';
    }
    // KHÔNG await disconnect — socket có thể chưa mở → tránh treo response
    client.disconnect().catch(() => {});
    return NextResponse.json(ok ? { ok: true, message: msg } : { ok: false, error: msg });
  } catch (err) {
    console.error('POST /api/attendance/machines/test error:', err);
    return NextResponse.json({ ok: false, error: 'Lỗi server' }, { status: 500 });
  }
}
