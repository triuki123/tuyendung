import { NextRequest, NextResponse } from 'next/server';
import { listCompanies } from '@/lib/services/companyEcardService';
import { checkUnitAccess } from '@/lib/api-permissions';
import { ecardCompanyScope } from '@/lib/ecardScope';

export const dynamic = 'force-dynamic';

/** GET /api/company-ecard — danh sách công ty + trạng thái hồ sơ năng lực (chỉ người biên tập). */
export async function GET(request: NextRequest) {
  try {
    const callerId = request.headers.get('x-current-user-id');
    if (!callerId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    // Dùng helper chuẩn: quyền HIỆU LỰC = quyền suy từ vai trò + quyền gán tường minh.
    // Chốt cũ tự đọc header x-user-permissions thô nên Admin có quyền theo VAI TRÒ vẫn bị
    // 403 → ô "Chọn công ty" trống trơn dù sidebar vẫn hiện module.
    if (!checkUnitAccess(request, 'ho-so-nang-luc', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const scope = await ecardCompanyScope(request);
    const data = await listCompanies(scope);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/company-ecard error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
