import { updateUser, deactivateUser } from '@/lib/services/usersService';
import { NextRequest, NextResponse } from 'next/server';
import { buildNotifyPayload } from '@/lib/notify-db';
import { pool, query, queryOne } from '@/lib/db';
import { getCompanyMemberUserIds, getEffectiveContext, getSecondaryMemberships, setMemberships } from '@/lib/services/userCompanyService';
import { requireRole } from '@/lib/apiAuth';
import { checkUnitAccess } from '@/lib/api-permissions';
import { getOrgSubtreeUserIds } from '@/lib/services/attendanceService';

const USER_SENSITIVE_FIELDS = [
  'password',
  'password_hash',
  'reset_token',
  'reset_password_token',
  'reset_password_expires',
  'password_reset_token',
  'password_reset_expires',
  'forgot_password_token',
  'forgot_password_expires',
];

function sanitizeUserResponse<T extends Record<string, any>>(user: T | null): T | null {
  if (!user) return user;
  const safe = { ...user };
  for (const field of USER_SENSITIVE_FIELDS) {
    delete safe[field];
  }
  return safe;
}

async function canAccessUserRecord(
  request: NextRequest,
  targetId: string,
  action: 'view' | 'edit' | 'delete'
): Promise<boolean> {
  const currentUserId = request.headers.get('x-current-user-id');
  const currentUserCompany = request.headers.get('x-current-user-company');
  if (!currentUserId) return false;
  // Ai cũng được XEM và TỰ SỬA hồ sơ của chính mình (PUT giới hạn trường cho non-admin).
  if ((action === 'view' || action === 'edit') && currentUserId === targetId) return true;

  if (!checkUnitAccess(request, 'users', action)) return false;
  const ctx = await getEffectiveContext(currentUserId, currentUserCompany || null);
  if (!ctx) return false;
  if (ctx.role === 'super_admin') return true;
  if (ctx.role === 'admin') {
    if (!ctx.company_id) return false;
    const memberIds = await getCompanyMemberUserIds(ctx.company_id);
    return memberIds.includes(targetId);
  }
  if (ctx.role === 'manager') {
    const subtreeIds = await getOrgSubtreeUserIds(currentUserId, ctx.company_id);
    return [currentUserId, ...subtreeIds].includes(targetId);
  }
  return false;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'User ID required' }, { status: 400 });

    const currentUserId = request.headers.get('x-current-user-id');
    const currentUserCompany = request.headers.get('x-current-user-company');
    if (!currentUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await canAccessUserRecord(request, id, 'view'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const user = await queryOne<any>(
      `SELECT u.*, m.name as manager_name,
              cb.name as created_by_name, ub.name as updated_by_name
       FROM users u
       LEFT JOIN users m ON u.manager_id = m.id
       LEFT JOIN users cb ON cb.id::text = u.created_by::text
       LEFT JOIN users ub ON ub.id::text = u.updated_by::text
       WHERE u.id = $1`,
      [id]
    );

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Kèm danh sách công ty PHỤ (Đa Công Ty) để form hiển thị tab Đa Công Ty.
    const company_memberships = await getSecondaryMemberships(id);
    return NextResponse.json({ ...sanitizeUserResponse(user), company_memberships });
  } catch (error) {
    console.error('User fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch user' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    console.log('PUT /api/users/[id] - ID:', id);

    if (!id) return NextResponse.json({ error: 'User ID required' }, { status: 400 });

    let body: any;
    try {
      body = await request.json();
    } catch (jsonError) {
      console.error('JSON parsing error:', jsonError);
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }

    // Lấy id người đang sửa từ header (client gửi qua getUserAuthHeaders) để ghi
    // updated_by đúng người. Fallback 'system' nếu không có (updateUser bỏ qua
    // giá trị không phải UUID nên updated_by sẽ không bị set bậy).
    if (!(await canAccessUserRecord(request, id, 'edit'))) {
      return NextResponse.json(
        { error: 'Bạn không có quyền chỉnh sửa người dùng này' },
        { status: 403 }
      );
    }

    const currentUser = request.headers.get('x-current-user-id') || 'system';

    // 🔐 Chốt quyền sửa user theo VAI TRÒ thật trong DB (không tin role từ client):
    //  - super_admin: sửa tất cả
    //  - admin: sửa tất cả TRỪ role + module_permissions (Phân Quyền)
    //  - quản lý / người dùng: chỉ được TỰ SỬA hồ sơ cơ bản của chính mình
    const isSelfEdit = currentUser !== 'system' && currentUser === id;
    if (currentUser && currentUser !== 'system') {
      const actor = await queryOne<{ role: string }>(
        `SELECT role FROM users WHERE id::text = $1`,
        [currentUser]
      );
      const actorRole = actor?.role ?? 'user';
      if (actorRole !== 'super_admin' && actorRole !== 'admin') {
        if (!isSelfEdit) {
          return NextResponse.json(
            { error: 'Bạn không có quyền chỉnh sửa người dùng này.' },
            { status: 403 }
          );
        }
        // Tự sửa hồ sơ: chỉ cho phép các trường cơ bản, KHÔNG đụng vai trò/quyền/trạng thái/tổ chức.
        const SELF_EDITABLE_FIELDS = ['name', 'phone', 'bio', 'avatar', 'dashboard_layout'];
        body = Object.fromEntries(
          Object.entries(body).filter(([k]) => SELF_EDITABLE_FIELDS.includes(k))
        );
      }
      if (actorRole === 'admin') {
        // Admin không được đổi Phân Quyền (vai trò + quyền module) lẫn Đa Công Ty
        // (cấp quyền chéo công ty là đặc quyền của super_admin).
        delete body.role;
        delete body.module_permissions;
        delete body.company_memberships;
        delete body.diligence_enabled; // Theo Dõi Chuyên Cần nhạy cảm — chỉ super_admin bật/tắt
      }
    }

    // Tách company_memberships ra khỏi payload user (lưu riêng vào bảng memberships).
    const incomingMemberships = Array.isArray(body.company_memberships)
      ? body.company_memberships
      : null;
    delete body.company_memberships;

    const updated = await updateUser(id, body, currentUser);

    if (!updated) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Đồng bộ công ty phụ nếu form gửi kèm.
    if (incomingMemberships) {
      await setMemberships(id, incomingMemberships).catch((err) =>
        console.error('setMemberships error:', err)
      );
    }

   // Send real-time notification for user update
try {
  const client = await pool.connect();
  try {
    const payload = buildNotifyPayload(
      'update',
      'users',
      id,
      {
        name: updated.name,
        email: updated.email,
        role: updated.role,
        module_permissions: updated.module_permissions,
        status: updated.status,
      },
      currentUser
    );
    console.log('[Notify] Sending user update:', { userId: id, hasPermissions: !!payload.data?.module_permissions });
    await client.query('SELECT pg_notify($1, $2)', ['entity_changed', JSON.stringify(payload)]);
    console.log('[Notify] User update notification sent successfully');
  } finally {
    client.release();
  }
} catch (notifyError) {
  console.error('[Notify] Error sending user update notification:', notifyError);
}

    // Fetch user with manager name to return complete data for UI
    const userWithManager = await queryOne<any>(
      `SELECT u.*, m.name as manager_name,
              cb.name as created_by_name, ub.name as updated_by_name
       FROM users u
       LEFT JOIN users m ON u.manager_id = m.id
       LEFT JOIN users cb ON cb.id::text = u.created_by::text
       LEFT JOIN users ub ON ub.id::text = u.updated_by::text
       WHERE u.id = $1`,
      [id]
    );

    const company_memberships = await getSecondaryMemberships(id);
    return NextResponse.json({
      ...sanitizeUserResponse((userWithManager || updated) as Record<string, any>),
      company_memberships,
    });
  } catch (error: any) {
    console.error('User update error:', error);
    if (error?.code === 'EMAIL_DUPLICATE' || error?.constraint === 'users_email_key') {
      return NextResponse.json(
        { error: error.message || 'Email này đã được sử dụng' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi khi cập nhật người dùng' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'User ID required' }, { status: 400 });

    if (!(await canAccessUserRecord(request, id, 'delete'))) {
      return NextResponse.json({ error: 'Bạn không có quyền vô hiệu hóa người dùng này' }, { status: 403 });
    }

    const auth = await requireRole(request, ['super_admin', 'admin']);
    if ('response' in auth) return auth.response;

    const target = await queryOne<{ role: string }>(
      `SELECT role FROM users WHERE id::text = $1`,
      [id]
    );
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (target.role === 'super_admin' && auth.actor.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Chỉ Super Admin mới được vô hiệu hóa tài khoản Super Admin' },
        { status: 403 }
      );
    }
    if (id === auth.actor.id) {
      return NextResponse.json(
        { error: 'Không thể tự vô hiệu hóa tài khoản đang đăng nhập' },
        { status: 400 }
      );
    }

    const user = await deactivateUser(id, auth.actor.id);

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error('User delete error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete user' },
      { status: 500 }
    );
  }
}
