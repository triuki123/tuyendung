import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { execute } from '@/lib/db';
import { hashExtensionSecret, newPairingCode } from '@/lib/cvExtensionAuth';

export async function POST(request: NextRequest) {
  if (!checkUnitAccess(request, 'hr-cv', 'create')) return NextResponse.json({ error: 'Không có quyền tạo CV' }, { status: 403 });
  const userId = request.headers.get('x-current-user-id');
  if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  const companyId = request.headers.get('x-current-user-company') || null;
  const code = newPairingCode();
  await execute(`DELETE FROM cv_extension_pairing_codes WHERE user_id = $1 AND used_at IS NULL`, [userId]);
  await execute(
    `INSERT INTO cv_extension_pairing_codes(code_hash, user_id, company_id, expires_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '10 minutes')`,
    [hashExtensionSecret(code), userId, companyId]);
  return NextResponse.json({ success: true, data: { code, expiresInSeconds: 600 } });
}
