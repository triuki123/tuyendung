import { NextRequest, NextResponse } from 'next/server';
import { requireLegal, requireLegalUnlocked } from '@/lib/legal/legalGuard';
import {
  getDocument, addLegalFile, listLegalFiles, LEGAL_FILE_MAX_BYTES,
} from '@/lib/services/legalService';
import { logLegalRecord } from '@/lib/services/legalAuditService';

export const dynamic = 'force-dynamic';

/** GET: metadata file đính kèm của 1 văn bản */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const guard = await requireLegal(request, 'view');
    if ('response' in guard) return guard.response;
    const denied = await requireLegalUnlocked(request, guard.actor.id, 'document', params.id);
    if (denied) return denied;
    const files = await listLegalFiles('legal_document_files', params.id);
    return NextResponse.json({ success: true, data: files });
  } catch (err) {
    console.error('GET /api/legal/documents/[id]/files error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST: upload scan (multipart/form-data, field "files", nhiều tệp, max 10MB/tệp) */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const guard = await requireLegal(request, 'edit');
    if ('response' in guard) return guard.response;

    const doc = await getDocument(params.id);
    if (!doc) return NextResponse.json({ error: 'Không tìm thấy văn bản' }, { status: 404 });

    const denied = await requireLegalUnlocked(request, guard.actor.id, 'document', params.id);
    if (denied) return denied;

    const form = await request.formData();
    const files = form.getAll('files').filter((f): f is File => f instanceof File);
    if (!files.length) return NextResponse.json({ error: 'Chưa chọn tệp' }, { status: 400 });

    const saved: string[] = [];
    for (const f of files) {
      if (f.size > LEGAL_FILE_MAX_BYTES) {
        return NextResponse.json({ error: `"${f.name}" vượt quá 10MB` }, { status: 400 });
      }
      const result = await addLegalFile('legal_document_files', params.id, {
        fileName: f.name,
        mimeType: f.type || 'application/octet-stream',
        content: Buffer.from(await f.arrayBuffer()),
        uploadedBy: guard.actor.id,
      });
      if (!result.ok) return NextResponse.json({ error: `"${f.name}": ${result.error}` }, { status: 400 });
      saved.push(f.name);
    }

    await logLegalRecord({
      entityType: 'document', entityId: params.id, action: 'attach',
      details: `Đính kèm ${saved.length} tệp: ${saved.join(', ')}`, performedBy: guard.actor.id,
    });
    return NextResponse.json({ success: true, data: { count: saved.length } });
  } catch (err) {
    console.error('POST /api/legal/documents/[id]/files error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
