import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute } from '@/lib/db';
import { uploadBufferAsMedia } from '@/lib/services/mediaService';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB / file

// GET /api/tickets/[id]/attachments — danh sach metadata (khong kem noi dung).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const rows = await query(
      `SELECT id, ticket_id, file_name, mime_type, size_bytes, uploaded_by, created_at,
              description, is_internal, file_type, download_count
         FROM ticket_attachments
        WHERE ticket_id = $1
        ORDER BY created_at ASC`,
      [params.id]
    );
    return NextResponse.json({ success: true, attachments: rows, count: rows.length });
  } catch (error: any) {
    console.error('GET attachments error:', error);
    return NextResponse.json({ error: error.message || 'Lỗi server' }, { status: 500 });
  }
}

// POST /api/tickets/[id]/attachments — upload file (multipart/form-data, field "files").
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const form = await req.formData();
    const files = form.getAll('files').filter((f): f is File => f instanceof File);
    const uploadedBy = (form.get('uploaded_by') as string) || null;
    const description = (form.get('description') as string) || null;
    const isInternal = form.get('is_internal') === 'true';

    if (files.length === 0) {
      return NextResponse.json({ error: 'Không có tệp nào' }, { status: 400 });
    }

    if (!uploadedBy) {
      return NextResponse.json({ error: 'uploadedBy required' }, { status: 400 });
    }

    const saved: any[] = [];
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { error: `Tệp "${file.name}" vượt quá 10MB` },
          { status: 413 }
        );
      }

      // Extract file extension
      const fileExt = file.name.split('.').pop()?.toLowerCase() || '';

      const buffer = Buffer.from(await file.arrayBuffer());
      // Dual-write: ưu tiên MinIO (media_id), fallback BYTEA khi S3 chưa cấu hình
      const media = await uploadBufferAsMedia({
        buffer,
        mimeType: file.type || 'application/octet-stream',
        scope: 'ticket_attachments',
        originalName: file.name,
        uploaderId: uploadedBy,
        sourceId: params.id,
      });
      const row = await queryOne<any>(
        `INSERT INTO ticket_attachments
          (ticket_id, file_name, mime_type, size_bytes, content, media_id, uploaded_by, description, is_internal, file_type, download_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id, ticket_id, file_name, mime_type, size_bytes, uploaded_by, created_at, description, is_internal, file_type, download_count`,
        [
          params.id,
          file.name,
          file.type || null,
          file.size,
          media ? null : buffer,
          media ? media.id : null,
          uploadedBy,
          description,
          isInternal,
          fileExt,
          0,
        ]
      );
      if (row) saved.push(row);

      // Log audit event
      const user = await queryOne<{ name: string }>(
        'SELECT name FROM users WHERE id = $1',
        [uploadedBy]
      );
      await execute(
        `INSERT INTO ticket_audit_events
          (ticket_id, event_type, actor_id, actor_name, related_entity_id, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          params.id,
          'attachment_added',
          uploadedBy,
          user?.name || 'Unknown',
          row?.id,
          JSON.stringify({ file_name: file.name, is_internal: isInternal }),
        ]
      );
    }

    // Cap nhat metadata tom tat vao tickets.attachments de hien thi nhanh.
    const meta = await query(
      `SELECT id, file_name, mime_type, size_bytes, is_internal FROM ticket_attachments WHERE ticket_id = $1 ORDER BY created_at ASC`,
      [params.id]
    );
    await execute(`UPDATE tickets SET attachments = $1 WHERE id = $2`, [
      JSON.stringify(meta),
      params.id,
    ]);

    return NextResponse.json({ success: true, attachments: saved }, { status: 201 });
  } catch (error: any) {
    console.error('POST attachments error:', error);
    return NextResponse.json({ error: error.message || 'Lỗi server' }, { status: 500 });
  }
}
