import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/attendanceService';
import { getDiligenceReport } from '@/lib/services/attendanceDiligenceService';

/**
 * GET /api/attendance/diligence?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Theo Dõi Chuyên Cần — scope theo vai trò (Đa Công Ty):
 *   - super_admin : toàn bộ nhân sự hệ thống
 *   - admin       : toàn bộ thành viên công ty đang làm việc
 *   - manager     : cấp dưới (đệ quy) trong công ty đang làm việc + bản thân
 *   - user        : chỉ bản thân
 *
 * Quyền bật/tắt per-user qua module `cham-cong-diligence` (kế thừa `cham-cong`).
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    const activeCompany = request.headers.get('x-current-user-company');
    if (!userId) return NextResponse.json({ error: 'Chưa xác thực' }, { status: 401 });

    const { getEffectiveContext, getCompanyMemberUserIds } = await import('@/lib/services/userCompanyService');
    const ctx = await getEffectiveContext(userId, activeCompany || null);
    const role = ctx?.role ?? 'user';
    const companyId = ctx?.company_id ?? activeCompany ?? null;

    // Quyền view: module con cham-cong-diligence, kế thừa mẹ cham-cong nếu chưa cấu hình riêng.
    const effPerms: Record<string, string[]> = (ctx?.module_permissions as Record<string, string[]>) ?? {};
    const childPerms = effPerms['cham-cong-diligence'];
    const parentPerms = effPerms['cham-cong'];
    const canView = Array.isArray(childPerms)
      ? childPerms.includes('view')
      : Array.isArray(parentPerms)
        ? parentPerms.includes('view')
        : true; // chưa cấu hình → theo mặc định vai trò (giống cơ chế kế thừa client)
    if (!canView) return NextResponse.json({ error: 'Không có quyền xem Theo Dõi Chuyên Cần' }, { status: 403 });

    // ── Khoảng thời gian ──
    const { searchParams } = new URL(request.url);
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const from = searchParams.get('from') ?? '';
    const to = searchParams.get('to') ?? '';
    if (!dateRe.test(from) || !dateRe.test(to) || from > to) {
      return NextResponse.json({ error: 'Khoảng thời gian không hợp lệ' }, { status: 400 });
    }
    // Chặn khoảng quá dài (> 2 năm) để bảo vệ server
    if (new Date(to).getTime() - new Date(from).getTime() > 2 * 366 * 86400000) {
      return NextResponse.json({ error: 'Khoảng thời gian tối đa 2 năm' }, { status: 400 });
    }

    // ── Danh sách user theo phạm vi ──
    let userIds: string[];
    if (role === 'super_admin') {
      // Super admin: TOÀN BỘ nhân sự active trong hệ thống
      const { getAllActiveUserIds } = await import('@/lib/services/attendanceDiligenceService');
      userIds = await getAllActiveUserIds();
    } else if (role === 'admin') {
      userIds = companyId ? await getCompanyMemberUserIds(companyId) : [];
      if (!userIds.some((x) => x.toLowerCase() === userId.toLowerCase())) userIds.push(userId);
    } else if (role === 'manager') {
      userIds = [...(await svc.getOrgSubtreeUserIds(userId, companyId)), userId];
    } else {
      userIds = [userId];
    }

    const data = await getDiligenceReport(userIds, from, to);
    return NextResponse.json({ success: true, data, scopeRole: role });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('GET /api/attendance/diligence error:', msg);
    return NextResponse.json({ error: 'Lỗi server', detail: msg }, { status: 500 });
  }
}
