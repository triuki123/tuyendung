import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/attendanceService';
import * as adjSvc from '@/lib/services/attendanceAdjustmentService';

export async function GET(request: NextRequest) {
  try {
    const userId   = request.headers.get('x-current-user-id');
    const activeCompany = request.headers.get('x-current-user-company');

    if (!userId) return NextResponse.json({ error: 'Chưa xác thực' }, { status: 401 });

    // Đa Công Ty: role + quyền + công ty suy theo công ty đang làm việc (không tin header).
    const { getEffectiveContext, getCompanyMemberUserIds } = await import('@/lib/services/userCompanyService');
    const ctx = await getEffectiveContext(userId, activeCompany || null);
    const role = ctx?.role ?? 'user';
    const companyId = ctx?.company_id ?? activeCompany ?? null;

    const isAdminRole   = role === 'super_admin' || role === 'admin';
    const isManagerRole = role === 'manager';

    // canApprove suy từ quyền hiệu lực của công ty đang làm việc.
    const effPerms: any = ctx?.module_permissions || {};
    const hasApprovePermission =
      isAdminRole ||
      (isManagerRole && Array.isArray(effPerms?.attendance) && effPerms.attendance.includes('approve'));

    const { searchParams } = new URL(request.url);
    // Dùng timezone VN để lấy tháng/năm mặc định đúng
    const nowVN = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    const [defYear, defMonth] = nowVN.split('-').map(Number);
    const month = parseInt(searchParams.get('month') ?? String(defMonth));
    const year  = parseInt(searchParams.get('year')  ?? String(defYear));

    // ── Lấy danh sách user ID theo phạm vi (Đa Công Ty) ──
    let userIds: string[];
    try {
      if (role === 'super_admin') {
        // Super admin: TOÀN HỆ THỐNG — tất cả nhân viên active của mọi công ty.
        userIds = await svc.getAllActiveUserIds();
      } else if (isAdminRole) {
        // Admin: toàn bộ thành viên CÔNG TY đang làm việc.
        userIds = companyId ? await getCompanyMemberUserIds(companyId) : [];
      } else if (isManagerRole) {
        // Quản lý: cấp dưới (đệ quy) TRONG công ty đang làm việc + chính mình.
        const subtree = await svc.getOrgSubtreeUserIds(userId, companyId);
        userIds = [...new Set([userId, ...subtree])];
      } else {
        // Người dùng thường: chỉ bảng công của CHÍNH MÌNH.
        userIds = [userId];
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('GET /api/attendance/team — lỗi lấy userIds:', msg);
      return NextResponse.json({ error: 'Lỗi truy vấn danh sách nhân viên', detail: msg }, { status: 500 });
    }

    if (userIds.length === 0) {
      return NextResponse.json({ success: true, data: [], canApprove: hasApprovePermission });
    }

    // ── Lazy auto-submit ── (deadline theo cấu hình công ty đang xem)
    try {
      const { resolveAttendanceConfig } = await import('@/lib/services/attendanceSettingsService');
      const cfg = await resolveAttendanceConfig(companyId, `${year}-${String(month).padStart(2, '0')}-15`);
      const deadline = await adjSvc.getMonthDeadline(month, year, cfg);
      if (new Date() >= deadline) {
        await svc.autoSubmitDraftSheets(userIds, month, year);
      }
    } catch { /* không block kết quả */ }

    // ── Trả về danh sách bảng công ──
    let data: Awaited<ReturnType<typeof svc.getTeamSheetsEnriched>>;
    try {
      // companyId = công ty ĐANG ĐỨNG → bảng công gắn nhãn công ty/phòng ban/quản lý của
      // đúng công ty đó (người kiêm nhiệm không còn bị gắn nhãn công ty chính).
      data = await svc.getTeamSheetsEnriched(userIds, month, year, companyId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('GET /api/attendance/team — lỗi getTeamSheetsByUserIds:', msg);
      return NextResponse.json({ error: 'Lỗi truy vấn bảng công', detail: msg }, { status: 500 });
    }

    return NextResponse.json({ success: true, data, canApprove: hasApprovePermission });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('GET /api/attendance/team error:', msg);
    return NextResponse.json({ error: 'Lỗi server', detail: msg }, { status: 500 });
  }
}
