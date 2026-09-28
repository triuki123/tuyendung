import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { uploadBufferAsMedia } from '@/lib/services/mediaService';

export const dynamic = 'force-dynamic';

function canAccess(request: NextRequest): boolean {
  const role = request.headers.get('x-current-user-role') || '';
  return ['super_admin', 'admin', 'manager'].includes(role);
}

function genId() { return `rqa_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`; }

/** GET /api/hr/requisitions/:id/attachments — danh sách đính kèm (không trả content). */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!canAccess(request)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const data = await query<{ id: string; file_name: string; mime_type: string | null; size_bytes: number | null; created_at: string }>(
      `SELECT id, file_name, mime_type, size_bytes, created_at
         FROM requisition_attachments WHERE requisition_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
      [params.id]
    );
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/hr/requisitions/:id/attachments error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST /api/hr/requisitions/:id/attachments — upload file (multipart). */
import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const POST = withRecruitmentUpdate(POSTHandler, 'Yêu cầu tuyển dụng', '/nguon-nhan-luc/yeu-cau-tuyen-dung');
async function POSTHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!canAccess(request)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const form = await request.formData();
    const file = form.get('file') as File | null;
    if (!file || file.size === 0) return NextResponse.json({ error: 'Không có file' }, { status: 400 });
    if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: 'File không được vượt quá 15MB' }, { status: 400 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const userId = request.headers.get('x-current-user-id') || null;
    // Dual-write: ưu tiên MinIO (media_id), fallback BYTEA khi S3 chưa cấu hình
    const media = await uploadBufferAsMedia({
      buffer,
      mimeType: file.type || 'application/octet-stream',
      scope: 'requisition_attachments',
      originalName: file.name,
      uploaderId: userId,
      sourceId: params.id,
    });
    const row = await queryOne<{ id: string; file_name: string; mime_type: string | null; size_bytes: number | null; created_at: string }>(
      `INSERT INTO requisition_attachments (id, requisition_id, file_name, mime_type, size_bytes, content, media_id, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, file_name, mime_type, size_bytes, created_at`,
      [genId(), params.id, file.name, file.type || null, file.size, media ? null : buffer, media ? media.id : null, userId]
    );
    return NextResponse.json({ success: true, data: row });
  } catch (err) {
    console.error('POST /api/hr/requisitions/:id/attachments error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
