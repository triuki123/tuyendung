import { NextRequest, NextResponse } from 'next/server';
import { sendInternalTelegramBroadcast, listInternalTelegramBroadcasts } from '@/lib/services/internalTelegramService';
import { getEmailCenterActions } from '../_perm';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** GET /api/email-center/internal-tg — lịch sử tin nhắn Telegram nội bộ (thường), dùng cho bộ lọc kênh ở tab "Đã Gửi". */
export async function GET(request: NextRequest) {
  try {
    const acts = getEmailCenterActions(request);
    if (acts === null) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!acts.includes('internal') && !acts.includes('manage')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const data = await listInternalTelegramBroadcasts();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('GET /api/email-center/internal-tg error:', error);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * POST /api/email-center/internal-tg — gửi tin nhắn Telegram nội bộ (thường, không RSVP).
 * Body: { title, content, imageUrl?, personIds: string[], targetSummary? }
 */
export async function POST(request: NextRequest) {
  try {
    const acts = getEmailCenterActions(request);
    if (acts === null) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!acts.includes('internal') && !acts.includes('manage')) {
      return NextResponse.json({ error: 'Không có quyền gửi tab Nội Bộ' }, { status: 403 });
    }
    const body = await request.json();
    const title = String(body?.title || '').trim();
    const content = String(body?.content || '').trim();
    const imageUrl = typeof body?.imageUrl === 'string' ? body.imageUrl.trim() || null : null;
    // Nhiều ảnh (album). Giữ imageUrl cho tương thích ngược.
    const imageUrls: string[] = Array.isArray(body?.imageUrls)
      ? body.imageUrls.filter((u: unknown) => typeof u === 'string' && u.trim()).map((u: string) => u.trim())
      : [];
    const personIds: string[] = Array.isArray(body?.personIds) ? body.personIds : [];
    const targetSummary = typeof body?.targetSummary === 'string' ? body.targetSummary : null;
    // Tiêu đề bắt buộc (nhãn nhận diện trong lịch sử). Nội dung CÓ THỂ rỗng nếu đã đính kèm ảnh.
    if (!title) return NextResponse.json({ error: 'Thiếu tiêu đề' }, { status: 400 });
    const hasImage = imageUrls.length > 0 || !!imageUrl;
    if (!content && !hasImage) {
      return NextResponse.json({ error: 'Nhập nội dung hoặc đính kèm ít nhất 1 ảnh' }, { status: 400 });
    }
    if (personIds.length === 0) return NextResponse.json({ error: 'Chưa chọn người nhận' }, { status: 400 });

    const sentBy = request.headers.get('x-current-user-id');
    const result = await sendInternalTelegramBroadcast({ title, content, imageUrl, imageUrls, personIds, targetSummary, sentBy });
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error('POST /api/email-center/internal-tg error:', err);
    return NextResponse.json({ error: err?.message || 'Lỗi server' }, { status: 500 });
  }
}
