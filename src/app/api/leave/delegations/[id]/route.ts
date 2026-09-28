import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/leaveDelegationService';
import { getEffectiveContext } from '@/lib/services/userCompanyService';

export const dynamic = 'force-dynamic';

/** DELETE — gỡ một ủy quyền duyệt phép (chỉ Admin/Super Admin). */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const activeCompany = request.headers.get('x-current-user-company');
    const ctx = await getEffectiveContext(userId, activeCompany || null);
    const role = ctx?.role ?? 'user';
    if (role !== 'super_admin' && role !== 'admin') {
      return NextResponse.json({ error: 'Chỉ Admin được gỡ ủy quyền duyệt phép' }, { status: 403 });
    }
    await svc.deleteDelegation(params.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/leave/delegations/:id error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
