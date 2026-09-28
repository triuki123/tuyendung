import { NextRequest, NextResponse } from 'next/server';
import { getPublicProfileBySlug } from '@/lib/services/ecardService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/public/profile/[slug] — hồ sơ năng lực PUBLIC (không cần đăng nhập).
 * 404 nếu ẩn hoặc nhân viên đã nghỉ việc (không lộ thông tin).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const slug = (params.slug || '').trim();
    if (!slug) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const profile = await getPublicProfileBySlug(slug);
    if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: profile });
  } catch (err) {
    console.error('GET /api/public/profile/[slug] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
