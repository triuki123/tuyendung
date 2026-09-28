import { NextRequest, NextResponse } from 'next/server';
import { getAttachmentContent } from '@/lib/services/emailCenterService';
import { getEmailCenterActions } from '../../_perm';

export const dynamic = 'force-dynamic';

/** GET /api/email-center/attachment/[id] — tải file đính kèm đã lưu (dùng trong outbox detail). */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const acts = getEmailCenterActions(request);
  if (acts === null || acts.length === 0) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
  const row = await getAttachmentContent(params.id);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return new NextResponse(row.content as any, {
    headers: {
      'Content-Type': row.mime,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(row.filename)}"`,
    },
  });
}
