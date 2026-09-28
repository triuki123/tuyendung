import { NextRequest, NextResponse } from 'next/server';
import * as announcementsService from '@/lib/services/announcementsService';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const data = await announcementsService.getAnnouncementById(params.id);
    if (!data) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/announcements/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

function canPost(role: string | null, permissions: string | null): boolean {
  if (role === 'super_admin' || role === 'admin') return true;
  try {
    const perms = JSON.parse(permissions ?? '{}');
    return Array.isArray(perms?.announcements) && perms.announcements.includes('create');
  } catch { return false; }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const role = request.headers.get('x-current-user-role');
    const permissions = request.headers.get('x-user-permissions');
    if (!canPost(role, permissions)) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const userId = request.headers.get('x-current-user-id') ?? '';
    const body = await request.json();

    // Publish action
    if (body.action === 'publish') {
      const published = await announcementsService.publishAnnouncement(params.id, userId);
      if (!published) {
        return NextResponse.json({ error: 'Không tìm thấy hoặc đã publish rồi' }, { status: 404 });
      }
      notifyAnnouncement(published.title, published.content, params.id, userId).catch(console.error);
      return NextResponse.json({ success: true, data: published });
    }

    // Pin / Unpin
    if (body.action === 'pin' || body.action === 'unpin') {
      const data = await announcementsService.togglePinAnnouncement(params.id, body.action === 'pin');
      return NextResponse.json({ success: true, data });
    }

    // Edit content
    if (body.action === 'edit') {
      const data = await announcementsService.updateAnnouncement(params.id, { content: body.content, title: body.title });
      if (!data) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
      return NextResponse.json({ success: true, data });
    }

    const data = await announcementsService.updateAnnouncement(params.id, body);
    if (!data) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('PUT /api/announcements/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const role = request.headers.get('x-current-user-role');
    const permissions = request.headers.get('x-user-permissions');
    const canDel = role === 'super_admin' || role === 'admin' || (() => {
      try { const p = JSON.parse(permissions ?? '{}'); return Array.isArray(p?.announcements) && p.announcements.includes('delete'); } catch { return false; }
    })();
    if (!canDel) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const ok = await announcementsService.deleteAnnouncement(params.id);
    if (!ok) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/announcements/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * Thông báo khi phát hành Thông Báo - Truyền Thông:
 * - In-app (chuông): tạo notification cho TOÀN BỘ nhân viên (trừ người đăng).
 * - Telegram: gửi channel chung + nhân viên ĐÃ BẬT nhận thông báo (telegram_enabled).
 */
async function notifyAnnouncement(title: string, content: string, id: string, publisherId: string) {
  const { query } = await import('@/lib/db');
  const { notify } = await import('@/lib/notifications/engine');
  const excludeId = publisherId || '00000000-0000-0000-0000-000000000000';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://assetflow.fadoai.com';
  const contentExcerpt = content.replace(/<[^>]*>/g, '').slice(0, 300);

  // 1) Thông báo IN-APP (chuông) cho mọi nhân viên active. Telegram gửi RIÊNG kèm poster ở
  //    bước 2 → skipTelegram để không gửi trùng tin text.
  try {
    const recipients = await query<{ id: string }>(
      `SELECT id::text AS id FROM users WHERE status = 'active' AND id::text <> $1`,
      [excludeId]
    );
    await notify('announcement.published', { title, contentExcerpt },
      { recipients: recipients.map(u => u.id), relatedId: id, skipTelegram: true });
  } catch (e) {
    console.error('announcement notify error:', e);
  }

  // 2) Telegram DM tới TỪNG người đã liên kết (giống broadcast Solace) — kèm POSTER nếu bài có ảnh.
  try {
    const { renderNotification } = await import('@/lib/services/notificationTemplateService');
    const { sendTelegramMessageToChat, sendTelegramPhotoToChat } = await import('@/lib/services/telegramService');
    const rendered = await renderNotification('announcement_broadcast', { title, contentExcerpt });
    const body = rendered?.telegram ?? `📢 *Thông Báo Mới*\n\n*${title}*\n\n${contentExcerpt}...`;
    const text = `${body}\n\n🔗 [Xem chi tiết](${appUrl}/tra-cuu/thong-bao)`;
    const caption = `${body}\n\n🔗 ${appUrl}/tra-cuu/thong-bao`.slice(0, 1024);
    const img = await announcementsService.getFirstImageContent(id).catch(() => null);

    const tgUsers = await query<{ chat: string | null }>(
      `SELECT telegram_chat_id::text AS chat FROM users
        WHERE status = 'active' AND id::text <> $1
          AND telegram_chat_id IS NOT NULL AND telegram_enabled IS NOT FALSE`,
      [excludeId]
    );
    let sent = 0;
    for (const u of tgUsers) {
      if (!u.chat) continue;
      try {
        if (img?.content) {
          await sendTelegramPhotoToChat(u.chat, img.content, caption, img.file_name || 'poster.jpg', img.mime_type || 'image/jpeg');
        } else {
          await sendTelegramMessageToChat(u.chat, text);
        }
        sent++;
      } catch (err) {
        console.error('[announcement] telegram DM error:', (err as Error).message);
      }
    }
    console.log(`[announcement] broadcast Telegram tới ${sent}/${tgUsers.length} người${img ? ' (kèm poster)' : ''}`);
    await announcementsService.markTelegramSent(id);
  } catch (e) {
    console.error('announcement telegram broadcast error:', e);
  }
}
