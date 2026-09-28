import { NextRequest, NextResponse } from 'next/server';
import { listVariantsForUser, createVariant } from '@/lib/services/ecardService';
import { listPublicCompanyVariantsForUser } from '@/lib/services/companyEcardService';

export const dynamic = 'force-dynamic';

function hasProfilePerm(request: NextRequest): boolean {
  const role = request.headers.get('x-current-user-role');
  if (role === 'super_admin') return true;
  try {
    const raw = request.headers.get('x-user-permissions');
    if (!raw) return false;
    const perms = JSON.parse(raw);
    const p = perms?.['ho-so-nang-luc'];
    return Array.isArray(p) && p.length > 0;
  } catch {
    return false;
  }
}

/**
 * GET /api/ecard/[userId] — liệt kê các biến thể hồ sơ năng lực của user.
 * Cho chính chủ (đọc slug để hiện QR), admin, super_admin, hoặc người có quyền biên soạn.
 */
export async function GET(request: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const callerId = request.headers.get('x-current-user-id');
    const role = request.headers.get('x-current-user-role');
    if (!callerId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const allowed = callerId === params.userId || role === 'super_admin' || role === 'admin' || hasProfilePerm(request);
    if (!allowed) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    // Biến thể cá nhân của user + hồ sơ năng lực DOANH NGHIỆP (public) của công ty user thuộc về.
    // Ghép để thẻ nhân viên có thể trỏ QR sang landing công ty (VD "HSNL - ProShip Logistics").
    const [variants, companyVariants] = await Promise.all([
      listVariantsForUser(params.userId),
      listPublicCompanyVariantsForUser(params.userId),
    ]);
    return NextResponse.json({ success: true, data: [...variants, ...companyVariants] });
  } catch (err) {
    console.error('GET /api/ecard/[userId] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * POST /api/ecard/[userId] — tạo biến thể mới (personal | company).
 * CHỈ super_admin (module ho-so-nang-luc mặc định gate ở đây).
 * Body: { scope: 'personal' | 'company', company_id?: string, slug: string, title?: string }
 */
export async function POST(request: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const callerId = request.headers.get('x-current-user-id');
    const role = request.headers.get('x-current-user-role');
    if (!callerId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (role !== 'super_admin') return NextResponse.json({ error: 'Chỉ Super Admin mới được tạo biến thể' }, { status: 403 });
    const body = await request.json();
    const scope = body?.scope === 'company' ? 'company' : 'personal';
    const variant = await createVariant({
      user_id: params.userId,
      scope,
      company_id: body?.company_id || null,
      slug: (body?.slug || '').trim(),
      title: body?.title || null,
    });
    return NextResponse.json({ success: true, data: variant });
  } catch (err: any) {
    console.error('POST /api/ecard/[userId] error:', err);
    return NextResponse.json({ error: err?.message || 'Lỗi tạo biến thể' }, { status: 400 });
  }
}
