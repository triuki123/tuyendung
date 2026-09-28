import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { execute, query, queryOne } from '@/lib/db';
import { uploadBufferAsMedia, resolveMediaUrl } from '@/lib/services/mediaService';
import { getEffectiveContext } from '@/lib/services/userCompanyService';
import { notify } from '@/lib/notifications/engine';

export const dynamic = 'force-dynamic';

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB, khớp giới hạn media chung của dự án
const ALLOWED_EXT = ['png','jpg','jpeg','gif','webp','svg','pdf','psd','ai','eps','sketch','fig','zip'];

type Version = {
  id: string; design_request_id: string; version_no: number; media_id: string | null;
  file_name: string | null; note: string | null; status: string; uploaded_by: string | null;
  uploaded_by_name: string | null; created_at: string;
};

async function loadRequestScoped(id: string, userId: string, companyId: string | null) {
  const ctx = await getEffectiveContext(userId, companyId);
  if (!ctx) return null;
  const row = await queryOne<{ id: string; company_id: string; requester_id: string; assignee_id: string; title: string }>(
    `SELECT id, company_id, requester_id, assignee_id, title FROM design_requests
      WHERE id = $1 AND ($2::text IS NULL OR company_id = $2)`,
    [id, ctx.role === 'super_admin' ? null : ctx.company_id]
  );
  return row ? { ctx, req: row } : null;
}

// GET — danh sách phiên bản, kèm link xem (presigned, resolve lại mỗi lần gọi — không cache).
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkUnitAccess(request, 'design-requests', 'view')) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const scoped = await loadRequestScoped(params.id, userId, request.headers.get('x-current-user-company'));
    if (!scoped) return NextResponse.json({ error: 'Không tìm thấy yêu cầu' }, { status: 404 });
    const rows = await query<Version>(
      `SELECT * FROM design_request_versions WHERE design_request_id = $1 ORDER BY version_no DESC`,
      [params.id]
    );
    const data = await Promise.all(rows.map(async (v) => ({ ...v, url: v.media_id ? await resolveMediaUrl(v.media_id) : null })));
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/design-requests/[id]/versions error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

// POST — upload phiên bản mới (multipart/form-data: file, note).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkUnitAccess(request, 'design-requests', 'edit')) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const scoped = await loadRequestScoped(params.id, userId, request.headers.get('x-current-user-company'));
    if (!scoped) return NextResponse.json({ error: 'Không tìm thấy yêu cầu' }, { status: 404 });

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Thiếu file thiết kế' }, { status: 400 });
    if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'File vượt quá 20MB' }, { status: 400 });
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_EXT.includes(ext)) return NextResponse.json({ error: `Định dạng .${ext} không được hỗ trợ. Chỉ nhận: ${ALLOWED_EXT.join(', ')}` }, { status: 400 });
    const note = String(form.get('note') || '');

    const buffer = Buffer.from(await file.arrayBuffer());
    const media = await uploadBufferAsMedia({
      buffer, mimeType: file.type || 'application/octet-stream', scope: 'design_request_versions',
      originalName: file.name, uploaderId: userId, sourceId: params.id,
    });
    if (!media) return NextResponse.json({ error: 'Object storage chưa được cấu hình, không thể lưu file' }, { status: 502 });

    const user = await queryOne<{ name: string }>('SELECT name FROM users WHERE id = $1', [userId]);
    const nextNo = await queryOne<{ next: number }>(
      `SELECT COALESCE(MAX(version_no), 0) + 1 AS next FROM design_request_versions WHERE design_request_id = $1`,
      [params.id]
    );
    const row = await queryOne<Version>(
      `INSERT INTO design_request_versions (design_request_id, version_no, media_id, file_name, note, uploaded_by, uploaded_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [params.id, nextNo?.next || 1, media.id, file.name, note || null, userId, user?.name || '']
    );

    if (row && scoped.req.requester_id) {
      await notify('design.request.version_uploaded',
        { uploaderName: user?.name || 'Người thực hiện', title: scoped.req.title, versionNo: row.version_no },
        { recipients: [scoped.req.requester_id], relatedId: params.id }).catch(() => {});
    }
    return NextResponse.json({ success: true, data: { ...row, url: await resolveMediaUrl(media.id) } });
  } catch (err) {
    console.error('POST /api/design-requests/[id]/versions error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
