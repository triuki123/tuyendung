import { adminChangeUserPassword } from '@/lib/services/usersService';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const adminId = request.headers.get('x-current-user-id');
    const { targetUserId, newPassword } = await request.json();

    if (!adminId || !targetUserId || !newPassword) {
      return NextResponse.json(
        { error: adminId ? 'Thiếu thông tin bắt buộc' : 'Chưa đăng nhập' },
        { status: adminId ? 400 : 401 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    await adminChangeUserPassword(adminId, targetUserId, newPassword);

    return NextResponse.json({
      success: true,
      message: 'User password changed successfully',
    });
  } catch (error) {
    console.error('Admin change password error:', error);
    const message = error instanceof Error ? error.message : 'Failed to change password';

    if (message.includes('Only Super Admin')) {
      return NextResponse.json(
        { error: 'Chỉ Super Admin mới có quyền thay đổi mật khẩu người dùng khác' },
        { status: 403 }
      );
    }

    if (message.includes('Admin Master')) {
      return NextResponse.json(
        { error: 'Không thể thay đổi mật khẩu của Admin Master' },
        { status: 403 }
      );
    }

    if (message.includes('not found')) {
      return NextResponse.json(
        { error: 'Người dùng không tồn tại' },
        { status: 404 }
      );
    }

    // Lỗi nghiệp vụ đã được service ném ra dạng thông điệp rõ ràng bằng tiếng Việt
    // (độ dài mật khẩu, chưa liên kết SSO, SSO tắt/lỗi) → 4xx, không phải 500 (I9).
    if (message.includes('ít nhất 10 ký tự') || message.includes('SSO')) {
      return NextResponse.json(
        { error: message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
