import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import {
  linkTelegramToUser,
  unlinkTelegram,
  isTelegramIdLinkedToOther,
  type TelegramProfile,
} from '@/lib/services/telegramAuthService';
import { logActivity } from '@/lib/services/auditService';

/**
 * Quản trị viên gắn/gỡ liên kết đăng nhập Telegram HỘ một tài khoản khác.
 *
 * Khác với /api/auth/telegram/{link,unlink} (self-service, cần session của chính
 * chủ tài khoản): endpoint này dành cho help-desk — super_admin/admin nhập trực
 * tiếp telegram_id của nhân viên (không qua chữ ký Telegram, vì admin không có
 * Telegram của nhân viên). Bù lại: kiểm RBAC theo vai trò THẬT trong DB, chống
 * trùng telegram_id, và GHI AUDIT LOG mọi thao tác.
 *
 * POST   /api/users/[id]/telegram-link  body { telegram_id, telegram_username?, ... }
 * DELETE /api/users/[id]/telegram-link  → gỡ liên kết
 */

/**
 * Xác thực actor là QUẢN TRỊ VIÊN TỐI CAO (super_admin) theo vai trò thật trong DB.
 * Chính sách: CHỈ super_admin được gắn/gỡ telegram_id cho người dùng. Admin thường
 * và người dùng đều bị từ chối.
 */
async function authorizeSuperAdmin(
  request: NextRequest
): Promise<{ ok: true; actorId: string } | { ok: false; status: number; error: string }> {
  const actorId = request.headers.get('x-current-user-id');
  if (!actorId) {
    return { ok: false, status: 401, error: 'Cần đăng nhập' };
  }
  const actor = await queryOne<{ role: string }>(
    `SELECT role FROM users WHERE id::text = $1`,
    [actorId]
  );
  const role = actor?.role ?? 'user';
  if (role !== 'super_admin') {
    return { ok: false, status: 403, error: 'Chỉ Quản trị viên tối cao mới được gắn/gỡ Telegram hộ' };
  }
  return { ok: true, actorId };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetId } = await params;
    if (!targetId) return NextResponse.json({ error: 'Thiếu ID người dùng' }, { status: 400 });

    const auth = await authorizeSuperAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => ({}));
    const rawId = String(body?.telegram_id ?? '').trim();
    // Telegram User ID là số nguyên dương — chặn dữ liệu rác.
    if (!/^\d{4,20}$/.test(rawId)) {
      return NextResponse.json(
        { error: 'Telegram User ID không hợp lệ (chỉ gồm chữ số)' },
        { status: 400 }
      );
    }

    // Tài khoản đích phải tồn tại
    const target = await queryOne<{ id: string; name: string | null; email: string | null }>(
      `SELECT id, name, email FROM users WHERE id::text = $1`,
      [targetId]
    );
    if (!target) return NextResponse.json({ error: 'Không tìm thấy người dùng' }, { status: 404 });

    // Chống trùng: telegram_id đã gắn tài khoản khác chưa
    if (await isTelegramIdLinkedToOther(rawId, targetId)) {
      return NextResponse.json(
        { error: 'Telegram User ID này đã được liên kết với người dùng khác' },
        { status: 409 }
      );
    }

    const profile: TelegramProfile = {
      telegram_id: rawId,
      telegram_username: body?.telegram_username ? String(body.telegram_username) : null,
      telegram_first_name: body?.telegram_first_name ? String(body.telegram_first_name) : null,
      telegram_last_name: body?.telegram_last_name ? String(body.telegram_last_name) : null,
      telegram_photo_url: null,
    };
    await linkTelegramToUser(targetId, profile);

    await logActivity({
      action: 'telegram_link_admin',
      details: `Quản trị viên gắn Telegram ID ${rawId} cho ${target.name || target.email || targetId}`,
      adminId: auth.actorId,
    });

    return NextResponse.json({ success: true, telegram_id: rawId, linked: true }, { status: 200 });
  } catch (error) {
    console.error('POST /api/users/[id]/telegram-link error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gắn Telegram thất bại' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetId } = await params;
    if (!targetId) return NextResponse.json({ error: 'Thiếu ID người dùng' }, { status: 400 });

    const auth = await authorizeSuperAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const target = await queryOne<{ id: string; name: string | null; email: string | null; telegram_id: string | null }>(
      `SELECT id, name, email, telegram_id FROM users WHERE id::text = $1`,
      [targetId]
    );
    if (!target) return NextResponse.json({ error: 'Không tìm thấy người dùng' }, { status: 404 });

    await unlinkTelegram(targetId);

    await logActivity({
      action: 'telegram_unlink_admin',
      details: `Quản trị viên gỡ liên kết Telegram (${target.telegram_id || 'n/a'}) khỏi ${target.name || target.email || targetId}`,
      adminId: auth.actorId,
    });

    return NextResponse.json({ success: true, unlinked: true }, { status: 200 });
  } catch (error) {
    console.error('DELETE /api/users/[id]/telegram-link error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gỡ liên kết Telegram thất bại' },
      { status: 500 }
    );
  }
}
