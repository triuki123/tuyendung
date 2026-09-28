import { NextRequest, NextResponse } from 'next/server';
import * as announcementsService from '@/lib/services/announcementsService';

function canPost(role: string | null, permissions: string | null): boolean {
  if (role === 'super_admin' || role === 'admin') return true;
  try {
    const perms = JSON.parse(permissions ?? '{}');
    return Array.isArray(perms?.announcements) && perms.announcements.includes('create');
  } catch { return false; }
}

function canDelete(role: string | null, permissions: string | null): boolean {
  if (role === 'super_admin' || role === 'admin') return true;
  try {
    const perms = JSON.parse(permissions ?? '{}');
    return Array.isArray(perms?.announcements) && perms.announcements.includes('delete');
  } catch { return false; }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const role = request.headers.get('x-current-user-role');
    const permissions = request.headers.get('x-user-permissions');
    const search = searchParams.get('search') ?? undefined;

    // Chỉ người có quyền đăng mới thấy draft
    const publishedOnly = !canPost(role, permissions);

    const data = await announcementsService.getAllAnnouncements({ publishedOnly, search });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/announcements error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const role = request.headers.get('x-current-user-role');
    const permissions = request.headers.get('x-user-permissions');
    if (!canPost(role, permissions)) {
      return NextResponse.json({ error: 'Không có quyền đăng bài' }, { status: 403 });
    }
    const userId = request.headers.get('x-current-user-id') ?? undefined;
    const body = await request.json();

    if (!body.content) {
      return NextResponse.json({ error: 'Nội dung không được để trống' }, { status: 400 });
    }

    // Tạo và publish ngay luôn (không cần draft nữa — đăng thẳng lên wall)
    const data = await announcementsService.createAnnouncement({
      title: body.title || '',
      content: body.content,
      created_by: userId,
    });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error('POST /api/announcements error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
