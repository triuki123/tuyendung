import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { updateUser } from '@/lib/services/usersService';
import { BULK_FIELD_KEYS } from '@/lib/users/bulkFields';

/**
 * POST /api/users/bulk-update — sửa hàng loạt một số trường cho nhiều người.
 * Body: { ids: string[], changes: Record<string, any> }
 *
 * An toàn:
 *  - Chỉ super_admin / admin (đọc role THẬT từ DB qua x-current-user-id do
 *    middleware tiêm từ cookie đã xác thực).
 *  - changes CHỈ chứa key thuộc whitelist BULK_FIELD_KEYS — chặn ghi cột nhạy cảm.
 *  - Cập nhật từng người qua updateUser (đã map cột + updated_by + realtime notify).
 */
export async function POST(request: NextRequest) {
  try {
    const currentUser = request.headers.get('x-current-user-id') || '';
    if (!currentUser) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const actor = await queryOne<{ role: string }>(`SELECT role FROM users WHERE id::text = $1`, [currentUser]);
    const role = actor?.role ?? 'user';
    if (role !== 'super_admin' && role !== 'admin') {
      return NextResponse.json({ error: 'Bạn không có quyền sửa hàng loạt người dùng.' }, { status: 403 });
    }

    let body: any;
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'JSON không hợp lệ' }, { status: 400 }); }

    const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: any) => typeof x === 'string' && x) : [];
    const changes: Record<string, any> = (body?.changes && typeof body.changes === 'object') ? body.changes : {};

    if (ids.length === 0) return NextResponse.json({ error: 'Chưa chọn người nào' }, { status: 400 });

    // Whitelist: loại bỏ mọi key không được phép sửa hàng loạt.
    const safe: Record<string, any> = {};
    for (const k of Object.keys(changes)) if (BULK_FIELD_KEYS.has(k)) safe[k] = changes[k];
    if (Object.keys(safe).length === 0) {
      return NextResponse.json({ error: 'Không có trường hợp lệ để cập nhật' }, { status: 400 });
    }

    let updated = 0;
    const failed: string[] = [];
    for (const id of ids) {
      try {
        const ok = await updateUser(id, { ...safe }, currentUser);
        if (ok) updated++; else failed.push(id);
      } catch (e) {
        console.error('bulk-update error for', id, e);
        failed.push(id);
      }
    }

    return NextResponse.json({ success: true, updated, failed, fields: Object.keys(safe) });
  } catch (err) {
    console.error('POST /api/users/bulk-update error:', err);
    return NextResponse.json({ error: 'Lỗi server khi sửa hàng loạt' }, { status: 500 });
  }
}
