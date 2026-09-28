import { NextRequest, NextResponse } from 'next/server';
import { getActorWithPerms, type ActorWithPerms } from '@/lib/apiAuth';
import { canAccess } from '@/lib/permissions';
import type { PermissionAction } from '@/lib/modules';
import { checkLegalLockGate, type LegalLockEntity } from '@/lib/legal/legalLockService';

/**
 * Guard cho API module Pháp Chế — RBAC NGHIÊM NGẶT như warehouse:
 * KHÔNG bypass super_admin (không tick quyền là chặn).
 *
 * KHÁC warehouse: KHÔNG kiểm phạm vi công ty — mô hình TẬP TRUNG MỘT ĐẦU MỐI
 * (user đã chốt): ai có quyền 'legal' thấy/quản lý dữ liệu pháp chế của MỌI công ty.
 */
export async function requireLegal(
  req: NextRequest,
  action: PermissionAction = 'view'
): Promise<{ actor: ActorWithPerms } | { response: NextResponse }> {
  const actor = await getActorWithPerms(req);
  if (!actor) {
    return { response: NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 }) };
  }
  if (!canAccess(actor.perms, 'legal', action)) {
    return { response: NextResponse.json({ error: 'Bạn chưa được cấp quyền Pháp Chế' }, { status: 403 }) };
  }
  return { actor };
}

/**
 * Cổng khóa BMHS cho 1 bản ghi — gọi SAU requireLegal, TRƯỚC khi trả nội dung/ghi
 * thay đổi. Trả NextResponse 403 { requireLegalLock, entityType, entityId } khi bị
 * khóa mà chưa có vé (LegalLockProvider phía client bắt shape này để bật modal
 * nhập mật khẩu rồi retry với header x-bmhs-token); trả null khi được phép.
 */
export async function requireLegalUnlocked(
  req: NextRequest,
  viewerId: string,
  entityType: LegalLockEntity,
  entityId: string
): Promise<NextResponse | null> {
  const gate = await checkLegalLockGate(viewerId, entityType, entityId, req.headers.get('x-bmhs-token'));
  if (gate.allowed) return null;
  return NextResponse.json(
    { error: 'Hồ sơ được bảo vệ BMHS — nhập mật khẩu để tiếp tục', requireLegalLock: true, entityType, entityId },
    { status: 403 }
  );
}
