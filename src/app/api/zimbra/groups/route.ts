import { NextRequest, NextResponse } from 'next/server';
import { requireZimbraAdmin } from '@/lib/zimbra/require-zimbra-admin';
import { listGroups, createGroup } from '@/lib/services/zimbraService';
import { ZimbraError } from '@/lib/zimbra/types';
import { logActivity } from '@/lib/services/auditService';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const authResult = await requireZimbraAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const groups = await listGroups();
    return NextResponse.json({ groups });
  } catch (err) {
    if (err instanceof ZimbraError) {
      return NextResponse.json({ error: err.reason }, { status: 502 });
    }
    console.error('[zimbra/groups] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireZimbraAdmin(req);
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  let body: { email: string; displayName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { email, displayName } = body;
  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  try {
    const group = await createGroup({ email, displayName });
    await logActivity({
      action: 'zimbra_group_created',
      details: `Created group ${email}`,
      adminId: userId,
    });
    return NextResponse.json({ group }, { status: 201 });
  } catch (err) {
    if (err instanceof ZimbraError) {
      if (err.code === 'GROUP_EXISTS') {
        return NextResponse.json({ error: 'Nhóm đã tồn tại' }, { status: 409 });
      }
      return NextResponse.json({ error: err.reason }, { status: 502 });
    }
    console.error('[zimbra/groups] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
