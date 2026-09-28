import { NextRequest, NextResponse } from 'next/server';
import { requireLegal, requireLegalUnlocked } from '@/lib/legal/legalGuard';
import {
  getLegalFileContent, getLegalFileParent, softDeleteLegalFile,
} from '@/lib/services/legalService';
import { logLegalRecord } from '@/lib/services/legalAuditService';

export const dynamic = 'force-dynamic';

/**
 * File pháp chế dùng chung cho 2 bảng — query param ?scope=document|contract
 * quyết định bảng nào (mặc định document).
 */
function tableOf(request: NextRequest): 'legal_document_files' | 'legal_contract_files' {
  return request.nextUrl.searchParams.get('scope') === 'contract'
    ? 'legal_contract_files'
    : 'legal_document_files';
}

const entityOf = (table: string) => (table === 'legal_contract_files' ? 'contract' : 'document') as 'contract' | 'document';

/** GET: tải nội dung file (inline). Bản ghi khóa BMHS → cần vé; mọi lượt xem đều ghi nhật ký. */
export async function GET(request: NextRequest, { params }: { params: { fileId: string } }) {
  try {
    const guard = await requireLegal(request, 'view');
    if ('response' in guard) return guard.response;

    const table = tableOf(request);
    // Gate khóa chạy trên metadata NHẸ trước — không kéo BYTEA 10MB rồi mới chặn.
    const meta = await getLegalFileParent(table, params.fileId);
    if (!meta) return NextResponse.json({ error: 'Không tìm thấy tệp' }, { status: 404 });

    const denied = await requireLegalUnlocked(request, guard.actor.id, entityOf(table), meta.parent_id);
    if (denied) return denied;

    const file = await getLegalFileContent(table, params.fileId);
    if (!file) return NextResponse.json({ error: 'Không tìm thấy tệp' }, { status: 404 });

    // Nhật ký TRUY CẬP: hồ sơ pháp lý nhạy cảm cần biết ai đã xem/tải gì lúc nào.
    // logLegalRecord nuốt lỗi — không bao giờ chặn việc trả file.
    await logLegalRecord({
      entityType: entityOf(table), entityId: meta.parent_id, action: 'view_file',
      details: `Xem/tải tệp "${meta.file_name}"`, performedBy: guard.actor.id,
    });

    return new NextResponse(file.content as unknown as BodyInit, {
      headers: {
        'Content-Type': file.mime_type,
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.file_name)}`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (err) {
    console.error('GET /api/legal/files/[fileId] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE: gỡ file (xóa mềm). Bản ghi khóa → cần vé. */
export async function DELETE(request: NextRequest, { params }: { params: { fileId: string } }) {
  try {
    const guard = await requireLegal(request, 'delete');
    if ('response' in guard) return guard.response;

    const table = tableOf(request);
    const meta = await getLegalFileParent(table, params.fileId);
    if (!meta) return NextResponse.json({ error: 'Không tìm thấy tệp' }, { status: 404 });

    const denied = await requireLegalUnlocked(request, guard.actor.id, entityOf(table), meta.parent_id);
    if (denied) return denied;

    const removed = await softDeleteLegalFile(table, params.fileId);
    if (!removed) return NextResponse.json({ error: 'Không tìm thấy tệp' }, { status: 404 });

    await logLegalRecord({
      entityType: entityOf(table), entityId: removed.parent_id, action: 'detach',
      details: `Gỡ tệp "${removed.file_name}"`, performedBy: guard.actor.id,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/legal/files/[fileId] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
