import { NextRequest, NextResponse } from 'next/server';
import { pollerManager } from '@/lib/zkteco/pollerManager';
import * as machineService from '@/lib/services/machineService';
import { checkUnitAccess } from '@/lib/api-permissions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/attendance/poller-status
 * Chẩn đoán tiến trình nền poller: cho biết poller định kỳ nào ĐANG chạy
 * (do pollerManager.start() khởi tạo lúc server start), so với danh sách máy
 * ĐÁNG LẼ phải poll theo cấu hình DB. Dùng để xác minh background services
 * có sống trong production hay không (manual sync chạy được nhưng auto-poll
 * không → nghi tiến trình nền chết).
 */
export async function GET(request: NextRequest) {
  try {
    const role = request.headers.get('x-current-user-role');
    if (!checkUnitAccess(request, 'cham-cong-machines', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }

    const companyId = request.headers.get('x-current-user-company');
    if (role !== 'super_admin' && !companyId) {
      return NextResponse.json({ error: 'Tài khoản chưa được gán công ty' }, { status: 403 });
    }

    const machines = await machineService.getAllMachines(
      role === 'super_admin' ? null : companyId
    ).catch(() => []);
    const visibleMachineIds = new Set(machines.map(machine => machine.id));
    const runningIds = pollerManager.getRunningIds().filter(id => visibleMachineIds.has(id));
    const shouldPoll = machines
      .filter((m) => m.polling_enabled && m.status !== 'disabled' && m.connection_mode === 'pull')
      .map((m) => ({
        id: m.id,
        name: m.name,
        connection_mode: m.connection_mode,
        polling_enabled: m.polling_enabled,
        status: m.status,
        poll_interval_seconds: m.poll_interval_seconds,
        is_running: runningIds.includes(m.id),
      }));

    const missing = shouldPoll.filter((m) => !m.is_running).map((m) => m.id);

    return NextResponse.json({
      running_poller_ids: runningIds,
      running_count: runningIds.length,
      machines_should_poll: shouldPoll,
      machines_missing_poller: missing,
      diagnosis:
        runningIds.length === 0 && shouldPoll.length > 0
          ? '🔴 KHÔNG có poller nền nào chạy dù có máy cấu hình pull+polling → tiến trình nền (instrumentation/pollerManager.start) có thể KHÔNG sống trong production. Manual sync vẫn chạy vì theo request.'
          : missing.length > 0
            ? `🟠 Có ${missing.length} máy đáng lẽ poll nhưng chưa có poller nền: ${missing.join(', ')}`
            : '✅ Tất cả máy cấu hình pull+polling đều có poller nền đang chạy.',
    });
  } catch (err) {
    console.error('GET /api/attendance/poller-status error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
