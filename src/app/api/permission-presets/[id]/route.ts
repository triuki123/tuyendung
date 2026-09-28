import { NextRequest, NextResponse } from 'next/server';
import { checkModuleAccess } from '@/lib/api-permissions';
import * as presets from '@/lib/services/permissionPresetService';

export const dynamic = 'force-dynamic';

/** PUT /api/permission-presets/[id] — cập nhật mẫu (tên/mô tả/bộ quyền). */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkModuleAccess(request, 'users', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const body = await request.json();
    const data = await presets.updatePreset(params.id, body);
    if (!data) return NextResponse.json({ error: 'Mẫu không tồn tại' }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error('PUT /api/permission-presets/[id] error:', err);
    return NextResponse.json({ error: err?.message || 'Lỗi server' }, { status: 400 });
  }
}

/** DELETE /api/permission-presets/[id] — xóa mẫu. */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkModuleAccess(request, 'users', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    await presets.deletePreset(params.id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('DELETE /api/permission-presets/[id] error:', err);
    return NextResponse.json({ error: err?.message || 'Lỗi server' }, { status: 400 });
  }
}
