import { NextRequest, NextResponse } from 'next/server';
import { detectConflictsForItems, detectConflictsForCandidate } from '@/lib/services/attendanceConflictService';

/**
 * POST /api/attendance/conflicts
 * 2 chế độ:
 *  - Soi danh sách (người duyệt): { items: [{ userId, date }] }
 *      → { success, data: { "userId|YYYY-MM-DD": Conflict[] } }
 *  - Pre-check khi tạo (nhân viên): { candidate: { userId, date, source, adjustmentType?, startTime?, endTime? } }
 *      → { success, data: Conflict[] }
 * date dạng YYYY-MM-DD (hoặc ISO, sẽ tự cắt).
 */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const body = await request.json().catch(() => ({}));

    // ── Chế độ pre-check: 1 món sắp tạo ──
    const cand = body?.candidate;
    if (cand && typeof cand.userId === 'string' && typeof cand.date === 'string' && (cand.source === 'adjustment' || cand.source === 'overtime')) {
      const data = await detectConflictsForCandidate({
        userId: cand.userId,
        date: cand.date,
        candidate: {
          source: cand.source,
          adjustmentType: typeof cand.adjustmentType === 'string' ? cand.adjustmentType : undefined,
          startTime: typeof cand.startTime === 'string' ? cand.startTime : undefined,
          endTime: typeof cand.endTime === 'string' ? cand.endTime : undefined,
        },
      });
      return NextResponse.json({ success: true, data });
    }

    const items = Array.isArray(body?.items) ? body.items : [];
    const clean = items
      .filter((it: unknown): it is { userId: string; date: string } =>
        !!it && typeof (it as { userId?: unknown }).userId === 'string' && typeof (it as { date?: unknown }).date === 'string')
      .map((it: { userId: string; date: string }) => ({ userId: it.userId, date: it.date }));

    if (clean.length === 0) return NextResponse.json({ success: true, data: {} });

    const data = await detectConflictsForItems(clean);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('POST /api/attendance/conflicts error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
