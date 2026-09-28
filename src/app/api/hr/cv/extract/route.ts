import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { extractCvDocument } from '@/lib/services/cvExtract';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'hr-cv', 'create')) return NextResponse.json({ error: 'Không có quyền thêm CV' }, { status: 403 });
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Cần chọn tệp CV' }, { status: 400 });
    if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: 'Tệp CV tối đa 20MB' }, { status: 400 });
    const document = await extractCvDocument(Buffer.from(await file.arrayBuffer()), file.type, file.name);
    return NextResponse.json({ success: true, data: document.data });
  } catch (error) {
    console.error('POST /api/hr/cv/extract error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Không thể đọc nội dung CV' }, { status: 500 });
  }
}
