import { NextRequest, NextResponse } from 'next/server';
import { getCompanyVariantById, updateCompanyVariant, deleteCompanyVariant } from '@/lib/services/companyEcardService';
import { checkUnitAccess } from '@/lib/api-permissions';
import type { PermissionAction } from '@/lib/modules';
import { ecardCompanyScope } from '@/lib/ecardScope';

export const dynamic = 'force-dynamic';

/**
 * Chốt chung: quyền HIỆU LỰC trên module + biến thể phải thuộc công ty TRONG PHẠM VI
 * (vai hiệu lực super_admin → mọi công ty; còn lại → đúng công ty đang chọn).
 *
 * Trước đây chỉ kiểm tra quyền thô từ header rồi cho sửa/xoá biến thể của BẤT KỲ công ty
 * nào theo id — Admin công ty con đoán được id là ghi đè hồ sơ công ty khác.
 */
async function guard(
  request: NextRequest,
  variantId: string,
  action: PermissionAction
): Promise<{ error: NextResponse } | { companyId: string }> {
  if (!request.headers.get('x-current-user-id')) {
    return { error: NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 }) };
  }
  if (!checkUnitAccess(request, 'ho-so-nang-luc', action)) {
    return { error: NextResponse.json({ error: 'Không có quyền' }, { status: 403 }) };
  }
  const variant = await getCompanyVariantById(variantId);
  if (!variant) {
    return { error: NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 }) };
  }
  const companyId = String((variant as { company_id: string }).company_id);
  const scope = await ecardCompanyScope(request);
  if (scope !== null && !scope.includes(companyId)) {
    return { error: NextResponse.json({ error: 'Không có quyền với công ty này' }, { status: 403 }) };
  }
  return { companyId };
}

/** GET — 1 biến thể hồ sơ công ty (để biên soạn). */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guard(request, params.id, 'view');
    if ('error' in g) return g.error;
    const data = await getCompanyVariantById(params.id);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET company-ecard variant error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** PUT — cập nhật biến thể. */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guard(request, params.id, 'edit');
    if ('error' in g) return g.error;
    const body = await request.json();
    const data = await updateCompanyVariant(params.id, body);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('PUT company-ecard variant error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE — xóa biến thể. */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guard(request, params.id, 'delete');
    if ('error' in g) return g.error;
    await deleteCompanyVariant(params.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE company-ecard variant error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
