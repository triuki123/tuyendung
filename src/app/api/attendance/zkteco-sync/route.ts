import { NextRequest, NextResponse } from 'next/server';
import { ZKTecoClient } from '@/lib/zkteco/zkClient';
import * as mappingService from '@/lib/services/machineMappingService';
import * as attendanceService from '@/lib/services/attendanceService';
import { bulkRecordDevicePunches } from '@/lib/services/attendanceService';
import { getMachineById } from '@/lib/services/machineService';
import { attendanceBroadcaster } from '@/lib/attendanceBroadcaster';
import { checkUnitAccess } from '@/lib/api-permissions';

/**
 * POST /api/attendance/zkteco-sync
 * Pull toàn bộ dữ liệu từ máy ZKTeco → ghi punch thô vào device_punches (Projection Model).
 * Cấu hình máy (host/port/parser) đọc từ DB theo machineId — không hardcode.
 *
 * Body: { "machineId": "zkteco_ronald_jack_1" }
 * (machineIp/machinePort tùy chọn — chỉ dùng khi muốn override cấu hình DB)
 */
export async function POST(request: NextRequest) {
  try {
    const role = request.headers.get('x-current-user-role');
    if (!checkUnitAccess(request, 'cham-cong-machines', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const machineId: string = body.machineId || 'zkteco_ronald_jack_1';
    const companyId = request.headers.get('x-current-user-company');
    if (role !== 'super_admin' && !companyId) {
      return NextResponse.json({ error: 'Tài khoản chưa được gán công ty' }, { status: 403 });
    }

    // Đọc cấu hình máy từ DB — nguồn sự thật duy nhất
    const machine = await getMachineById(
      machineId,
      role === 'super_admin' ? null : companyId
    );
    if (!machine && (!body.machineIp || !body.machinePort)) {
      return NextResponse.json({ error: `Không tìm thấy máy ${machineId}` }, { status: 404 });
    }

    const host: string = role === 'super_admin'
      ? (body.machineIp || machine!.host)
      : machine!.host;
    const port: number = parseInt(String(
      role === 'super_admin' ? (body.machinePort || machine!.port) : machine!.port
    ), 10);
    const parser: string = (machine as any)?.attendance_parser || 'legacy';

    console.log(`[ZKTeco-Sync] Starting sync for ${machineId} (${host}:${port}, parser: ${parser})`);

    const zkClient = new ZKTecoClient(host, port, parser);

    try {
      await zkClient.connect();
      const records = await zkClient.getAttendanceRecords();

      console.log(`[ZKTeco-Sync] Retrieved ${records.length} records from machine`);

      // Bulk insert TẤT CẢ punches — ON CONFLICT DO NOTHING, chỉ nhận lại những cái MỚI
      const punches = records
        .map((r) => ({
          employee_code: r.employee_code,
          punch_time: new Date(r.timestamp * 1000).toISOString(),
          raw_status: r.status ?? null,
        }))
        .filter((p) => p.employee_code && !isNaN(new Date(p.punch_time).getTime()));

      const newPunches = await bulkRecordDevicePunches(machineId, punches);

      // Refresh sheet stats + broadcast cho các user có punch mới (qua mapping)
      const usersToRefresh = new Set<string>();
      for (const punch of newPunches) {
        const uid = await mappingService
          .lookupUserId(machineId, punch.employee_code, punch.punch_time)
          .catch(() => null);
        if (uid) usersToRefresh.add(uid);
      }

      const nowIso = new Date().toISOString();
      for (const uid of usersToRefresh) {
        attendanceService.refreshSheetStatsAsync(uid, nowIso).catch(console.error);
        attendanceBroadcaster.broadcast({
          type: 'check_in',
          user_id: uid,
          recorded_at: nowIso,
          machine_id: machineId,
          timestamp: Date.now(),
        });
      }

      console.log(
        `[ZKTeco-Sync] ✅ Sync xong: ${punches.length} records, ${newPunches.length} punch mới, ${usersToRefresh.size} user cập nhật`
      );

      return NextResponse.json({
        success: true,
        message: `Sync completed: ${newPunches.length} punch mới / ${punches.length} records`,
        stats: {
          totalRecords: records.length,
          processedCount: punches.length,
          newPunchCount: newPunches.length,
          usersUpdated: usersToRefresh.size,
        },
      });
    } finally {
      await zkClient.disconnect().catch(() => {});
    }
  } catch (err) {
    console.error('[ZKTeco-Sync] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi sync' },
      { status: 500 }
    );
  }
}
