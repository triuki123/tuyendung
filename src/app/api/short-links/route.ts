import { NextRequest, NextResponse } from 'next/server';
import { createShortLink, listByUser, normalizeUrl } from '@/lib/services/shortLinkService';

export const dynamic = 'force-dynamic';

/** GET: danh sách link rút gọn của chính mình */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const rows = await listByUser(userId);
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/short-links error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST: tạo link rút gọn. Body { url, title?, expiresAt? (ISO | null) } */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const body = await request.json();
    const targetUrl = normalizeUrl(body.url);
    if (!targetUrl) {
      return NextResponse.json({ error: 'Link không hợp lệ — nhập đường dẫn http/https hợp lệ' }, { status: 400 });
    }
    // Hạn dùng: chấp nhận ISO hoặc null (vĩnh viễn); phải ở tương lai
    let expiresAt: string | null = null;
    if (body.expiresAt) {
      const d = new Date(body.expiresAt);
      if (Number.isNaN(d.getTime())) return NextResponse.json({ error: 'Hạn dùng không hợp lệ' }, { status: 400 });
      if (d.getTime() <= Date.now()) return NextResponse.json({ error: 'Hạn dùng phải ở tương lai' }, { status: 400 });
      expiresAt = d.toISOString();
    }
    const link = await createShortLink({
      targetUrl,
      title: body.title || null,
      createdBy: userId,
      expiresAt,
    });
    return NextResponse.json({ success: true, data: link });
  } catch (err) {
    console.error('POST /api/short-links error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
