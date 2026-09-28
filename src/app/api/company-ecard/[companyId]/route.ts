import { NextRequest, NextResponse } from 'next/server';
import { listCompanyVariants, createCompanyVariant } from '@/lib/services/companyEcardService';
import { checkUnitAccess } from '@/lib/api-permissions';
import { ecardCompanyScope } from '@/lib/ecardScope';

export const dynamic = 'force-dynamic';

/**
 * Chặn thao tác XUYÊN CÔNG TY: chỉ đụng được hồ sơ của công ty trong phạm vi
 * (vai hiệu lực super_admin → mọi công ty; còn lại → đúng công ty đang chọn).
 * Trước đây route chỉ hỏi "có quyền hồ sơ năng lực không" rồi cho sửa hồ sơ của
 * BẤT KỲ công ty nào theo id trên URL.
 */
async function outOfScope(request: NextRequest, companyId: string): Promise<boolean> {
  const scope = await ecardCompanyScope(request);
  return scope !== null && !scope.includes(companyId);
}

/** GET /api/company-ecard/[companyId] — biến thể hồ sơ của công ty (chỉ người biên tập). */
export async function GET(request: NextRequest, { params }: { params: { companyId: string } }) {
  try {
    const callerId = request.headers.get('x-current-user-id');
    if (!callerId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!checkUnitAccess(request, 'ho-so-nang-luc', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    if (await outOfScope(request, params.companyId)) {
      return NextResponse.json({ error: 'Không có quyền với công ty này' }, { status: 403 });
    }
    const data = await listCompanyVariants(params.companyId);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/company-ecard/[companyId] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST /api/company-ecard/[companyId] — tạo biến thể mới cho công ty (chỉ người biên tập). */
export async function POST(request: NextRequest, { params }: { params: { companyId: string } }) {
  try {
    const callerId = request.headers.get('x-current-user-id');
    if (!callerId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!checkUnitAccess(request, 'ho-so-nang-luc', 'create')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    if (await outOfScope(request, params.companyId)) {
      return NextResponse.json({ error: 'Không có quyền với công ty này' }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const data = await createCompanyVariant({ companyId: params.companyId, slug: body.slug, title: body.title });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error('POST /api/company-ecard/[companyId] error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Lỗi server' }, { status: 500 });
  }
}
