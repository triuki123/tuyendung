import { NextRequest, NextResponse } from 'next/server';
import { checkModuleAccess } from '@/lib/api-permissions';
import * as presets from '@/lib/services/permissionPresetService';

export const dynamic = 'force-dynamic';

/** POST /api/permission-presets/restore-defaults — tạo lại 4 mẫu mặc định (bỏ qua mẫu trùng tên). */
export async function POST(request: NextRequest) {
  try {
    if (!checkModuleAccess(request, 'users', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const actorId = request.headers.get('x-current-user-id');
    const added = await presets.seedDefaultPresets(actorId);
    const data = await presets.listPresets();
    return NextResponse.json({ success: true, added, data });
  } catch (err: any) {
    console.error('POST /api/permission-presets/restore-defaults error:', err);
    return NextResponse.json({ error: err?.message || 'Lỗi server' }, { status: 400 });
  }
}
