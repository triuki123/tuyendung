import { getAllSystemConfigs, addSystemConfig, updateSystemConfig } from '@/lib/services/configService';
import { getUserById } from '@/lib/services/usersService';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
    const configs = await getAllSystemConfigs();
    return NextResponse.json(configs);
  } catch (error) {
    console.error('Get system config error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get system config' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { adminId, type, name } = await request.json();

    if (!adminId || !type || !name) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!['role', 'department', 'company'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid type. Must be role, department, or company' },
        { status: 400 }
      );
    }

    const admin = await getUserById(adminId);
    if (!admin || admin.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Chỉ Super Admin mới có quyền tạo cấu hình hệ thống' },
        { status: 403 }
      );
    }

    const config = await addSystemConfig(type, name, adminId);

    return NextResponse.json(
      {
        success: true,
        message: `${type} "${name}" đã được thêm vào hệ thống`,
        data: config,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Add system config error:', error);
    const message = error instanceof Error ? error.message : 'Failed to add system config';

    if (message.includes('already exists')) {
      return NextResponse.json(
        { error: message },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { adminEmail, type, oldName, newName } = await request.json();

    if (!adminEmail || !type || !oldName || !newName) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!['role', 'department', 'company'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid type. Must be role, department, or company' },
        { status: 400 }
      );
    }

    const config = await updateSystemConfig(adminEmail, type, oldName, newName);

    return NextResponse.json({
      success: true,
      message: `${type} "${oldName}" đã được đổi tên thành "${newName}"`,
      data: config,
    });
  } catch (error) {
    console.error('Update system config error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update system config';

    if (message.includes('Admin Master')) {
      return NextResponse.json(
        { error: message },
        { status: 403 }
      );
    }

    if (message.includes('đã tồn tại')) {
      return NextResponse.json(
        { error: message },
        { status: 409 }
      );
    }

    if (message.includes('không tồn tại')) {
      return NextResponse.json(
        { error: message },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
