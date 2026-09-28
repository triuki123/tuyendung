import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';
import { getMediaBuffer, softDeleteMedia } from '@/lib/services/mediaService';

export const dynamic = 'force-dynamic';

function canAccess(request: NextRequest): boolean {
  const role = request.headers.get('x-current-user-role') || '';
  return ['super_admin', 'admin', 'manager'].includes(role);
}

/** GET — tải xuống file đính kèm. */
export async function GET(request: NextRequest, { params }: { params: { id: string; attachId: string } }) {
  try {
    if (!canAccess(request)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const row = await queryOne<{ file_name: string; mime_type: string | null; content: Buffer | null; media_id: string | null }>(
      `SELECT file_name, mime_type, content, media_id FROM requisition_attachments WHERE id = $1 AND requisition_id = $2 AND deleted_at IS NULL`,
      [params.attachId, params.id]
    );
    if (!row) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    // Dual-read: ưu tiên MinIO qua media_id, fallback BYTEA cũ
    if (row.media_id) {
      const media = await getMediaBuffer(row.media_id);
      if (media) {
        return new NextResponse(new Uint8Array(media.buffer), {
          headers: {
            'Content-Type': row.mime_type || media.mimeType || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(row.file_name)}"`,
          },
        });
      }
    }
    if (!row.content) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    return new NextResponse(new Uint8Array(row.content), {
      headers: {
        'Content-Type': row.mime_type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(row.file_name)}"`,
      },
    });
  } catch (err) {
    console.error('GET /api/hr/requisitions/:id/attachments/:attachId error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE — xóa mềm file đính kèm. */
import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const DELETE = withRecruitmentUpdate(DELETEHandler, 'Yêu cầu tuyển dụng', '/nguon-nhan-luc/yeu-cau-tuyen-dung');
async function DELETEHandler(request: NextRequest, { params }: { params: { id: string; attachId: string } }) {
  try {
    if (!canAccess(request)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const rec = await queryOne<{ media_id: string | null }>(
      `SELECT media_id FROM requisition_attachments WHERE id = $1 AND requisition_id = $2`,
      [params.attachId, params.id]
    );
    await execute(`UPDATE requisition_attachments SET deleted_at = NOW() WHERE id = $1 AND requisition_id = $2`, [params.attachId, params.id]);
    // Xóa mềm media kèm theo (best-effort)
    if (rec?.media_id) {
      try { await softDeleteMedia(rec.media_id); } catch { /* bỏ qua lỗi */ }
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/hr/requisitions/:id/attachments/:attachId error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
