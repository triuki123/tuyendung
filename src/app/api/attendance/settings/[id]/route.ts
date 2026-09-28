import { NextRequest, NextResponse } from 'next/server';
import { deleteAttendanceSettings } from '@/lib/services/attendanceSettingsService';

export const dynamic = 'force-dynamic';

/** DELETE /api/attendance/settings/[id] — xoá 1 phiên bản cấu hình (super_admin). */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if ((request.headers.get('x-current-user-role') || '') !== 'super_admin') {
      return NextResponse.json({ error: 'Chỉ Super Admin được xoá cấu hình' }, { status: 403 });
    }
    const ok = await deleteAttendanceSettings(params.id);
    if (!ok) return NextResponse.json({ error: 'Không tìm thấy phiên bản' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/attendance/settings/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
