import { NextRequest, NextResponse } from 'next/server';
import { getSuggestedContractTypesForEmployee } from '@/lib/services/employmentTypeContractService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/contracts/suggested-types?employee_id=X
 * Loại HĐ phù hợp với hình thức làm việc của nhân viên (để gợi ý khi tạo HĐ).
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const employeeId = request.nextUrl.searchParams.get('employee_id');
    if (!employeeId) return NextResponse.json({ success: true, data: [] });
    const data = await getSuggestedContractTypesForEmployee(employeeId);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/contracts/suggested-types error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
