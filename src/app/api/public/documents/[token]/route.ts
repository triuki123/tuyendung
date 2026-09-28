import { NextRequest, NextResponse } from 'next/server';
import * as documentsService from '@/lib/services/documentsService';

export const dynamic = 'force-dynamic';

/** Chi tiết văn bản công khai theo token — không cần đăng nhập. */
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const data = await documentsService.getPublicDocumentByToken(params.token);
    if (!data) {
      return NextResponse.json({ error: 'Văn bản không tồn tại hoặc đã ngừng công khai' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/public/documents/[token] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
