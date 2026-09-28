import { NextRequest, NextResponse } from 'next/server';
import { getMachineById } from '@/lib/services/machineService';
import { pollerManager } from '@/lib/zkteco/pollerManager';
import { checkUnitAccess } from '@/lib/api-permissions';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * POST /api/attendance/machines/:id/sync
 * Đồng bộ ngay — kết nối máy, kéo dữ liệu và CHỜ kết quả thật
 * (giống "Kiểm tra kết nối": thành công/thất bại báo ngay cho UI).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const role = request.headers.get('x-current-user-role');
    if (!checkUnitAccess(request, 'cham-cong-machines', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }

    const companyId = request.headers.get('x-current-user-company');
    if (role !== 'super_admin' && !companyId) {
      return NextResponse.json({ error: 'Tài khoản chưa được gán công ty' }, { status: 403 });
    }
    const machine = await getMachineById(params.id, role === 'super_admin' ? null : companyId);
    if (!machine) {
      return NextResponse.json({ error: 'Không tìm thấy máy' }, { status: 404 });
    }
    if (machine.connection_mode !== 'pull') {
      return NextResponse.json(
        { error: 'Chỉ hỗ trợ đồng bộ thủ công cho máy Pull' },
        { status: 400 }
      );
    }

    console.log(`[SyncRoute] 🔔 Đồng bộ ngay máy ${params.id} (${machine.name}) — chờ kết quả`);

    // Chờ poll thật, tối đa 60s (kéo lần đầu nhiều bản ghi có thể lâu)
    const TIMEOUT_MS = 60_000;
    const stats = await Promise.race([
      pollerManager.syncNowAndWait(params.id),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Hết thời gian chờ (60s) — máy phản hồi chậm hoặc đang bận, thử lại sau')), TIMEOUT_MS)
      ),
    ]);

    if (stats.skipped) {
      return NextResponse.json({
        success: true,
        message: `Máy "${machine.name}" đang trong chu kỳ đồng bộ tự động — dữ liệu sẽ cập nhật trong giây lát.`,
        stats,
      });
    }

    console.log(`[SyncRoute] ✅ ${params.id}: nhận ${stats.received}, mới ${stats.newCount}`);
    return NextResponse.json({
      success: true,
      message:
        stats.newCount > 0
          ? `Đồng bộ xong: nhận ${stats.received.toLocaleString('vi-VN')} bản ghi, ${stats.newCount.toLocaleString('vi-VN')} lượt chấm MỚI.`
          : `Đồng bộ xong: nhận ${stats.received.toLocaleString('vi-VN')} bản ghi, không có lượt chấm mới.`,
      stats,
    });
  } catch (err) {
    console.error('POST /api/attendance/machines/:id/sync error:', err);
    const msg = err instanceof Error ? err.message : 'Lỗi server';
    return NextResponse.json({ success: false, error: `Đồng bộ thất bại: ${msg}` }, { status: 502 });
  }
}
