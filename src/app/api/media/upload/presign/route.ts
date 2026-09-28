import { NextRequest, NextResponse } from 'next/server';
import { getActorWithPerms, unauthorized } from '@/lib/apiAuth';
import { createPresignedUpload } from '@/lib/services/mediaService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/media/upload/presign — bước 1 upload trực tiếp lên MinIO (file lớn).
 * Body: { fileName, mimeType, sizeBytes, scope, sourceId?, visibility? }
 * Trả { mediaId, uploadUrl, expiresIn }; client PUT file lên uploadUrl rồi gọi
 * POST /api/media/{mediaId}/confirm. Media 'pending' không được phục vụ ở bất kỳ đâu.
 *
 * Yêu cầu đăng nhập. Quyền nghiệp vụ thật check ở bước GẮN mediaId vào record
 * nghiệp vụ (route của module đó) — media pending bỏ ngang sẽ bị cleanup job dọn.
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await getActorWithPerms(request);
    if (!actor) return unauthorized();

    const body = await request.json().catch(() => null);
    const fileName = String(body?.fileName || '').trim();
    const mimeType = String(body?.mimeType || '');
    const sizeBytes = Number(body?.sizeBytes);
    const scope = String(body?.scope || 'general').trim().replace(/[^a-zA-Z0-9_-]+/g, '_');
    if (!fileName || !mimeType || !Number.isFinite(sizeBytes)) {
      return NextResponse.json({ error: 'Thiếu fileName / mimeType / sizeBytes' }, { status: 400 });
    }

    const result = await createPresignedUpload({
      fileName,
      mimeType,
      sizeBytes,
      scope,
      uploaderId: actor.id,
      visibility: body?.visibility === 'public' ? 'public' : 'private',
      sourceId: body?.sourceId ? String(body.sourceId) : null,
    });
    if (!result) {
      // S3 chưa cấu hình — client dùng luồng upload proxy của module thay thế.
      return NextResponse.json({ error: 'Storage chưa được cấu hình' }, { status: 503 });
    }
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi server';
    // Lỗi validate từ service (size/type/tên) → 400, còn lại 500.
    const isValidation = /dung lượng|loại file|thiếu tên/i.test(msg);
    if (!isValidation) console.error('POST /api/media/upload/presign error:', err);
    return NextResponse.json({ error: isValidation ? msg : 'Lỗi server' }, { status: isValidation ? 400 : 500 });
  }
}
