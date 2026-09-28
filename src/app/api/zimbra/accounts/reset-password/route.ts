import { NextRequest, NextResponse } from 'next/server';
import { requireZimbraAdmin } from '@/lib/zimbra/require-zimbra-admin';
import { resetPassword } from '@/lib/services/zimbraService';
import { ZimbraError } from '@/lib/zimbra/types';
import { logActivity } from '@/lib/services/auditService';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const authResult = await requireZimbraAdmin(req);
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  let body: { email: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { email } = body;
  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  try {
    const result = await resetPassword(email);
    await logActivity({
      action: 'zimbra_password_reset',
      details: `Reset password for ${result.email}`,
      adminId: userId,
      // newPassword is intentionally never logged
    });
    return NextResponse.json({ email: result.email, newPassword: result.newPassword });
  } catch (err) {
    if (err instanceof ZimbraError) {
      return NextResponse.json({ error: err.reason }, { status: 502 });
    }
    console.error('[zimbra/accounts/reset-password] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
