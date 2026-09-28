import { NextRequest, NextResponse } from 'next/server';
import { getActorWithPerms, unauthorized } from '@/lib/apiAuth';
import { confirmMediaUpload, MediaConfirmError } from '@/lib/services/mediaService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/media/[id]/confirm — bước 3 presigned upload: verify object thật trên
 * MinIO (statObject: tồn tại + size/type) rồi chuyển status 'confirmed'.
 * Idempotent — client retry khi lỗi mạng thoáng qua, không cần upload lại.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const actor = await getActorWithPerms(request);
    if (!actor) return unauthorized();

    const media = await confirmMediaUpload(params.id);
    if (!media) return NextResponse.json({ error: 'Không tìm thấy yêu cầu upload' }, { status: 404 });

    return NextResponse.json({
      success: true,
      data: {
        id: media.id,
        mimeType: media.mime_type,
        sizeBytes: Number(media.size_bytes),
        originalName: media.original_name,
        status: media.status,
      },
    });
  } catch (err) {
    if (err instanceof MediaConfirmError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
    }
    console.error('POST /api/media/[id]/confirm error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
