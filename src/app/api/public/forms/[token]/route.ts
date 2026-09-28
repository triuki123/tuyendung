import { NextRequest, NextResponse } from 'next/server';
import * as formService from '@/lib/services/formService';
import * as onboarding from '@/lib/services/onboardingService';
import { SESSION_COOKIE, verifyIdentity } from '@/lib/authCookie';

export const dynamic = 'force-dynamic';

/**
 * Biểu mẫu Nội Bộ (is_internal = true) yêu cầu cookie phiên hợp lệ.
 * Trả 401 + reason = "internal" để client redirect về trang đăng nhập.
 */
async function requireAuthForInternalForm(request: NextRequest, isInternal: boolean): Promise<NextResponse | null> {
  if (!isInternal) return null;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const identity = await verifyIdentity(token);
  if (identity) return null;
  return NextResponse.json(
    { error: 'Biểu mẫu này chỉ dành cho nhân viên đã đăng nhập', reason: 'internal' },
    { status: 401 }
  );
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 10;

/**
 * GET /api/public/forms/:token — cấu hình biểu mẫu nội bộ cho trang điền public.
 * KHÔNG cần đăng nhập.
 */
export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const form = await formService.getFormByToken(params.token);
    if (!form) return NextResponse.json({ error: 'Biểu mẫu không tồn tại' }, { status: 404 });

    const deny = await requireAuthForInternalForm(request, form.is_internal);
    if (deny) return deny;

    const fields = await onboarding.listFormFields(form.id, true);
    // Quá hạn → coi như đã đóng để trang public hiển thị "đã đóng".
    const expired = !!form.expires_at && new Date(form.expires_at).getTime() < Date.now();
    return NextResponse.json({
      success: true,
      data: {
        title: form.title,
        description: form.description,
        status: expired ? 'closed' : form.status,
        is_internal: form.is_internal,
        expires_at: form.expires_at,
        fields,
      },
    });
  } catch (err) {
    console.error('GET /api/public/forms/:token error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * POST /api/public/forms/:token (multipart/form-data) — nộp phản hồi biểu mẫu nội bộ.
 * Trường: data (JSON) + files (tùy chọn). KHÔNG cần tài khoản.
 */
export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const form = await formService.getFormByToken(params.token);
    if (!form) return NextResponse.json({ error: 'Biểu mẫu không tồn tại' }, { status: 404 });
    if (form.status !== 'active') {
      return NextResponse.json({ error: 'Biểu mẫu đã đóng, không nhận thêm phản hồi' }, { status: 403 });
    }
    if (form.expires_at && new Date(form.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Biểu mẫu đã hết hạn, không nhận thêm phản hồi' }, { status: 403 });
    }
    const deny = await requireAuthForInternalForm(request, form.is_internal);
    if (deny) return deny;

    const fd = await request.formData();
    const dataRaw = fd.get('data');
    if (typeof dataRaw !== 'string') {
      return NextResponse.json({ error: 'Thiếu dữ liệu biểu mẫu' }, { status: 400 });
    }
    const data = JSON.parse(dataRaw);

    const submission = await onboarding.submitToForm(form.id, 'general', data);

    const files = fd.getAll('files').filter((f): f is File => f instanceof File);
    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Tối đa ${MAX_FILES} tệp` }, { status: 400 });
    }
    for (const file of files) {
      if (file.size === 0) continue;
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: `Tệp "${file.name}" vượt quá 10MB` }, { status: 413 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      await onboarding.saveSubmissionAttachment(
        submission.id,
        { fileName: file.name, mimeType: file.type || null, buffer },
        submission.candidate_name
      );
    }

    return NextResponse.json({ success: true, data: { status: submission.status } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi server';
    const isValidation = msg.startsWith('Vui lòng điền');
    if (!isValidation) console.error('POST /api/public/forms/:token error:', err);
    return NextResponse.json({ error: msg }, { status: isValidation ? 400 : 500 });
  }
}
