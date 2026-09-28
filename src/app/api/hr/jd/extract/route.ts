import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { getEffectiveContext } from '@/lib/services/userCompanyService';
import { extractCvText } from '@/lib/services/cvExtract';
import { extractJdFields } from '@/lib/jdExtract';

export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id') || '';
    const ctx = userId ? await getEffectiveContext(userId, request.headers.get('x-current-user-company') || undefined) : null;
    if (!['super_admin', 'admin', 'manager'].includes(ctx?.role || '') && !checkUnitAccess(request, 'hr-jd', 'create') && !checkUnitAccess(request, 'hr-jd', 'edit')) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const file = (await request.formData()).get('file');
    if (!(file instanceof File) || !file.size || file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'Chọn file JD tối đa 10MB.' }, { status: 400 });
    if (!/\.(docx|pdf|png|jpe?g|webp)$/i.test(file.name)) return NextResponse.json({ error: 'Hỗ trợ DOCX, PDF, PNG, JPG và WebP.' }, { status: 400 });
    const text = await extractCvText(Buffer.from(await file.arrayBuffer()), file.type, file.name);
    if (!text.trim()) return NextResponse.json({ error: 'Không đọc được nội dung. Hãy chọn file rõ hơn hoặc nhập thủ công.' }, { status: 422 });
    return NextResponse.json({ success: true, data: extractJdFields(text, file.name) });
  } catch (error) {
    console.error('JD extraction failed:', error);
    return NextResponse.json({ error: 'Không quét được JD. Vui lòng thử lại hoặc nhập thủ công.' }, { status: 500 });
  }
}
