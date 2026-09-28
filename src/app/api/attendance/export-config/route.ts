import { NextRequest, NextResponse } from 'next/server';
import { decodeIdentityHeader } from '@/lib/authCookie';
import { getExportColumns, saveExportColumns } from '@/lib/services/attendanceExportConfigService';
import { catalogMeta } from '@/lib/attendanceExportCatalog';

const HCNS_DEPT_ID = '74ab7673-13d6-404f-a576-5f4e87f8f7fa';

/** GET — cấu hình cột hiện tại + danh mục nguồn dữ liệu có thể thêm. */
export async function GET() {
  try {
    const columns = await getExportColumns();
    return NextResponse.json({ success: true, columns, catalog: catalogMeta() });
  } catch (err) {
    console.error('GET /api/attendance/export-config error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** PUT — lưu cấu hình cột (HCNS/super_admin). */
export async function PUT(request: NextRequest) {
  try {
    const deptId = decodeIdentityHeader(request.headers.get('x-current-user-dept')) ?? '';
    const role = request.headers.get('x-current-user-role') ?? '';
    if (deptId !== HCNS_DEPT_ID && role !== 'super_admin' && role !== 'admin')
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

    const body = await request.json();
    if (!Array.isArray(body?.columns))
      return NextResponse.json({ error: 'Dữ liệu cấu hình không hợp lệ' }, { status: 400 });

    await saveExportColumns(body.columns);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT /api/attendance/export-config error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
