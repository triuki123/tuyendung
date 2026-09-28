import { NextRequest, NextResponse } from 'next/server';
import { generateContractCode } from '@/lib/services/contractCodeService';
import { canManageContracts } from '@/lib/services/contractPermissionService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/contracts/generate-code — sinh mã hợp đồng theo template của loại HĐ.
 * Body: { contract_type_id, employee_id }. Trả { success, code }.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!(await canManageContracts(userId, 'create'))) {
      return NextResponse.json({ error: 'Không có quyền tạo hợp đồng' }, { status: 403 });
    }

    const body = await request.json();
    if (!body.contract_type_id || !body.employee_id) {
      return NextResponse.json(
        { error: 'Cần chọn loại hợp đồng và nhân viên trước khi sinh mã' },
        { status: 400 }
      );
    }

    const code = await generateContractCode(body.contract_type_id, body.employee_id);
    return NextResponse.json({ success: true, code });
  } catch (err: any) {
    // Lỗi cấu hình (chưa có mã loại / công ty) → trả 400 với thông điệp hướng dẫn.
    const msg = err?.message || 'Lỗi server';
    const isConfig = /cấu hình|công ty|Mã/i.test(msg);
    console.error('POST /api/contracts/generate-code error:', err);
    return NextResponse.json({ error: msg }, { status: isConfig ? 400 : 500 });
  }
}
