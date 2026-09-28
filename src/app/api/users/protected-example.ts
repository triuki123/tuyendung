/**
 * EXAMPLE: Cách bảo vệ API endpoint bằng permission
 *
 * Đây chỉ là ví dụ hướng dẫn, không phải code thực thi.
 * Copy pattern này vào các API route thực tế của bạn.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkPermission } from '@/lib/api-permissions';
import { updateUser } from '@/lib/services/usersService';

/**
 * Example 1: Bảo vệ endpoint PUT /api/users/[id]
 * Yêu cầu quyền 'edit' trên module 'users'
 */
export async function examplePutUserHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // ✅ BẢO VỆ: Kiểm tra quyền
    const hasPermission = await checkPermission(request, {
      moduleId: 'users',
      requiredAction: 'edit'
    });

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Bạn không có quyền sửa người dùng' },
        { status: 403 }
      );
    }

    // ✅ Nếu có quyền, thực hiện update
    const body = await request.json();
    const updated = await updateUser(id, body);

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update user' },
      { status: 500 }
    );
  }
}

/**
 * Example 2: Bảo vệ endpoint POST /api/users (tạo người dùng)
 * Yêu cầu quyền 'create' trên module 'users'
 */
export async function examplePostUserHandler(request: NextRequest) {
  try {
    // ✅ BẢO VỀ: Kiểm tra quyền
    const hasPermission = await checkPermission(request, {
      moduleId: 'users',
      requiredAction: 'create'
    });

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Bạn không có quyền tạo người dùng mới' },
        { status: 403 }
      );
    }

    // ✅ Nếu có quyền, thực hiện create
    const body = await request.json();
    // const newUser = await createUser(body);
    // return NextResponse.json(newUser, { status: 201 });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create user' },
      { status: 500 }
    );
  }
}

/**
 * Example 3: Bảo vệ endpoint DELETE /api/users/[id]
 * Yêu cầu quyền 'delete' trên module 'users'
 */
export async function exampleDeleteUserHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // ✅ BẢO VỀ: Kiểm tra quyền
    const hasPermission = await checkPermission(request, {
      moduleId: 'users',
      requiredAction: 'delete'
    });

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Bạn không có quyền xóa người dùng' },
        { status: 403 }
      );
    }

    // ✅ Nếu có quyền, thực hiện delete
    // const deleted = await deactivateUser(id);
    // return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete user' },
      { status: 500 }
    );
  }
}

/**
 * Example 4: Bảo vệ endpoint asset-management
 * Kiểm tra quyền 'export' trên module 'asset-management'
 */
export async function exampleAssetExportHandler(request: NextRequest) {
  try {
    // ✅ BẢO VỀ: Kiểm tra quyền
    const hasPermission = await checkPermission(request, {
      moduleId: 'asset-management',
      requiredAction: 'export'
    });

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Bạn không có quyền xuất danh sách tài sản' },
        { status: 403 }
      );
    }

    // ✅ Nếu có quyền, thực hiện export
    // const assets = await getAssets();
    // return NextResponse.json(assets);
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to export' },
      { status: 500 }
    );
  }
}

/**
 * Example 5: Bảo vệ nhiều quyền cùng lúc
 * Sử dụng checkAllPermissions hoặc checkAnyPermission
 */
export async function exampleMultiplePermissionsHandler(request: NextRequest) {
  try {
    // Import { checkAllPermissions, checkAnyPermission } from '@/lib/api-permissions';

    // Yêu cầu CẢ ĐỘ quyền (AND logic)
    // const canDoEverything = await checkAllPermissions(request, [
    //   { moduleId: 'users', requiredAction: 'edit' },
    //   { moduleId: 'users', requiredAction: 'delete' }
    // ]);

    // Yêu cầu BẤT KỲ quyền nào (OR logic)
    // const canDoSomething = await checkAnyPermission(request, [
    //   { moduleId: 'users', requiredAction: 'create' },
    //   { moduleId: 'users', requiredAction: 'edit' }
    // ]);

    return NextResponse.json({ message: 'Xem comment để biết cách dùng' });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Error' }, { status: 500 });
  }
}

/**
 * IMPLEMENTATION GUIDE:
 *
 * 1. Copy pattern từ examples trên
 * 2. Thêm permission check vào đầu handler
 * 3. Return 403 Forbidden nếu không có quyền
 * 4. Thực hiện logic chính nếu có quyền
 *
 * ✅ Quyền được kiểm tra ở backend (bảo mật)
 * ✅ Frontend chỉ ẩn UI không cần thiết (UX)
 * ✅ Dù frontend lấy gọi API, server vẫn kiểm tra quyền
 */
