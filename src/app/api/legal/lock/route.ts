import { NextRequest, NextResponse } from 'next/server';

import {
  getLockStatus, setLock, removeLock, type LegalLockEntity,
  canManageLegalLock,
} from '@/lib/legal/legalLockService';
import { logLegalRecord } from '@/lib/services/legalAuditService';
import { requireLegal } from '@/lib/legal/legalGuard';

export const dynamic = 'force-dynamic';

const ENTITIES: LegalLockEntity[] = ['document', 'contract'];

function parseEntity(v: string | null): LegalLockEntity | null {
  return ENTITIES.includes(v as LegalLockEntity) ? (v as LegalLockEntity) : null;
}

/** GET: trạng thái khóa (?entityType=&entityId=) — ai có quyền legal đều xem được cờ. */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireLegal(request, 'view');
    if ('response' in guard) return guard.response;
    const sp = request.nextUrl.searchParams;
    const entityType = parseEntity(sp.get('entityType'));
    const entityId = sp.get('entityId');
    if (!entityType || !entityId) return NextResponse.json({ error: 'Thiếu entityType/entityId' }, { status: 400 });
    const status = await getLockStatus(entityType, entityId);
    return NextResponse.json({ success: true, data: status });
  } catch (err) {
    console.error('GET /api/legal/lock error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST: đặt/đổi mật khẩu khóa — quyền legal.lock HOẶC quản trị BMHS (chìa khóa tổng). */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!(await canManageLegalLock(userId))) {
      return NextResponse.json({ error: 'Cần quyền "Đặt khóa" của Pháp Chế (hoặc quản trị BMHS)' }, { status: 403 });
    }

    const body = await request.json();
    const entityType = parseEntity(body.entityType);
    if (!entityType || !body.entityId) return NextResponse.json({ error: 'Thiếu entityType/entityId' }, { status: 400 });
    const password = String(body.password || '');
    const confirm = String(body.confirm || '');
    if (password.length < 6) return NextResponse.json({ error: 'Mật khẩu tối thiểu 6 ký tự' }, { status: 400 });
    if (password !== confirm) return NextResponse.json({ error: 'Xác nhận mật khẩu không khớp' }, { status: 400 });

    await setLock(entityType, body.entityId, password, userId);
    await logLegalRecord({
      entityType, entityId: body.entityId, action: 'lock',
      details: 'Đặt khóa BMHS — xem/tải file & sửa/xóa cần nhập mật khẩu',
      performedBy: userId,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/legal/lock error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE: gỡ khóa (?entityType=&entityId=) — quyền legal.lock HOẶC quản trị BMHS. */
export async function DELETE(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!(await canManageLegalLock(userId))) {
      return NextResponse.json({ error: 'Cần quyền "Đặt khóa" của Pháp Chế (hoặc quản trị BMHS)' }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const entityType = parseEntity(sp.get('entityType'));
    const entityId = sp.get('entityId');
    if (!entityType || !entityId) return NextResponse.json({ error: 'Thiếu entityType/entityId' }, { status: 400 });

    const removed = await removeLock(entityType, entityId);
    if (!removed) return NextResponse.json({ error: 'Bản ghi này không có khóa' }, { status: 404 });

    await logLegalRecord({
      entityType, entityId, action: 'unlock',
      details: 'Gỡ khóa BMHS', performedBy: userId,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/legal/lock error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
