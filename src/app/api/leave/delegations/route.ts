import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/leaveDelegationService';
import { getEffectiveContext } from '@/lib/services/userCompanyService';

export const dynamic = 'force-dynamic';

/** Chỉ Admin/Super Admin (theo công ty đang làm việc) được quản lý ủy quyền duyệt phép. */
async function requireAdmin(request: NextRequest) {
  const userId = request.headers.get('x-current-user-id');
  if (!userId) return { error: NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 }) };
  const activeCompany = request.headers.get('x-current-user-company');
  const ctx = await getEffectiveContext(userId, activeCompany || null);
  const role = ctx?.role ?? 'user';
  if (role !== 'super_admin' && role !== 'admin') {
    return { error: NextResponse.json({ error: 'Chỉ Admin được cấu hình ủy quyền duyệt phép' }, { status: 403 }) };
  }
  return { userId, role, companyId: ctx?.company_id ?? activeCompany ?? null };
}

/** GET — danh sách ủy quyền duyệt phép (Admin: công ty đang chọn; super_admin: toàn bộ). */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if ('error' in guard) return guard.error;
    // super_admin không truyền company → xem tất cả; admin khoá theo công ty đang làm việc.
    const scope = guard.role === 'super_admin' ? null : guard.companyId;
    const data = await svc.listDelegations(scope);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/leave/delegations error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST — gán một ủy quyền: { approverUserId, targetUserId, note? }. */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if ('error' in guard) return guard.error;

    const body = await request.json();
    const approverUserId = String(body.approverUserId || '').trim();
    const targetUserId = String(body.targetUserId || '').trim();
    if (!approverUserId || !targetUserId) {
      return NextResponse.json({ error: 'Thiếu người duyệt hoặc người được duyệt cho' }, { status: 400 });
    }

    const result = await svc.createDelegation({
      approverUserId,
      targetUserId,
      companyId: guard.companyId,
      note: body.note ? String(body.note).trim() : null,
      createdBy: guard.userId,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error('POST /api/leave/delegations error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
