import { NextRequest, NextResponse } from 'next/server';
import { checkModuleAccess } from '@/lib/api-permissions';
import * as presets from '@/lib/services/permissionPresetService';

export const dynamic = 'force-dynamic';

/** GET /api/permission-presets — danh sách quyền mẫu tùy chỉnh. */
export async function GET(request: NextRequest) {
  try {
    if (!checkModuleAccess(request, 'users', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    await presets.ensureDefaultPresets();
    const data = await presets.listPresets();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/permission-presets error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST /api/permission-presets — lưu bộ quyền hiện tại thành mẫu. */
export async function POST(request: NextRequest) {
  try {
    if (!checkModuleAccess(request, 'users', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const actorId = request.headers.get('x-current-user-id');
    const body = await request.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Thiếu tên mẫu' }, { status: 400 });
    }
    const data = await presets.createPreset({
      name: body.name,
      description: body.description,
      permissions: body.permissions || {},
      createdBy: actorId,
    });
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error('POST /api/permission-presets error:', err);
    return NextResponse.json({ error: err?.message || 'Lỗi server' }, { status: 400 });
  }
}
