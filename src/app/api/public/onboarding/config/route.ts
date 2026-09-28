import { NextResponse } from 'next/server';
import * as onboarding from '@/lib/services/onboardingService';
import { getFormById } from '@/lib/services/formService';
import { isRecruiterOnlyField } from '@/lib/onboardingFieldRules';
import { listHrDocumentTypes } from '@/lib/services/hrDocumentTypeService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/public/onboarding/config
 * Cấu hình biểu mẫu Onboarding cố định + dữ liệu tổ chức cho landing page public.
 * KHÔNG cần đăng nhập.
 */
export async function GET() {
  try {
    const form = await getFormById(onboarding.ONBOARDING_FORM_ID);
    if (!form || form.status === 'closed') {
      return NextResponse.json({ error: 'Biểu mẫu hiện không khả dụng' }, { status: 404 });
    }
    const [allFields, org, allDocTypes] = await Promise.all([
      onboarding.listFormFields(onboarding.ONBOARDING_FORM_ID, true),
      onboarding.getPublicOrgData(),
      listHrDocumentTypes(false), // chỉ loại đang active
    ]);
    // Ẩn các field chỉ-Tuyển-dụng (Công ty/Phòng ban/Bộ phận/Chức vụ/Chức danh) khỏi form public.
    const fields = allFields.filter((f) => !isRecruiterOnlyField(f.field_key));
    // Loại giấy tờ cho slot đính kèm — chỉ loại được bật hiển thị trên form onboarding.
    const docTypes = allDocTypes
      .filter((t) => t.onboarding_visible)
      .map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        required: t.onboarding_required,
        multiple: t.onboarding_multiple,
      }));
    return NextResponse.json({
      success: true,
      data: { title: form.title, description: form.description, fields, org, docTypes },
    });
  } catch (err) {
    console.error('GET /api/public/onboarding/config error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
