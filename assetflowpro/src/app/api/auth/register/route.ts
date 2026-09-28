import { createUser } from '@/lib/services/usersService';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, name, password, role, department, company, position, phone } = body;

    if (!email || !name || !password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Mật khẩu phải có ít nhất 8 ký tự' }, { status: 400 });
    }

    const user = await createUser({
      email,
      name,
      password,
      role: role || 'user',
      department: department || '',
      company: company || 'FADO Group',
      position,
      phone,
    });

    return NextResponse.json(
      {
        success: true,
        message: `Tài khoản ${email} đã được tạo`,
        data: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Register error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create user';

    if (message.includes('already exists') || message.includes('duplicate')) {
      return NextResponse.json({ error: 'Email đã tồn tại' }, { status: 409 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
