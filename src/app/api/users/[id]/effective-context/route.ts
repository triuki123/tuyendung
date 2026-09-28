/**
 * GET /api/users/[id]/effective-context?company_id=X
 * Trả ngữ cảnh hiệu lực (role + module_permissions + vị trí tổ chức) của user tại
 * công ty X. Dùng khi đổi công ty trên Topbar để cập nhật sidebar/quyền phía client.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveContext } from '@/lib/services/userCompanyService';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('company_id');

    const ctx = await getEffectiveContext(id, companyId);
    if (!ctx) {
      return NextResponse.json(
        { error: 'Người dùng không thuộc công ty này' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: ctx });
  } catch (error) {
    console.error('GET effective-context error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi server' },
      { status: 500 }
    );
  }
}
