import { adminChangeUserPassword } from '@/lib/services/usersService';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { adminId, targetUserId, newPassword } = await request.json();

    if (!adminId || !targetUserId || !newPassword) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'Mật khẩu phải có ít nhất 8 ký tự' },
        { status: 400 }
      );
    }

    await adminChangeUserPassword(adminId, targetUserId, newPassword);

    return NextResponse.json(
      {
        success: true,
        message: 'Mật khẩu đã được thay đổi thành công',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Change password error:', error);
    const message = error instanceof Error ? error.message : 'Failed to change password';

    if (message.includes('không tồn tại')) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    if (message.includes('quyền') || message.includes('không thể')) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
