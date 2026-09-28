import { NextRequest, NextResponse } from 'next/server';
import { checkModuleAccess } from '@/lib/api-permissions';
import * as formService from '@/lib/services/formService';

export const dynamic = 'force-dynamic';

/** GET /api/hr/forms — danh sách biểu mẫu nội bộ (chỉ form_type = 'general') */
export async function GET(request: NextRequest) {
  try {
    if (!checkModuleAccess(request, 'forms', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const all = await formService.listForms();
    const data = all.filter((f) => f.form_type === 'general');
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/hr/forms error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * POST /api/hr/forms — tạo biểu mẫu nội bộ mới
 * Body: { title, description? }
 */
export async function POST(request: NextRequest) {
  try {
    if (!checkModuleAccess(request, 'forms', 'create')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const userId = request.headers.get('x-current-user-id');
    const body = await request.json();
    if (!body.title?.trim()) {
      return NextResponse.json({ error: 'Thiếu tiêu đề biểu mẫu' }, { status: 400 });
    }
    const data = await formService.createForm({
      title: body.title,
      description: body.description,
      formType: 'general',
      createdBy: userId,
    });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('POST /api/hr/forms error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi server' },
      { status: 500 }
    );
  }
}
