import { NextRequest, NextResponse } from 'next/server';
import { checkModuleAccess } from '@/lib/api-permissions';
import * as onboarding from '@/lib/services/onboardingService';

export const dynamic = 'force-dynamic';

/** GET /api/hr/forms/:id/responses — danh sách phản hồi (submission) của biểu mẫu */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkModuleAccess(request, 'forms', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const [submissions, fields] = await Promise.all([
      onboarding.listSubmissions({ formId: params.id }),
      onboarding.listFormFields(params.id, false),
    ]);
    return NextResponse.json({ success: true, data: { submissions, fields } });
  } catch (err) {
    console.error('GET /api/hr/forms/:id/responses error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
