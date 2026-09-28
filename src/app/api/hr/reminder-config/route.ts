import { NextRequest, NextResponse } from 'next/server';
import { getReminderDepartmentIds, setReminderDepartmentIds } from '@/lib/services/hrSettingsService';
import { canManageContracts } from '@/lib/services/contractPermissionService';

export const dynamic = 'force-dynamic';

/** GET — danh sách department_id nhận nhắc gia hạn. */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!(await canManageContracts(userId, 'view'))) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const ids = await getReminderDepartmentIds();
    return NextResponse.json({ success: true, data: ids });
  } catch (err) {
    console.error('GET /api/hr/reminder-config error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** PUT — cập nhật danh sách phòng ban C&B nhận nhắc. Body: { department_ids: string[] } */
export async function PUT(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!(await canManageContracts(userId, 'edit'))) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const body = await request.json();
    const ids = Array.isArray(body.department_ids) ? body.department_ids : [];
    await setReminderDepartmentIds(ids);
    return NextResponse.json({ success: true, data: ids });
  } catch (err) {
    console.error('PUT /api/hr/reminder-config error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
