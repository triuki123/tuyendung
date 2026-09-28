import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { getEffectiveContext } from '@/lib/services/userCompanyService';
import { getDesignAssignees } from '@/lib/services/designRequestAssigneeService';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'design-requests', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const userId = request.headers.get('x-current-user-id');
    const companyId = request.headers.get('x-current-user-company');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const context = await getEffectiveContext(userId, companyId || null);
    if (!context?.company_id) {
      return NextResponse.json({ error: 'Vui lòng chọn công ty trước khi giao việc' }, { status: 400 });
    }
    const data = await getDesignAssignees(context.company_id);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/design-requests/assignees error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
