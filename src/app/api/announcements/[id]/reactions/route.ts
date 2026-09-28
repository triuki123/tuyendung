import { NextRequest, NextResponse } from 'next/server';
import * as announcementsService from '@/lib/services/announcementsService';

const VALID_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

/** POST /api/announcements/[id]/reactions — toggle reaction */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const { reaction } = await request.json();
    if (!VALID_REACTIONS.includes(reaction)) {
      return NextResponse.json({ error: 'Reaction không hợp lệ' }, { status: 400 });
    }

    const result = await announcementsService.toggleReaction(params.id, userId, reaction);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('POST /api/announcements/[id]/reactions error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** GET /api/announcements/[id]/reactions — lấy reactions */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = new URL(request.url).searchParams.get('user_id') ?? undefined;
    const result = await announcementsService.getReactions(params.id, userId);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('GET /api/announcements/[id]/reactions error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
