import { NextRequest, NextResponse } from 'next/server';
import { checkModuleAccess } from '@/lib/api-permissions';
import * as formService from '@/lib/services/formService';
import * as onboarding from '@/lib/services/onboardingService';

export const dynamic = 'force-dynamic';

/** GET /api/hr/forms/:id/fields — field của biểu mẫu */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkModuleAccess(request, 'forms', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const data = await onboarding.listFormFields(params.id, false);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/hr/forms/:id/fields error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * POST /api/hr/forms/:id/fields — thêm 1 field mới vào biểu mẫu
 * Body: { label, field_type, required?, options?, help_text? }
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkModuleAccess(request, 'forms', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const body = await request.json();
    if (!body.label?.trim() || !body.field_type) {
      return NextResponse.json({ error: 'Thiếu nhãn hoặc loại trường' }, { status: 400 });
    }
    await formService.addField(params.id, {
      label: body.label,
      fieldType: body.field_type,
      required: body.required,
      options: Array.isArray(body.options) ? body.options : undefined,
      helpText: body.help_text,
    });
    const data = await onboarding.listFormFields(params.id, false);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('POST /api/hr/forms/:id/fields error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi server' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/hr/forms/:id/fields — cập nhật hàng loạt (enabled/required/label/sort_order)
 * Body: { updates: [{ id, ... }] }
 */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkModuleAccess(request, 'forms', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const body = await request.json();
    if (!Array.isArray(body.updates)) {
      return NextResponse.json({ error: 'Thiếu danh sách cập nhật' }, { status: 400 });
    }
    await onboarding.updateFormFields(body.updates);
    const data = await onboarding.listFormFields(params.id, false);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('PUT /api/hr/forms/:id/fields error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE /api/hr/forms/:id/fields?fieldId=xxx — xóa 1 field (không xóa field hệ thống) */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkModuleAccess(request, 'forms', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const fieldId = request.nextUrl.searchParams.get('fieldId');
    if (!fieldId) return NextResponse.json({ error: 'Thiếu fieldId' }, { status: 400 });
    const ok = await formService.deleteField(params.id, fieldId);
    if (!ok) return NextResponse.json({ error: 'Không xóa được trường này' }, { status: 400 });
    const data = await onboarding.listFormFields(params.id, false);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('DELETE /api/hr/forms/:id/fields error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
