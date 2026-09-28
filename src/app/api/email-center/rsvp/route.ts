import { NextRequest, NextResponse } from 'next/server';
import { listRsvpEvents, listRsvpByEventKey } from '@/lib/services/rsvpService';
import { getEmailCenterActions } from '../_perm';

export const dynamic = 'force-dynamic';

/** GET /api/email-center/rsvp — list đợt RSVP (?eventKey=xxx cho chi tiết). */
export async function GET(request: NextRequest) {
  const acts = getEmailCenterActions(request);
  if (acts === null) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  if (!acts.includes('internal') && !acts.includes('manage')) {
    return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
  }
  const eventKey = request.nextUrl.searchParams.get('eventKey');
  if (eventKey) {
    const rows = await listRsvpByEventKey(eventKey);
    return NextResponse.json({ success: true, data: rows });
  }
  const events = await listRsvpEvents();
  return NextResponse.json({ success: true, data: events });
}
