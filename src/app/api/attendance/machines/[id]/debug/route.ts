import { NextRequest, NextResponse } from 'next/server';
import { getMachineById } from '@/lib/services/machineService';
import { ZKTecoClient } from '@/lib/zkteco/zkClient';
import { query } from '@/lib/db';
import { checkUnitAccess } from '@/lib/api-permissions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/attendance/machines/:id/debug
 * Chẩn đoán toàn diện: so sánh máy ↔ DB, phát hiện parser sai, employee_code bị miss.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const role = request.headers.get('x-current-user-role');
    if (!checkUnitAccess(request, 'cham-cong-machines', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }

    const companyId = request.headers.get('x-current-user-company');
    if (role !== 'super_admin' && !companyId) {
      return NextResponse.json({ error: 'Tài khoản chưa được gán công ty' }, { status: 403 });
    }
    const machine = await getMachineById(
      params.id,
      role === 'super_admin' ? null : companyId
    );
    if (!machine) {
      return NextResponse.json({ error: 'Không tìm thấy máy' }, { status: 404 });
    }

    // ── 1. DB: 10 records mới nhất ──
    const dbRecent = await query<{
      employee_code: string;
      punch_time: string;
      raw_status: number | null;
    }>(
      `SELECT employee_code, punch_time, raw_status
       FROM device_punches
       WHERE machine_id = $1
       ORDER BY punch_time DESC
       LIMIT 10`,
      [params.id]
    );

    // ── 2. DB: thống kê tổng quát ──
    const [dbStats] = await query<{
      total: string;
      newest: string;
      oldest: string;
      distinct_codes: string;
    }>(
      `SELECT COUNT(*) as total,
              MAX(punch_time) as newest,
              MIN(punch_time) as oldest,
              COUNT(DISTINCT employee_code) as distinct_codes
       FROM device_punches WHERE machine_id = $1`,
      [params.id]
    );

    // ── 3. DB: employee_codes không có mapping (dấu hiệu parser sai) ──
    const unmappedCodes = await query<{
      employee_code: string;
      punch_count: string;
      latest_punch: string;
    }>(
      `SELECT dp.employee_code,
              COUNT(*) as punch_count,
              MAX(dp.punch_time) as latest_punch
       FROM device_punches dp
       WHERE dp.machine_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM attendance_machine_mappings m
           WHERE m.machine_id = dp.machine_id
             AND m.employee_code = dp.employee_code
         )
       GROUP BY dp.employee_code
       ORDER BY MAX(dp.punch_time) DESC
       LIMIT 20`,
      [params.id]
    );

    // ── 4. DB: Kiểm tra 7 ngày gần đây có gì không ──
    const recentDays = await query<{ date: string; count: string; codes: string }>(
      `SELECT DATE(punch_time AT TIME ZONE 'Asia/Ho_Chi_Minh') as date,
              COUNT(*) as count,
              STRING_AGG(DISTINCT employee_code, ', ' ORDER BY employee_code) as codes
       FROM device_punches
       WHERE machine_id = $1
         AND punch_time >= NOW() - INTERVAL '7 days'
       GROUP BY DATE(punch_time AT TIME ZONE 'Asia/Ho_Chi_Minh')
       ORDER BY date DESC`,
      [params.id]
    );

    // ── 5. Kéo live từ máy (với timeout 90s trong zkClient) ──
    let machineRecent: object[] | null = null;
    let machineStats: object | null = null;
    let machineError: string | null = null;

    try {
      const parser = (machine as any).attendance_parser || 'legacy';
      const client = new ZKTecoClient(machine.host, machine.port, parser);
      await client.connect();
      const records = await client.getAttendanceRecords();
      await client.disconnect();

      const validRecords = records.filter((r) => r.timestamp > 0);
      const sorted = [...validRecords].sort((a, b) => b.timestamp - a.timestamp);

      machineRecent = sorted.slice(0, 8).map((r) => ({
        employee_code: r.employee_code,
        raw_uid: r.raw_uid,
        raw_id: r.raw_id,
        punch_time_vn: new Date(r.timestamp * 1000).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
        punch_time_iso: new Date(r.timestamp * 1000).toISOString(),
        status: r.status,
      }));

      const uniqueCodes = new Set(records.map((r) => r.employee_code));

      machineStats = {
        total_records: records.length,
        unique_employee_codes: uniqueCodes.size,
        employee_codes_all: [...uniqueCodes].sort(),
        newest_punch_vn: sorted[0]?.timestamp
          ? new Date(sorted[0].timestamp * 1000).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
          : null,
        oldest_punch_vn: sorted[sorted.length - 1]?.timestamp
          ? new Date(sorted[sorted.length - 1].timestamp * 1000).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
          : null,
        parser_used: parser,
      };
    } catch (err) {
      machineError = err instanceof Error ? err.message : String(err);
    }

    const diagnosis = buildDiagnosis(dbStats, unmappedCodes, machineStats, machineError, recentDays);

    return NextResponse.json({
      machine_info: {
        id: machine.id,
        name: machine.name,
        host: machine.host,
        port: machine.port,
        last_sync: machine.last_sync,
        last_error: machine.last_error,
        status: machine.status,
        polling_enabled: machine.polling_enabled,
        attendance_parser: (machine as any).attendance_parser || 'legacy',
      },
      db: {
        recent_10: dbRecent,
        stats: dbStats || null,
        last_7_days: recentDays,
        unmapped_employee_codes: unmappedCodes,
      },
      live_from_machine: {
        recent_8: machineRecent,
        stats: machineStats,
        error: machineError,
      },
      diagnosis,
    });
  } catch (err) {
    console.error('GET /api/attendance/machines/:id/debug error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

function buildDiagnosis(
  dbStats: any,
  unmappedCodes: { employee_code: string; punch_count: string; latest_punch: string }[],
  machineStats: any,
  machineError: string | null,
  recentDays: { date: string; count: string }[]
): string[] {
  const hints: string[] = [];

  // Kiểm tra 7 ngày gần đây có dữ liệu không
  if (recentDays.length === 0) {
    hints.push('🔴 KHÔNG có bản ghi nào trong 7 ngày gần đây trong device_punches');
  } else {
    hints.push(`✅ Có dữ liệu trong ${recentDays.length} ngày của 7 ngày qua: ${recentDays.map(d => d.date).join(', ')}`);
  }

  // Kiểm tra unmapped codes
  if (unmappedCodes.length > 0) {
    const latestUnmapped = unmappedCodes[0].latest_punch;
    const daysSince = Math.round((Date.now() - new Date(latestUnmapped).getTime()) / 86400000);
    if (daysSince < 7) {
      hints.push(`🔴 Có ${unmappedCodes.length} employee_code KHÔNG có mapping trong 7 ngày qua: ${unmappedCodes.map(c => `"${c.employee_code}"(${c.punch_count})`).slice(0, 5).join(', ')}`);
      hints.push('→ Parser có thể SAI: máy gửi v6.60 nhưng đang dùng "legacy". Đổi attendance_parser → "v6.60" trong DB.');
    } else {
      hints.push(`ℹ️ Có ${unmappedCodes.length} employee_code không mapped nhưng đều là dữ liệu cũ`);
    }
  } else {
    hints.push('✅ Tất cả employee_code đều có mapping (hoặc chưa có records nào)');
  }

  // Kiểm tra lỗi kết nối máy
  if (machineError) {
    if (machineError.includes('timeout')) {
      hints.push('🔴 getAttendance TIMEOUT — zklib bị hang (buffer mismatch bug). Sau khi restart server thử lại.');
    } else {
      hints.push(`🔴 Không kết nối được máy: ${machineError}`);
    }
    return hints;
  }

  if (machineStats) {
    // So sánh mới nhất DB vs máy
    const dbNewest = dbStats?.newest ? new Date(dbStats.newest) : null;
    const machineNewest = machineStats.newest_punch_vn;

    if (machineStats.total_records === 0) {
      hints.push('🔴 Máy KHÔNG có bản ghi nào — log máy đã bị xóa hoặc chưa có ai chấm công lần nào');
    } else {
      hints.push(`ℹ️ Máy có ${machineStats.total_records} records, ${machineStats.unique_employee_codes} nhân viên, mới nhất: ${machineNewest}`);
    }

    // Phát hiện employee_code bất thường từ máy
    const machineCodes: string[] = machineStats.employee_codes_all || [];
    const hasLargeCodes = machineCodes.some((c: string) => parseInt(c, 10) > 99999);
    const hasLongCodes = machineCodes.some((c: string) => c.length > 8);
    if (hasLargeCodes || hasLongCodes) {
      hints.push(`⚠️ Employee codes trên máy có giá trị LỚN (${machineCodes.filter((c: string) => parseInt(c, 10) > 99999).slice(0, 3).join(', ')}) — có thể đang dùng sai parser. Thử đổi sang "v6.60".`);
    }
  }

  return hints;
}
