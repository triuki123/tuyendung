import { NextRequest, NextResponse } from 'next/server';
import { requireZimbraAdmin } from '@/lib/zimbra/require-zimbra-admin';
import { addGroupMember, removeGroupMember, listGroupMembers } from '@/lib/services/zimbraService';
import { ZimbraError } from '@/lib/zimbra/types';
import { logActivity } from '@/lib/services/auditService';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const authResult = await requireZimbraAdmin(req);
  if (authResult instanceof NextResponse) return authResult;
  const { searchParams } = new URL(req.url);
  const dlId = searchParams.get('dlId');
  if (!dlId) return NextResponse.json({ error: 'dlId is required' }, { status: 400 });
  try {
    const members = await listGroupMembers(dlId);
    return NextResponse.json({ members });
  } catch (err) {
    if (err instanceof ZimbraError) return NextResponse.json({ error: err.reason }, { status: 502 });
    console.error('[zimbra/groups/members] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function parseBody(req: NextRequest): Promise<{ dlId: string; email: string } | NextResponse> {
  try {
    const body = await req.json();
    if (!body.dlId || !body.email) {
      return NextResponse.json({ error: 'dlId and email are required' }, { status: 400 });
    }
    return { dlId: body.dlId, email: body.email };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireZimbraAdmin(req);
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const bodyResult = await parseBody(req);
  if (bodyResult instanceof NextResponse) return bodyResult;
  const { dlId, email } = bodyResult;

  try {
    await addGroupMember(dlId, email);
    await logActivity({
      action: 'zimbra_member_added',
      details: `Added ${email} to ${dlId}`,
      adminId: userId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZimbraError) {
      return NextResponse.json({ error: err.reason }, { status: 502 });
    }
    console.error('[zimbra/groups/members] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const authResult = await requireZimbraAdmin(req);
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const bodyResult = await parseBody(req);
  if (bodyResult instanceof NextResponse) return bodyResult;
  const { dlId, email } = bodyResult;

  try {
    await removeGroupMember(dlId, email);
    await logActivity({
      action: 'zimbra_member_removed',
      details: `Removed ${email} from ${dlId}`,
      adminId: userId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZimbraError) {
      return NextResponse.json({ error: err.reason }, { status: 502 });
    }
    console.error('[zimbra/groups/members] DELETE error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
