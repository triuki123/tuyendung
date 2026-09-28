import { NextRequest, NextResponse } from 'next/server';
import { requireZimbraAdmin } from '@/lib/zimbra/require-zimbra-admin';
import { searchAccounts, createAccount, updateAccount } from '@/lib/services/zimbraService';
import { ZimbraError } from '@/lib/zimbra/types';
import { logActivity } from '@/lib/services/auditService';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const authResult = await requireZimbraAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const { searchParams } = new URL(req.url);
  const domain = searchParams.get('domain') ?? undefined;
  const query = searchParams.get('search') ?? undefined;
  const limit = Math.max(1, Math.min(Number(searchParams.get('limit')) || 25, 500));
  const offset = Math.max(0, Number(searchParams.get('offset')) || 0);

  try {
    const { accounts, more } = await searchAccounts({ domain, query, limit, offset });
    return NextResponse.json({ accounts, more });
  } catch (err) {
    if (err instanceof ZimbraError) {
      return NextResponse.json({ error: err.reason }, { status: 502 });
    }
    console.error('[zimbra/accounts] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireZimbraAdmin(req);
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  let body: { email: string; password?: string; displayName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { email, password, displayName } = body;
  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  try {
    const account = await createAccount({ email, password, displayName });
    await logActivity({
      action: 'zimbra_account_created',
      details: `Created ${email}`,
      adminId: userId,
    });
    return NextResponse.json({ account }, { status: 201 });
  } catch (err) {
    if (err instanceof ZimbraError) {
      if (err.code === 'ACCOUNT_EXISTS') {
        return NextResponse.json({ error: 'Account already exists' }, { status: 409 });
      }
      return NextResponse.json({ error: err.reason }, { status: 502 });
    }
    console.error('[zimbra/accounts] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const authResult = await requireZimbraAdmin(req);
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  let body: { id: string; displayName?: string; newEmail?: string; status?: string; description?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { id, displayName, newEmail, status, description } = body;
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }
  if (displayName === undefined && !newEmail && !status && description === undefined) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  try {
    const account = await updateAccount({ id, displayName, newEmail, status, description });
    const action = status ? `set status to ${status}` : 'updated';
    await logActivity({
      action: status ? 'zimbra_account_status_changed' : 'zimbra_account_updated',
      details: `${action} ${account.name}${newEmail ? ` (renamed to ${newEmail})` : ''}`,
      adminId: userId,
    });
    return NextResponse.json({ account });
  } catch (err) {
    if (err instanceof ZimbraError) {
      if (err.code === 'ACCOUNT_EXISTS') {
        return NextResponse.json({ error: 'Email đã tồn tại' }, { status: 409 });
      }
      return NextResponse.json({ error: err.reason }, { status: 502 });
    }
    console.error('[zimbra/accounts] PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
