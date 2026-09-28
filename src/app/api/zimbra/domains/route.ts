import { NextRequest, NextResponse } from 'next/server';
import { requireZimbraAdmin } from '@/lib/zimbra/require-zimbra-admin';
import { listDomains } from '@/lib/services/zimbraService';
import { ZimbraError } from '@/lib/zimbra/types';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const authResult = await requireZimbraAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const domains = await listDomains();
    return NextResponse.json({ domains });
  } catch (err) {
    if (err instanceof ZimbraError) {
      return NextResponse.json({ error: err.reason }, { status: 502 });
    }
    console.error('[zimbra/domains] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
