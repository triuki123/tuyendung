import { NextRequest, NextResponse } from 'next/server';
import { checkModuleAccess } from '@/lib/api-permissions';
import * as formService from '@/lib/services/formService';

export const dynamic = 'force-dynamic';

/** GET /api/hr/forms/:id — chi tiết biểu mẫu + field */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkModuleAccess(request, 'forms', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const form = await formService.getFormById(params.id);
    if (!form) return NextResponse.json({ error: 'Không tìm thấy biểu mẫu' }, { status: 404 });
    return NextResponse.json({ success: true, data: form });
  } catch (err) {
    console.error('GET /api/hr/forms/:id error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** PUT /api/hr/forms/:id — sửa tiêu đề/mô tả/trạng thái */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkModuleAccess(request, 'forms', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const body = await request.json();
    const data = await formService.updateForm(params.id, {
      title: body.title,
      description: body.description,
      status: body.status,
      is_internal: typeof body.is_internal === 'boolean' ? body.is_internal : undefined,
      expires_at: body.expires_at !== undefined ? (body.expires_at || null) : undefined,
    });
    if (!data) return NextResponse.json({ error: 'Không tìm thấy biểu mẫu' }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('PUT /api/hr/forms/:id error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE /api/hr/forms/:id — xóa biểu mẫu (soft) */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkModuleAccess(request, 'forms', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const ok = await formService.deleteForm(params.id);
    if (!ok) return NextResponse.json({ error: 'Không tìm thấy biểu mẫu' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/hr/forms/:id error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi server' },
      { status: 500 }
    );
  }
}
