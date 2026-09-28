import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { notify } from '@/lib/notifications/engine';
import { getTemplate, isTemplateEnabled, isCustomTemplateKey } from '@/lib/services/notificationTemplateService';

export const dynamic = 'force-dynamic';

function isSuperAdmin(request: NextRequest): boolean {
  return (request.headers.get('x-current-user-role') || '') === 'super_admin';
}

/**
 * POST /api/notification-templates/send — gửi THỦ CÔNG 1 mẫu tùy chỉnh (super_admin).
 * Body: { key, recipientIds?: string[], allActive?: boolean }
 *  - allActive:true  → gửi cho mọi user đang hoạt động
 *  - recipientIds    → danh sách user_id cụ thể (gộp với allActive nếu cả hai)
 * Phát qua engine `notify('manual.send', …)` ⇒ tự outbox/retry/gộp Telegram.
 */
export async function POST(request: NextRequest) {
  try {
    if (!isSuperAdmin(request)) {
      return NextResponse.json({ error: 'Chỉ Super Admin được gửi thông báo' }, { status: 403 });
    }
    const body = await request.json();
    const key = String(body.key || '');
    if (!isCustomTemplateKey(key)) {
      return NextResponse.json({ error: 'Chỉ gửi được mẫu tùy chỉnh' }, { status: 400 });
    }
    const tpl = await getTemplate(key);
    if (!tpl) {
      return NextResponse.json({ error: 'Mẫu không tồn tại' }, { status: 404 });
    }
    if (!(await isTemplateEnabled(key))) {
      return NextResponse.json({ error: 'Mẫu đang tắt — hãy bật trước khi gửi' }, { status: 400 });
    }

    // Tập hợp người nhận
    const ids = new Set<string>();
    if (Array.isArray(body.recipientIds)) {
      for (const id of body.recipientIds) if (typeof id === 'string' && id) ids.add(id);
    }
    if (body.allActive === true) {
      const rows = await query<{ id: string }>(`SELECT id::text AS id FROM users WHERE status = 'active'`);
      for (const r of rows) ids.add(r.id);
    }
    const recipients = Array.from(ids);
    if (recipients.length === 0) {
      return NextResponse.json({ error: 'Chưa chọn người nhận' }, { status: 400 });
    }

    const { sent } = await notify('manual.send', { __templateKey: key }, { recipients });
    return NextResponse.json({ success: true, sent, recipients: recipients.length });
  } catch (err) {
    console.error('POST /api/notification-templates/send error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
