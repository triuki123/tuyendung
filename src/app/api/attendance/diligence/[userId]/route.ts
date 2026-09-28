import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/attendanceService';
import { getDiligenceDayEvents } from '@/lib/services/attendanceDiligenceService';

/**
 * GET /api/attendance/diligence/[userId]?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Nhật ký chuyên cần THEO NGÀY của 1 nhân sự (đi trễ/về sớm/vắng/quên chấm/nghỉ phép
 * kèm ngày cụ thể). Chỉ trả dữ liệu nếu nhân sự nằm TRONG PHẠM VI của người gọi:
 *   - super_admin : bất kỳ ai
 *   - admin       : thành viên công ty đang làm việc
 *   - manager     : cấp dưới đệ quy + bản thân
 *   - user        : chỉ bản thân
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const callerId = request.headers.get('x-current-user-id');
    const activeCompany = request.headers.get('x-current-user-company');
    if (!callerId) return NextResponse.json({ error: 'Chưa xác thực' }, { status: 401 });

    const targetId = (params.userId || '').toLowerCase();
    if (!targetId) return NextResponse.json({ error: 'Thiếu nhân sự' }, { status: 400 });

    const { getEffectiveContext, getCompanyMemberUserIds } = await import('@/lib/services/userCompanyService');
    const ctx = await getEffectiveContext(callerId, activeCompany || null);
    const role = ctx?.role ?? 'user';
    const companyId = ctx?.company_id ?? activeCompany ?? null;

    // Quyền view module (kế thừa cham-cong nếu chưa cấu hình riêng)
    const effPerms: Record<string, string[]> = (ctx?.module_permissions as Record<string, string[]>) ?? {};
    const childPerms = effPerms['cham-cong-diligence'];
    const parentPerms = effPerms['cham-cong'];
    const canView = Array.isArray(childPerms)
      ? childPerms.includes('view')
      : Array.isArray(parentPerms)
        ? parentPerms.includes('view')
        : true;
    if (!canView) return NextResponse.json({ error: 'Không có quyền xem Theo Dõi Chuyên Cần' }, { status: 403 });

    // ── Kiểm tra phạm vi ──
    const isSelf = callerId.toLowerCase() === targetId;
    let inScope = isSelf;
    if (!inScope) {
      if (role === 'super_admin') {
        inScope = true;
      } else if (role === 'admin') {
        const members = companyId ? await getCompanyMemberUserIds(companyId) : [];
        inScope = members.some((x) => x.toLowerCase() === targetId);
      } else if (role === 'manager') {
        const subtree = await svc.getOrgSubtreeUserIds(callerId, companyId);
        inScope = subtree.some((x) => x.toLowerCase() === targetId);
      }
    }
    if (!inScope) return NextResponse.json({ error: 'Nhân sự ngoài phạm vi của bạn' }, { status: 403 });

    // ── Khoảng thời gian ──
    const { searchParams } = new URL(request.url);
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const from = searchParams.get('from') ?? '';
    const to = searchParams.get('to') ?? '';
    if (!dateRe.test(from) || !dateRe.test(to) || from > to) {
      return NextResponse.json({ error: 'Khoảng thời gian không hợp lệ' }, { status: 400 });
    }
    if (new Date(to).getTime() - new Date(from).getTime() > 2 * 366 * 86400000) {
      return NextResponse.json({ error: 'Khoảng thời gian tối đa 2 năm' }, { status: 400 });
    }

    const data = await getDiligenceDayEvents(targetId, from, to);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('GET /api/attendance/diligence/[userId] error:', msg);
    return NextResponse.json({ error: 'Lỗi server', detail: msg }, { status: 500 });
  }
}
