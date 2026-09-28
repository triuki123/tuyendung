/**
 * GET /api/tasks/report/scope-options
 * Trả danh sách đối tượng hợp lệ (cá nhân/bộ phận/phòng ban/công ty/toàn HT)
 * mà người dùng hiện tại được phép chọn xuất báo cáo, theo RBAC tối thượng.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getUserById } from '@/lib/services/usersService';
import { getScopeOptions, Role } from '@/lib/services/taskReportScopeService';

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    }
    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json({ error: 'Người dùng không tồn tại' }, { status: 404 });
    }
    const role = (user.role || 'user') as Role;
    const result = await getScopeOptions(
      userId,
      role,
      user.company_id || null,
      user.name || user.email || 'User'
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error('GET /api/tasks/report/scope-options error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi server' },
      { status: 500 }
    );
  }
}
