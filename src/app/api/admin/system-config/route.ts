import { getAllSystemConfigs, addSystemConfig } from '@/lib/services/configService';
import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/apiAuth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, ['super_admin']);
    if ('response' in auth) return auth.response;

    const configs = await getAllSystemConfigs();
    return NextResponse.json(configs);
  } catch (error) {
    console.error('Get system config error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Không thể đọc cấu hình hệ thống' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, ['super_admin']);
    if ('response' in auth) return auth.response;

    const { type, name } = await request.json();
    if (!type || !name) {
      return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 });
    }
    if (!['role', 'department', 'company'].includes(type)) {
      return NextResponse.json(
        { error: 'Loại cấu hình không hợp lệ' },
        { status: 400 }
      );
    }

    const config = await addSystemConfig(type, name, auth.actor.id);
    return NextResponse.json(
      {
        success: true,
        message: `Đã thêm "${name}" vào cấu hình hệ thống`,
        data: config,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Add system config error:', error);
    const message = error instanceof Error ? error.message : 'Không thể thêm cấu hình hệ thống';
    if (message.includes('already exists')) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
