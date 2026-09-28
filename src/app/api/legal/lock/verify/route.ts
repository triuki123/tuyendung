import { NextRequest, NextResponse } from 'next/server';
import { requireLegal } from '@/lib/legal/legalGuard';
import {
  verifyLockPassword, issueLegalUnlockToken, type LegalLockEntity,
} from '@/lib/legal/legalLockService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/legal/lock/verify — nhập mật khẩu mở khóa 1 lần.
 * Body { entityType, entityId, password } → vé HMAC 60s gắn (người xem, bản ghi).
 * Yêu cầu CÓ RBAC legal trước khi được thử mật khẩu (người ngoài module không được dò).
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireLegal(request, 'view');
    if ('response' in guard) return guard.response;

    const body = await request.json().catch(() => ({}));
    const entityType = body.entityType as LegalLockEntity;
    if (!['document', 'contract'].includes(entityType) || !body.entityId) {
      return NextResponse.json({ error: 'Thiếu entityType/entityId' }, { status: 400 });
    }

    const ok = await verifyLockPassword(entityType, body.entityId, String(body.password || ''));
    if (!ok) return NextResponse.json({ error: 'Mật khẩu không đúng' }, { status: 401 });

    const token = issueLegalUnlockToken(guard.actor.id, entityType, body.entityId);
    return NextResponse.json({ success: true, token });
  } catch (err) {
    console.error('POST /api/legal/lock/verify error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
