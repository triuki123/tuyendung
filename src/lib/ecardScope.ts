import { NextRequest } from 'next/server';
import { getVisibleCompanyIds, resolveDefaultCompanyId } from '@/lib/services/userCompanyService';

/**
 * Công ty được phép biên soạn Hồ Sơ Năng Lực - Doanh Nghiệp.
 *  - vai hiệu lực super_admin → null = mọi công ty.
 *  - còn lại → CHỈ công ty đang chọn trên switcher (vào công ty phụ = thoát vai công ty
 *    chính, không đụng được hồ sơ công ty khác).
 *
 * Để ở lib riêng vì file route của Next.js chỉ được export handler (GET/POST/…).
 */
export async function ecardCompanyScope(request: NextRequest): Promise<string[] | null> {
  const allowed = await getVisibleCompanyIds(request.headers.get('x-current-user-id'));
  if (allowed === null) return null;
  const active = resolveDefaultCompanyId(allowed, request.headers.get('x-current-user-company'));
  return active ? [active] : [];
}
