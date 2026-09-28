import { NextRequest, NextResponse } from 'next/server';
import * as onboarding from '@/lib/services/onboardingService';
import { getFormById } from '@/lib/services/formService';

export const dynamic = 'force-dynamic';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 20;

/**
 * POST /api/public/onboarding/submit (multipart/form-data)
 * Nhân sự mới nộp biểu mẫu thông tin đầu vào — KHÔNG cần tài khoản.
 * Trường: data (JSON string) + files (hồ sơ đính kèm, tùy chọn).
 * Tạo submission status 'submitted' → vào luồng Nguồn Nhân Lực.
 */
export async function POST(request: NextRequest) {
  try {
    const form = await getFormById(onboarding.ONBOARDING_FORM_ID);
    if (!form || form.status !== 'active') {
      return NextResponse.json({ error: 'Biểu mẫu hiện không nhận phản hồi' }, { status: 403 });
    }

    const fd = await request.formData();
    const dataRaw = fd.get('data');
    if (typeof dataRaw !== 'string') {
      return NextResponse.json({ error: 'Thiếu dữ liệu biểu mẫu' }, { status: 400 });
    }
    const data = JSON.parse(dataRaw);

    // Tạo submission (validate field bắt buộc bên trong)
    const submission = await onboarding.submitToForm(onboarding.ONBOARDING_FORM_ID, 'onboarding', data);

    // Lưu hồ sơ đính kèm (nháp). docTypes[i] = loại giấy tờ của files[i] (song song theo thứ tự).
    const files = fd.getAll('files').filter((f): f is File => f instanceof File);
    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Tối đa ${MAX_FILES} tệp` }, { status: 400 });
    }
    let docTypes: (string | null)[] = [];
    const docTypesRaw = fd.get('fileDocTypes');
    if (typeof docTypesRaw === 'string') {
      try {
        const parsed = JSON.parse(docTypesRaw);
        if (Array.isArray(parsed)) docTypes = parsed;
      } catch { /* bỏ qua — coi như không phân loại */ }
    }
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size === 0) continue;
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: `Tệp "${file.name}" vượt quá 10MB` }, { status: 413 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      await onboarding.saveSubmissionAttachment(
        submission.id,
        { fileName: file.name, mimeType: file.type || null, buffer },
        submission.candidate_name,
        docTypes[i] ?? null
      );
    }

    return NextResponse.json({ success: true, data: { status: submission.status } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi server';
    const isValidation = msg.startsWith('Vui lòng điền');
    if (!isValidation) console.error('POST /api/public/onboarding/submit error:', err);
    return NextResponse.json({ error: msg }, { status: isValidation ? 400 : 500 });
  }
}
