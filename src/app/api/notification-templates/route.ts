import { NextRequest, NextResponse } from 'next/server';
import {
  listTemplates, saveTemplate, resetTemplate, isKnownTemplateKey,
  setTemplateEnabled, createCustomTemplate, updateCustomTemplate, deleteCustomTemplate,
  isCustomTemplateKey,
} from '@/lib/services/notificationTemplateService';

export const dynamic = 'force-dynamic';

function isSuperAdmin(request: NextRequest): boolean {
  return (request.headers.get('x-current-user-role') || '') === 'super_admin';
}

/** GET /api/notification-templates — danh sách mẫu đã resolve (super_admin). */
export async function GET(request: NextRequest) {
  try {
    if (!isSuperAdmin(request)) {
      return NextResponse.json({ error: 'Chỉ Super Admin được xem mẫu thông báo' }, { status: 403 });
    }
    const data = await listTemplates();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/notification-templates error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * PUT /api/notification-templates — lưu/khôi phục/bật-tắt mẫu (super_admin).
 * Body: { templates: [{ key, title?, message?, icon?, telegram?, reset?, enabled? }] }
 *  - reset:true        → khôi phục mẫu hệ thống về DEFAULT
 *  - enabled:bool       → chỉ bật/tắt (không đổi nội dung)
 *  - title+message+...  → lưu nội dung (hệ thống: ghi đè; custom: cập nhật)
 */
export async function PUT(request: NextRequest) {
  try {
    if (!isSuperAdmin(request)) {
      return NextResponse.json({ error: 'Chỉ Super Admin được sửa mẫu thông báo' }, { status: 403 });
    }
    const actor = request.headers.get('x-current-user-id');
    const body = await request.json();
    if (!Array.isArray(body.templates)) {
      return NextResponse.json({ error: 'Thiếu danh sách templates' }, { status: 400 });
    }

    for (const t of body.templates) {
      const key = String(t.key || '');
      const custom = isCustomTemplateKey(key);
      if (!isKnownTemplateKey(key) && !custom) {
        return NextResponse.json({ error: `Mẫu không hợp lệ: ${key}` }, { status: 400 });
      }

      // Chỉ bật/tắt
      if (typeof t.enabled === 'boolean' && t.title === undefined && t.reset !== true) {
        await setTemplateEnabled(key, t.enabled, actor);
        continue;
      }
      // Khôi phục mặc định (chỉ mẫu hệ thống)
      if (t.reset === true) {
        if (custom) {
          return NextResponse.json({ error: 'Mẫu tùy chỉnh không có mặc định để khôi phục' }, { status: 400 });
        }
        await resetTemplate(key);
        continue;
      }

      // Lưu nội dung
      const title = typeof t.title === 'string' ? t.title.trim() : '';
      const message = typeof t.message === 'string' ? t.message.trim() : '';
      const icon = typeof t.icon === 'string' && t.icon.trim() ? t.icon.trim() : 'bell';
      const telegram = typeof t.telegram === 'string' ? t.telegram.trim() : '';
      if (!title || !message) {
        return NextResponse.json({ error: `Tiêu đề và nội dung không được để trống (${key})` }, { status: 400 });
      }
      if (title.length > 300 || message.length > 1000 || telegram.length > 2000) {
        return NextResponse.json({ error: `Nội dung quá dài (${key})` }, { status: 400 });
      }
      if (custom) {
        const label = typeof t.label === 'string' && t.label.trim() ? t.label.trim() : title.slice(0, 80);
        await updateCustomTemplate(key, { label, title, message, icon, telegram }, actor);
      } else {
        await saveTemplate(key, { title, message, icon, telegram }, actor);
      }
    }

    const data = await listTemplates();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('PUT /api/notification-templates error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * POST /api/notification-templates — tạo mẫu TÙY CHỈNH (super_admin).
 * Body: { label, title, message, telegram?, icon? }
 */
export async function POST(request: NextRequest) {
  try {
    if (!isSuperAdmin(request)) {
      return NextResponse.json({ error: 'Chỉ Super Admin được tạo mẫu thông báo' }, { status: 403 });
    }
    const actor = request.headers.get('x-current-user-id');
    const body = await request.json();
    const label = typeof body.label === 'string' ? body.label.trim() : '';
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const telegram = typeof body.telegram === 'string' ? body.telegram.trim() : '';
    const icon = typeof body.icon === 'string' && body.icon.trim() ? body.icon.trim() : 'bell';
    if (!label || !title || !message) {
      return NextResponse.json({ error: 'Tên mẫu, tiêu đề và nội dung không được để trống' }, { status: 400 });
    }
    if (label.length > 120 || title.length > 300 || message.length > 1000 || telegram.length > 2000) {
      return NextResponse.json({ error: 'Nội dung quá dài' }, { status: 400 });
    }
    const key = await createCustomTemplate({ label, title, message, telegram, icon }, actor);
    const data = await listTemplates();
    return NextResponse.json({ success: true, key, data });
  } catch (err) {
    console.error('POST /api/notification-templates error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE /api/notification-templates?key=custom:xxx — xoá mẫu tùy chỉnh (super_admin). */
export async function DELETE(request: NextRequest) {
  try {
    if (!isSuperAdmin(request)) {
      return NextResponse.json({ error: 'Chỉ Super Admin được xoá mẫu thông báo' }, { status: 403 });
    }
    const key = request.nextUrl.searchParams.get('key') || '';
    if (!isCustomTemplateKey(key)) {
      return NextResponse.json({ error: 'Chỉ xoá được mẫu tùy chỉnh' }, { status: 400 });
    }
    await deleteCustomTemplate(key);
    const data = await listTemplates();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('DELETE /api/notification-templates error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
