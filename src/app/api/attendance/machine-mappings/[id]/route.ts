import { NextRequest, NextResponse } from 'next/server';
import * as mappingService from '@/lib/services/machineMappingService';
import * as attendanceService from '@/lib/services/attendanceService';
import { checkUnitAccess } from '@/lib/api-permissions';

/**
 * Xóa mapping (Projection Model).
 * Punch trong device_punches KHÔNG bị xóa — chỉ ẩn khỏi user (JOIN rỗng).
 * "Coi như chưa có gì xảy ra": gắn lại mapping đúng → punch hiện lại ngay.
 */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const role = request.headers.get('x-current-user-role');
    if (!checkUnitAccess(request, 'cham-cong-machines', 'delete')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const companyId = request.headers.get('x-current-user-company');
    if (role !== 'super_admin' && !companyId) {
      return NextResponse.json({ error: 'Tài khoản chưa được gán công ty' }, { status: 403 });
    }

    const { deleted, userIds } = await mappingService.deleteMapping(
      params.id,
      role === 'super_admin' ? null : companyId
    );
    if (!deleted) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });

    // Refresh cache stats cho MỌI user từng gắn mã (dữ liệu ẩn đi khỏi tất cả)
    const now = new Date().toISOString();
    for (const uid of userIds) {
      attendanceService.refreshSheetStatsAsync(uid, now).catch(console.error);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE machine-mapping error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
