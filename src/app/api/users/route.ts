import { getUsers, getVisibleUsers, createUser, getUserById } from '@/lib/services/usersService';
import { NextRequest, NextResponse } from 'next/server';
import { canAccess } from '@/lib/permissions';
import { checkUnitAccess } from '@/lib/api-permissions';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');
    const department = searchParams.get('department');
    const status = searchParams.get('status');
    const company_id = searchParams.get('company_id');

    // Role is resolved server-side from the DB; client role header is not trusted.
    // Note: real session/JWT authentication is still required and not implemented here.
    const currentUserId = request.headers.get('x-current-user-id');
    const currentUserCompany = request.headers.get('x-current-user-company');

    // Use real Supabase data with filters
    const filters: any = {};
    if (role) filters.role = role;
    if (department) filters.department = department;
    if (status) filters.status = status;
    if (company_id) filters.company_id = company_id;

    // If current user info is available, resolve EFFECTIVE context theo công ty đang
    // làm việc (Đa Công Ty): role + company suy từ getEffectiveContext, không tin client.
    let users;
    if (currentUserId) {
      const { getEffectiveContext } = await import('@/lib/services/userCompanyService');
      const ctx = await getEffectiveContext(currentUserId, currentUserCompany || null);
      const effectiveRole = ctx?.role ?? 'user';
      const effectiveCompany = ctx?.company_id ?? currentUserCompany ?? null;
      users = await getVisibleUsers(
        currentUserId,
        effectiveRole,
        effectiveCompany,
        filters
      );
    } else {
      // Fall back to getUsers if no current user (shouldn't happen in normal flow)
      users = await getUsers(filters);
    }

    console.log('Returning visible users:', users.length);
    return NextResponse.json(users);
  } catch (error) {
    console.error('Users fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 🔐 Permission Check: Verify user can create users
    const currentUserId = request.headers.get('x-current-user-id');
    if (!currentUserId) {
      return NextResponse.json(
        { error: 'Unauthorized: Bạn chưa đăng nhập' },
        { status: 401 }
      );
    }

    const currentUser = await getUserById(currentUserId);
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Unauthorized: Người dùng không tồn tại' },
        { status: 401 }
      );
    }

    // Check if user has 'users:create' permission
    if (!checkUnitAccess(request, 'users', 'create') && !canAccess(currentUser.module_permissions as any, 'users', 'create')) {
      console.warn(`[Security] User ${currentUserId} attempted to create user without permission`);
      return NextResponse.json(
        { error: 'Forbidden: Bạn không có quyền tạo người dùng mới' },
        { status: 403 }
      );
    }

    if (!body.email || !body.name) {
      return NextResponse.json({ error: 'Email và tên là bắt buộc' }, { status: 400 });
    }

    if (body.password && String(body.password).length < 10) {
      return NextResponse.json({ error: 'Mật khẩu phải có ít nhất 10 ký tự (yêu cầu của SSO)' }, { status: 400 });
    }

    // Chỉ super_admin được cấp Đa Công Ty (cấp quyền chéo công ty).
    const incomingMemberships =
      currentUser.role === 'super_admin' && Array.isArray(body.company_memberships)
        ? body.company_memberships
        : null;
    delete body.company_memberships;

    // users:create không đồng nghĩa với quyền cấp đặc quyền.
    if (currentUser.role !== 'super_admin') {
      body.role = 'user';
      body.company_id = request.headers.get('x-current-user-company') || currentUser.company_id || null;
      delete body.module_permissions;
    }

    // Truyền id người tạo để ghi created_by/updated_by (createUser bỏ qua nếu không phải UUID).
    const newUser = await createUser(body, currentUserId);

    // Đồng bộ công ty phụ nếu có.
    if (incomingMemberships && newUser?.id) {
      const { setMemberships } = await import('@/lib/services/userCompanyService');
      await setMemberships(newUser.id, incomingMemberships).catch((err) =>
        console.error('setMemberships (create) error:', err)
      );
    }

    // Log audit trail
    console.log(`[Audit] User ${currentUserId} created new user ${newUser.id}`);

    return NextResponse.json(newUser, { status: 201 });
  } catch (error: any) {
    console.error('User creation error:', error);
    // Email trùng → 409 Conflict
    if (error?.code === 'EMAIL_DUPLICATE' || error?.constraint === 'users_email_key') {
      return NextResponse.json(
        { error: error.message || 'Email này đã được sử dụng' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi khi tạo người dùng' },
      { status: 500 }
    );
  }
}
