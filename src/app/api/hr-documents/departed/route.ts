import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/hrDocumentService';
import { canManageContracts, getContractVisibility } from '@/lib/services/contractPermissionService';

export const dynamic = 'force-dynamic';

/** GET /api/hr-documents/departed?q= — nhân sự đã nghỉ + số hồ sơ (HR admin). */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const activeCompany = request.headers.get('x-current-user-company') || undefined;
    if (!(await canManageContracts(userId, 'view', activeCompany))) {
      return NextResponse.json({ error: 'Không có quyền xem hồ sơ nhân sự đã nghỉ' }, { status: 403 });
    }
    const q = request.nextUrl.searchParams.get('q') || '';
    const visibility = await getContractVisibility(userId, activeCompany);
    const data = await svc.listDepartedPersonnel(
      q,
      visibility.all ? undefined : (visibility.allowedEmployeeIds ?? [])
    );
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/hr-documents/departed error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
